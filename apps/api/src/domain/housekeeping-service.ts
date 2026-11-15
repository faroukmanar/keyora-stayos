import type { PoolClient } from 'pg';
import type { Actor } from '../auth/types';
import { conflict, DomainError, emitEvent, isoTimestamp, notFound, recordAudit, staleVersion, type TenantScope } from './pg';

export type TaskStatus = 'ready' | 'in-progress' | 'blocked' | 'inspection' | 'done';
export type TaskPriority = 'normal' | 'rush';

const transitions: Record<TaskStatus, TaskStatus[]> = {
  ready: ['in-progress'],
  'in-progress': ['inspection', 'done', 'blocked'],
  blocked: ['in-progress'],
  inspection: ['in-progress'],
  done: ['in-progress'],
};

const defaultChecklist = [
  'Strip and replace linens',
  'Clean bathroom',
  'Restock amenities',
  'Vacuum and dust',
  'Final visual check',
];

type TaskRow = Record<string, unknown>;

export class HousekeepingService {
  private toTask(row: TaskRow) {
    return {
      id: String(row.id),
      roomId: String(row.room_id),
      roomName: row.room_name ? String(row.room_name) : null,
      reservationId: row.reservation_id ? String(row.reservation_id) : null,
      assignee: row.assignee_user_id ? { id: String(row.assignee_user_id), displayName: row.assignee_name ? String(row.assignee_name) : null } : null,
      status: String(row.status) as TaskStatus,
      priority: String(row.priority) as TaskPriority,
      dueAt: row.due_at ? isoTimestamp(row.due_at) : null,
      overdue: Boolean(row.due_at) && new Date(isoTimestamp(row.due_at)) < new Date() && String(row.status) !== 'done',
      inspectionRequired: Boolean(row.inspection_required),
      blockedReason: row.blocked_reason ? String(row.blocked_reason) : null,
      blockedAt: row.blocked_at ? isoTimestamp(row.blocked_at) : null,
      startedAt: row.started_at ? isoTimestamp(row.started_at) : null,
      completedAt: row.completed_at ? isoTimestamp(row.completed_at) : null,
      checklist: { total: Number(row.checklist_total ?? 0), completed: Number(row.checklist_completed ?? 0) },
      version: Number(row.version),
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
    };
  }

  private taskSelect = `
    SELECT ht.*, r.name AS room_name, u.display_name AS assignee_name,
      (SELECT count(*)::int FROM housekeeping_checklist_items c WHERE c.task_id=ht.id) AS checklist_total,
      (SELECT count(*)::int FROM housekeeping_checklist_items c WHERE c.task_id=ht.id AND c.completed_at IS NOT NULL) AS checklist_completed
    FROM housekeeping_tasks ht
    JOIN rooms r ON r.id=ht.room_id
    LEFT JOIN users u ON u.id=ht.assignee_user_id`;

  private checklistItem(row: TaskRow) {
    return {
      id: String(row.id),
      label: String(row.label),
      required: Boolean(row.required),
      sortOrder: Number(row.sort_order),
      completedAt: row.completed_at ? isoTimestamp(row.completed_at) : null,
      completedBy: row.completed_by ? String(row.completed_by) : null,
    };
  }

  private async ensureChecklist(client: PoolClient, scope: TenantScope, taskId: string) {
    const existing = await client.query('SELECT count(*)::int AS count FROM housekeeping_checklist_items WHERE task_id=$1 AND organization_id=$2 AND property_id=$3', [taskId, scope.organizationId, scope.propertyId]);
    if (Number(existing.rows[0].count) > 0) return;
    for (const [index, label] of defaultChecklist.entries()) {
      await client.query(
        'INSERT INTO housekeeping_checklist_items(organization_id, property_id, task_id, label, required, sort_order) VALUES($1,$2,$3,$4,true,$5)',
        [scope.organizationId, scope.propertyId, taskId, label, index],
      );
    }
  }

  private async checklistState(client: PoolClient, scope: TenantScope, taskId: string) {
    await this.ensureChecklist(client, scope, taskId);
    const state = await client.query(
      `SELECT count(*) FILTER (WHERE required)::int AS required, count(*) FILTER (WHERE required AND completed_at IS NOT NULL)::int AS completed
       FROM housekeeping_checklist_items WHERE task_id=$1 AND organization_id=$2 AND property_id=$3`,
      [taskId, scope.organizationId, scope.propertyId],
    );
    return { required: Number(state.rows[0].required), completed: Number(state.rows[0].completed) };
  }

  private async lastInspection(client: PoolClient, scope: TenantScope, taskId: string) {
    const result = await client.query('SELECT result FROM housekeeping_inspections WHERE task_id=$1 AND organization_id=$2 AND property_id=$3 ORDER BY created_at DESC LIMIT 1', [taskId, scope.organizationId, scope.propertyId]);
    return result.rowCount ? String(result.rows[0].result) : null;
  }

  private async roomStatusAfterCleaning(client: PoolClient, scope: TenantScope, roomId: string) {
    const busy = await client.query(
      `SELECT 1 FROM maintenance_blocks WHERE room_id=$1 AND organization_id=$2 AND property_id=$3 AND status='active'
       UNION ALL
       SELECT 1 FROM reservations WHERE room_id=$1 AND organization_id=$2 AND property_id=$3 AND status='checked-in' LIMIT 1`,
      [roomId, scope.organizationId, scope.propertyId],
    );
    if (!busy.rowCount) {
      await client.query("UPDATE rooms SET status='available', version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND status <> 'maintenance'", [roomId, scope.organizationId, scope.propertyId]);
    }
  }

  private async setRoomCleaning(client: PoolClient, scope: TenantScope, roomId: string) {
    await client.query("UPDATE rooms SET status='cleaning', version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND status <> 'maintenance'", [roomId, scope.organizationId, scope.propertyId]);
  }

  async list(client: PoolClient, query: { limit: number; cursor?: number; status?: TaskStatus; priority?: TaskPriority; roomId?: string; assigneeUserId?: string; overdue?: boolean }) {
    const offset = query.cursor ? Math.max(0, query.cursor - 1) : 0;
    const values: unknown[] = [];
    const where = ['true'];
    if (query.status) { values.push(query.status); where.push(`ht.status=$${values.length}`); }
    if (query.priority) { values.push(query.priority); where.push(`ht.priority=$${values.length}`); }
    if (query.roomId) { values.push(query.roomId); where.push(`ht.room_id=$${values.length}`); }
    if (query.assigneeUserId) { values.push(query.assigneeUserId); where.push(`ht.assignee_user_id=$${values.length}`); }
    if (query.overdue !== undefined) {
      where.push(query.overdue
        ? "(ht.due_at IS NOT NULL AND ht.due_at < now() AND ht.status <> 'done')"
        : "(ht.due_at IS NULL OR ht.due_at >= now() OR ht.status = 'done')");
    }
    values.push(query.limit + 1, offset);
    const result = await client.query(
      `${this.taskSelect} WHERE ${where.join(' AND ')}
       ORDER BY CASE ht.priority WHEN 'rush' THEN 0 ELSE 1 END, ht.due_at NULLS LAST, ht.created_at
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const rows = result.rows.map((row) => this.toTask(row));
    return { data: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? String(offset + query.limit + 1) : null };
  }

  async recordSla(client: PoolClient, metrics: { taskSla: { set: (labels: { priority: string }, value: number) => void } }) {
    const result = await client.query("SELECT priority, extract(epoch FROM now() - min(created_at))::int AS age FROM housekeeping_tasks WHERE status <> 'done' GROUP BY priority");
    for (const row of result.rows) metrics.taskSla.set({ priority: String(row.priority) }, Math.max(0, Number(row.age)));
  }

  async get(client: PoolClient, scope: TenantScope, taskId: string) {
    const result = await client.query(`${this.taskSelect} WHERE ht.id=$1 AND ht.organization_id=$2 AND ht.property_id=$3`, [taskId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Housekeeping task');
    const task = this.toTask(result.rows[0]);
    if (task.status !== 'done') await this.ensureChecklist(client, scope, taskId);
    const [checklist, inspections] = await Promise.all([
      client.query('SELECT * FROM housekeeping_checklist_items WHERE task_id=$1 AND organization_id=$2 AND property_id=$3 ORDER BY sort_order, created_at', [taskId, scope.organizationId, scope.propertyId]),
      client.query('SELECT * FROM housekeeping_inspections WHERE task_id=$1 AND organization_id=$2 AND property_id=$3 ORDER BY created_at DESC LIMIT 5', [taskId, scope.organizationId, scope.propertyId]),
    ]);
    const items = checklist.rows.map((row) => this.checklistItem(row));
    return {
      ...task,
      checklist: { total: items.length, completed: items.filter((item) => item.completedAt !== null).length },
      checklistItems: items,
      inspections: inspections.rows.map((row) => ({
        id: String(row.id), result: String(row.result), notes: row.notes ? String(row.notes) : null,
        inspectorUserId: row.inspector_user_id ? String(row.inspector_user_id) : null, createdAt: isoTimestamp(row.created_at),
      })),
    };
  }

  async create(client: PoolClient, scope: TenantScope, actor: Actor, input: { roomId: string; priority: TaskPriority; dueAt?: string | null; assigneeUserId?: string | null; inspectionRequired?: boolean }, requestId: string) {
    const room = await client.query('SELECT 1 FROM rooms WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL', [input.roomId, scope.organizationId, scope.propertyId]);
    if (!room.rowCount) throw new DomainError(422, 'ROOM_INVALID', 'The room is not active in this property.');
    if (input.assigneeUserId) await this.assertAssignable(client, scope, input.assigneeUserId);
    const result = await client.query(
      `INSERT INTO housekeeping_tasks(organization_id, property_id, room_id, assignee_user_id, status, priority, due_at, inspection_required)
       VALUES($1,$2,$3,$4,'ready',$5,$6,$7) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.roomId, input.assigneeUserId ?? null, input.priority, input.dueAt ?? null, input.inspectionRequired ?? input.priority === 'rush'],
    );
    const taskId = String(result.rows[0].id);
    await this.ensureChecklist(client, scope, taskId);
    await emitEvent(client, scope, { type: 'housekeeping.task.created', entityType: 'housekeeping_task', entityId: taskId, payload: { roomId: input.roomId, status: 'ready', priority: input.priority, actorId: actor.id, at: new Date().toISOString() } });
    await recordAudit(client, { scope, actor, category: 'operations', action: 'housekeeping.task_created', entityType: 'housekeeping_task', entityId: taskId, requestId, metadata: { roomId: input.roomId, priority: input.priority } });
    return this.get(client, scope, taskId);
  }

  private async assertAssignable(client: PoolClient, scope: TenantScope, userId: string) {
    const user = await client.query('SELECT 1 FROM user_property_roles WHERE user_id=$1 AND organization_id=$2 AND property_id=$3', [userId, scope.organizationId, scope.propertyId]);
    if (!user.rowCount) throw new DomainError(422, 'ASSIGNEE_INVALID', 'The assignee has no role in this property.');
  }

  private async lockTask(client: PoolClient, scope: TenantScope, taskId: string) {
    const result = await client.query('SELECT * FROM housekeeping_tasks WHERE id=$1 AND organization_id=$2 AND property_id=$3 FOR UPDATE', [taskId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Housekeeping task');
    return result.rows[0];
  }

  async assign(client: PoolClient, scope: TenantScope, actor: Actor, taskId: string, version: number, assigneeUserId: string | null, requestId: string) {
    const task = await this.lockTask(client, scope, taskId);
    if (Number(task.version) !== version) throw staleVersion();
    if (String(task.status) === 'done') throw conflict('TASK_CLOSED', 'A completed task cannot be reassigned.');
    if (assigneeUserId) await this.assertAssignable(client, scope, assigneeUserId);
    await client.query('UPDATE housekeeping_tasks SET assignee_user_id=$4, version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3', [taskId, scope.organizationId, scope.propertyId, assigneeUserId]);
    await emitEvent(client, scope, { type: 'housekeeping.task.assigned', entityType: 'housekeeping_task', entityId: taskId, payload: { assigneeUserId, actorId: actor.id, at: new Date().toISOString() } });
    await recordAudit(client, { scope, actor, category: 'operations', action: 'housekeeping.task_assigned', entityType: 'housekeeping_task', entityId: taskId, requestId, metadata: { assigneeUserId } });
    return this.get(client, scope, taskId);
  }

  async addChecklistItem(client: PoolClient, scope: TenantScope, actor: Actor, taskId: string, input: { label: string; required: boolean }, requestId: string) {
    const task = await this.lockTask(client, scope, taskId);
    if (String(task.status) === 'done') throw conflict('TASK_CLOSED', 'A completed task cannot change its checklist.');
    const count = await client.query('SELECT count(*)::int AS count, COALESCE(max(sort_order), -1)::int AS last FROM housekeeping_checklist_items WHERE task_id=$1 AND organization_id=$2 AND property_id=$3', [taskId, scope.organizationId, scope.propertyId]);
    if (Number(count.rows[0].count) >= 50) throw conflict('CHECKLIST_FULL', 'A task can have at most 50 checklist items.');
    const result = await client.query(
      'INSERT INTO housekeeping_checklist_items(organization_id, property_id, task_id, label, required, sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [scope.organizationId, scope.propertyId, taskId, input.label, input.required, Number(count.rows[0].last) + 1],
    );
    await client.query('UPDATE housekeeping_tasks SET version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3', [taskId, scope.organizationId, scope.propertyId]);
    await emitEvent(client, scope, { type: 'housekeeping.checklist.updated', entityType: 'housekeeping_task', entityId: taskId, payload: { actorId: actor.id, at: new Date().toISOString() } });
    await recordAudit(client, { scope, actor, category: 'operations', action: 'housekeeping.checklist_item_added', entityType: 'housekeeping_task', entityId: taskId, requestId });
    return this.checklistItem(result.rows[0]);
  }

  async toggleChecklistItem(client: PoolClient, scope: TenantScope, actor: Actor, taskId: string, itemId: string, completed: boolean, requestId: string) {
    const task = await this.lockTask(client, scope, taskId);
    if (String(task.status) === 'done') throw conflict('TASK_CLOSED', 'A completed task cannot change its checklist.');
    const result = await client.query(
      `UPDATE housekeeping_checklist_items SET completed_at=CASE WHEN $4 THEN now() ELSE NULL END, completed_by=CASE WHEN $4 THEN $5::uuid ELSE NULL END
       WHERE id=$1 AND task_id=$2 AND organization_id=$3 AND property_id=$6 RETURNING *`,
      [itemId, taskId, scope.organizationId, completed, actor.id, scope.propertyId],
    );
    if (!result.rowCount) throw notFound('Checklist item');
    await client.query('UPDATE housekeeping_tasks SET version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3', [taskId, scope.organizationId, scope.propertyId]);
    await emitEvent(client, scope, { type: 'housekeeping.checklist.updated', entityType: 'housekeeping_task', entityId: taskId, payload: { itemId, completed, actorId: actor.id, at: new Date().toISOString() } });
    await recordAudit(client, { scope, actor, category: 'operations', action: 'housekeeping.checklist_item_updated', entityType: 'housekeeping_task', entityId: taskId, requestId, metadata: { itemId, completed } });
    return this.checklistItem(result.rows[0]);
  }

  async transition(client: PoolClient, scope: TenantScope, actor: Actor, taskId: string, version: number, target: TaskStatus, reason: string | undefined, requestId: string) {
    const task = await this.lockTask(client, scope, taskId);
    if (Number(task.version) !== version) throw staleVersion();
    const from = String(task.status) as TaskStatus;
    if (!transitions[from].includes(target)) throw conflict('INVALID_TRANSITION', `A ${from} task cannot move to ${target}.`);
    const roomId = String(task.room_id);
    if (target === 'inspection' || target === 'done') {
      const checklist = await this.checklistState(client, scope, taskId);
      if (checklist.completed < checklist.required) throw conflict('CHECKLIST_INCOMPLETE', 'Complete all required checklist items first.');
    }
    if (target === 'done') {
      const needsInspection = Boolean(task.inspection_required) || (await this.lastInspection(client, scope, taskId)) === 'failed';
      if (needsInspection) throw conflict('INSPECTION_REQUIRED', 'Record a passed inspection before completing this task.');
    }
    if (target === 'blocked' && (!reason || reason.trim().length < 3)) throw new DomainError(422, 'BLOCKER_REQUIRED', 'Describe the blocker to pause this task.');

    if (target === 'in-progress') {
      await client.query(
        `UPDATE housekeeping_tasks SET status='in-progress', blocked_reason=NULL, blocked_at=NULL, blocked_by=NULL,
           started_at=COALESCE(started_at, now()), completed_at=NULL, completed_by=NULL, version=version+1, updated_at=now()
         WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
        [taskId, scope.organizationId, scope.propertyId],
      );
      if (from === 'done') await this.setRoomCleaning(client, scope, roomId);
    } else if (target === 'blocked') {
      await client.query(
        `UPDATE housekeeping_tasks SET status='blocked', blocked_reason=$4, blocked_at=now(), blocked_by=$5, version=version+1, updated_at=now()
         WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
        [taskId, scope.organizationId, scope.propertyId, reason!.trim(), actor.id],
      );
    } else if (target === 'done') {
      await client.query(
        `UPDATE housekeeping_tasks SET status='done', completed_at=now(), completed_by=$4, blocked_reason=NULL, blocked_at=NULL, blocked_by=NULL, version=version+1, updated_at=now()
         WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
        [taskId, scope.organizationId, scope.propertyId, actor.id],
      );
      await this.roomStatusAfterCleaning(client, scope, roomId);
    } else {
      await client.query(
        `UPDATE housekeeping_tasks SET status=$4, version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
        [taskId, scope.organizationId, scope.propertyId, target],
      );
    }
    await emitEvent(client, scope, {
      type: `housekeeping.task.${target}`, entityType: 'housekeeping_task', entityId: taskId,
      payload: { roomId, from, to: target, actorId: actor.id, at: new Date().toISOString(), reopened: from === 'done' },
    });
    await recordAudit(client, { scope, actor, category: 'operations', action: `housekeeping.task_${target}`, entityType: 'housekeeping_task', entityId: taskId, requestId, metadata: { from, to: target, roomId } });
    return this.get(client, scope, taskId);
  }

  async inspect(client: PoolClient, scope: TenantScope, actor: Actor, taskId: string, version: number, input: { result: 'passed' | 'failed'; notes?: string | null }, requestId: string) {
    const task = await this.lockTask(client, scope, taskId);
    if (Number(task.version) !== version) throw staleVersion();
    if (String(task.status) !== 'inspection') throw conflict('INVALID_TRANSITION', 'Only tasks awaiting inspection can be inspected.');
    const roomId = String(task.room_id);
    const inspection = await client.query(
      'INSERT INTO housekeeping_inspections(organization_id, property_id, task_id, inspector_user_id, result, notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, created_at',
      [scope.organizationId, scope.propertyId, taskId, actor.id, input.result, input.notes ?? null],
    );
    if (input.result === 'passed') {
      await client.query(
        `UPDATE housekeeping_tasks SET status='done', completed_at=now(), completed_by=$4, version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
        [taskId, scope.organizationId, scope.propertyId, actor.id],
      );
      await this.roomStatusAfterCleaning(client, scope, roomId);
    } else {
      await client.query(
        `UPDATE housekeeping_tasks SET status='in-progress', version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
        [taskId, scope.organizationId, scope.propertyId],
      );
      await this.setRoomCleaning(client, scope, roomId);
    }
    await emitEvent(client, scope, {
      type: `housekeeping.task.inspection_${input.result}`, entityType: 'housekeeping_task', entityId: taskId,
      payload: { roomId, result: input.result, actorId: actor.id, at: new Date().toISOString() },
    });
    await recordAudit(client, { scope, actor, category: 'operations', action: `housekeeping.inspection_${input.result}`, entityType: 'housekeeping_task', entityId: taskId, requestId, metadata: { roomId, result: input.result } });
    return { ...(await this.get(client, scope, taskId)), inspection: { id: String(inspection.rows[0].id), result: input.result, createdAt: isoTimestamp(inspection.rows[0].created_at) } };
  }

  async escalate(client: PoolClient, scope: TenantScope, actor: Actor, taskId: string, version: number, reason: string, requestId: string) {
    const task = await this.lockTask(client, scope, taskId);
    if (Number(task.version) !== version) throw staleVersion();
    if (String(task.status) === 'done') throw conflict('TASK_CLOSED', 'A completed task cannot be escalated.');
    const roomId = String(task.room_id);
    const active = await client.query("SELECT 1 FROM maintenance_blocks WHERE room_id=$1 AND organization_id=$2 AND property_id=$3 AND status='active'", [roomId, scope.organizationId, scope.propertyId]);
    if (active.rowCount) throw conflict('MAINTENANCE_ACTIVE', 'This room already has an active maintenance block.');
    const block = await client.query(
      `INSERT INTO maintenance_blocks(organization_id, property_id, room_id, reason, starts_at, ends_at, created_by, housekeeping_task_id)
       VALUES($1,$2,$3,$4,now(),now() + interval '7 days',$5,$6) RETURNING id`,
      [scope.organizationId, scope.propertyId, roomId, reason.trim(), actor.id, taskId],
    );
    await client.query("UPDATE rooms SET status='maintenance', version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3", [roomId, scope.organizationId, scope.propertyId]);
    await client.query(
      `UPDATE housekeeping_tasks SET status='blocked', blocked_reason=$4, blocked_at=now(), blocked_by=$5, version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
      [taskId, scope.organizationId, scope.propertyId, reason.trim(), actor.id],
    );
    await emitEvent(client, scope, {
      type: 'housekeeping.task.escalated', entityType: 'housekeeping_task', entityId: taskId,
      payload: { roomId, maintenanceBlockId: String(block.rows[0].id), actorId: actor.id, at: new Date().toISOString() },
    });
    await recordAudit(client, { scope, actor, category: 'operations', action: 'housekeeping.task_escalated', entityType: 'housekeeping_task', entityId: taskId, requestId, metadata: { roomId, maintenanceBlockId: String(block.rows[0].id) } });
    return this.get(client, scope, taskId);
  }
}
