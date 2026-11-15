import type { AppRole, HousekeepingTask } from '../../../packages/contracts/src';

export type TaskAction =
  | { kind: 'transition'; target: 'in-progress' | 'inspection' | 'done' | 'blocked'; label: string; needsReason?: boolean }
  | { kind: 'inspect'; result: 'passed' | 'failed'; label: string }
  | { kind: 'escalate'; label: string; needsReason: true };

const canWrite = (role: AppRole) => role !== 'front-desk';
const canInspect = (role: AppRole) => role === 'owner' || role === 'manager';

/**
 * Mirrors the server state machine so clients only offer valid moves.
 * The API remains authoritative: a stale or invalid action still returns 409/403.
 */
export function availableTaskActions(task: Pick<HousekeepingTask, 'status' | 'inspectionRequired' | 'checklist'>, role: AppRole): TaskAction[] {
  if (!canWrite(role)) return [];
  const checklistDone = task.checklist.completed >= task.checklist.total;
  switch (task.status) {
    case 'ready':
      return [{ kind: 'transition', target: 'in-progress', label: 'Start turn' }];
    case 'in-progress': {
      const actions: TaskAction[] = [];
      if (checklistDone) {
        actions.push(task.inspectionRequired
          ? { kind: 'transition', target: 'inspection', label: 'Request inspection' }
          : { kind: 'transition', target: 'done', label: 'Mark room ready' });
      }
      actions.push({ kind: 'transition', target: 'blocked', label: 'Report blocker', needsReason: true });
      actions.push({ kind: 'escalate', label: 'Escalate to maintenance', needsReason: true });
      return actions;
    }
    case 'blocked':
      return [{ kind: 'transition', target: 'in-progress', label: 'Resume' }, { kind: 'escalate', label: 'Escalate to maintenance', needsReason: true }];
    case 'inspection':
      return canInspect(role)
        ? [{ kind: 'inspect', result: 'passed', label: 'Pass inspection' }, { kind: 'inspect', result: 'failed', label: 'Fail inspection' }]
        : [];
    case 'done':
      return [{ kind: 'transition', target: 'in-progress', label: 'Reopen' }];
  }
}

export const statusLabel: Record<HousekeepingTask['status'], string> = {
  ready: 'Ready to start',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  inspection: 'Awaiting inspection',
  done: 'Room ready',
};
