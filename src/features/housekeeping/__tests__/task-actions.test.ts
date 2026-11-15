import { availableTaskActions } from '@/features/housekeeping/task-actions';

const task = (status: 'ready' | 'in-progress' | 'blocked' | 'inspection' | 'done', overrides: { inspectionRequired?: boolean; completed?: number } = {}) => ({
  status,
  inspectionRequired: overrides.inspectionRequired ?? false,
  checklist: { total: 5, completed: overrides.completed ?? 0 },
});
const labels = (actions: ReturnType<typeof availableTaskActions>) => actions.map((action) => action.label);

describe('availableTaskActions', () => {
  it('offers nothing to read-only front desk staff', () => {
    for (const status of ['ready', 'in-progress', 'blocked', 'inspection', 'done'] as const) {
      expect(availableTaskActions(task(status, { completed: 5 }), 'front-desk')).toEqual([]);
    }
  });

  it('only allows completion once the checklist is complete', () => {
    expect(labels(availableTaskActions(task('in-progress', { completed: 4 }), 'housekeeping'))).toEqual(['Report blocker', 'Escalate to maintenance']);
    expect(labels(availableTaskActions(task('in-progress', { completed: 5 }), 'housekeeping'))).toEqual(['Mark room ready', 'Report blocker', 'Escalate to maintenance']);
  });

  it('routes inspection-required tasks through inspection instead of done', () => {
    const actions = availableTaskActions(task('in-progress', { completed: 5, inspectionRequired: true }), 'housekeeping');
    expect(actions[0]).toEqual({ kind: 'transition', target: 'inspection', label: 'Request inspection' });
    expect(actions.some((action) => action.kind === 'transition' && action.target === 'done')).toBe(false);
  });

  it('reserves inspection results for owners and managers', () => {
    expect(availableTaskActions(task('inspection', { completed: 5 }), 'housekeeping')).toEqual([]);
    expect(labels(availableTaskActions(task('inspection', { completed: 5 }), 'manager'))).toEqual(['Pass inspection', 'Fail inspection']);
    expect(labels(availableTaskActions(task('inspection', { completed: 5 }), 'owner'))).toEqual(['Pass inspection', 'Fail inspection']);
  });

  it('requires a reason for blockers and escalations', () => {
    const actions = availableTaskActions(task('in-progress'), 'housekeeping');
    expect(actions.filter((action) => 'needsReason' in action && action.needsReason).map((action) => action.label)).toEqual(['Report blocker', 'Escalate to maintenance']);
  });

  it('supports start, resume, and reopen flows', () => {
    expect(labels(availableTaskActions(task('ready'), 'housekeeping'))).toEqual(['Start turn']);
    expect(labels(availableTaskActions(task('blocked'), 'housekeeping'))).toEqual(['Resume', 'Escalate to maintenance']);
    expect(labels(availableTaskActions(task('done', { completed: 5 }), 'manager'))).toEqual(['Reopen']);
  });
});
