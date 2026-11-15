import {
  housekeepingChecklistItemSchema,
  housekeepingEscalationCommandSchema,
  housekeepingInspectionCommandSchema,
  housekeepingTaskDetailSchema,
  housekeepingTaskSchema,
  housekeepingTransitionCommandSchema,
  pageSchema,
  type HousekeepingTaskStatus,
} from '../../../packages/contracts/src';
import { HttpClient } from '@/services/http/http-client';
import type { TenantScope } from './query-keys';

export type HousekeepingListFilter = { status?: HousekeepingTaskStatus; overdue?: boolean; assigneeUserId?: string };

export class ApiHousekeepingRepository {
  constructor(private readonly http: HttpClient) {}

  private base(scope: TenantScope) { return `/v1/properties/${encodeURIComponent(scope.propertyId)}/housekeeping/tasks`; }
  private task(scope: TenantScope, taskId: string) { return `${this.base(scope)}/${encodeURIComponent(taskId)}`; }

  list(scope: TenantScope, filter: HousekeepingListFilter = {}) {
    const params = new URLSearchParams({ limit: '100' });
    if (filter.status) params.set('status', filter.status);
    if (filter.overdue !== undefined) params.set('overdue', String(filter.overdue));
    if (filter.assigneeUserId) params.set('assigneeUserId', filter.assigneeUserId);
    return this.http.request({ path: `${this.base(scope)}?${params.toString()}`, schema: pageSchema(housekeepingTaskSchema) });
  }

  get(scope: TenantScope, taskId: string) {
    return this.http.request({ path: this.task(scope, taskId), schema: housekeepingTaskDetailSchema });
  }

  transition(scope: TenantScope, taskId: string, input: { version: number; target: HousekeepingTaskStatus; reason?: string }) {
    return this.http.request({ method: 'POST', path: `${this.task(scope, taskId)}/transitions`, body: housekeepingTransitionCommandSchema.parse(input), schema: housekeepingTaskDetailSchema });
  }

  inspect(scope: TenantScope, taskId: string, input: { version: number; result: 'passed' | 'failed'; notes?: string | null }) {
    return this.http.request({ method: 'POST', path: `${this.task(scope, taskId)}/inspections`, body: housekeepingInspectionCommandSchema.parse(input), schema: housekeepingTaskDetailSchema });
  }

  escalate(scope: TenantScope, taskId: string, input: { version: number; reason: string }) {
    return this.http.request({ method: 'POST', path: `${this.task(scope, taskId)}/escalate`, body: housekeepingEscalationCommandSchema.parse(input), schema: housekeepingTaskDetailSchema });
  }

  toggleChecklistItem(scope: TenantScope, taskId: string, itemId: string, completed: boolean) {
    return this.http.request({ method: 'PATCH', path: `${this.task(scope, taskId)}/checklist/${encodeURIComponent(itemId)}`, body: { completed }, schema: housekeepingChecklistItemSchema });
  }
}
