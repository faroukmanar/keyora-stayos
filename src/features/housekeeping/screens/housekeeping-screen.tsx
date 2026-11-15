import { CheckSquare, ChevronDown, ChevronUp, Clock3, Sparkles, Square, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { AppRole, HousekeepingTask } from '../../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useHousekeepingAction, useHousekeepingTask, useHousekeepingTasks, useToggleChecklistItem } from '@/features/housekeeping/hooks/use-housekeeping';
import { availableTaskActions, statusLabel, type TaskAction } from '@/features/housekeeping/task-actions';
import { AppButton } from '@/shared/components/app-button';
import { AppHeader } from '@/shared/components/app-header';
import { AppInput } from '@/shared/components/app-input';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { formatOperationalTime } from '@/shared/i18n/format';
import { colors, radii, spacing } from '@/theme/tokens';

const statusTone: Record<HousekeepingTask['status'], 'neutral' | 'blue' | 'danger' | 'lime' | 'success'> = { ready: 'neutral', 'in-progress': 'blue', blocked: 'danger', inspection: 'lime', done: 'success' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The update failed. Refresh and try again.';

export function HousekeepingScreen() {
  const role = useAuthStore((state) => state.user?.role);
  const tasks = useHousekeepingTasks();
  const [expanded, setExpanded] = useState<string | null>(null);
  const open = (tasks.data ?? []).filter((task) => task.status !== 'done');
  const overdue = open.filter((task) => task.overdue).length;
  return <Screen tabs>
    <AppHeader eyebrow="Live service board" title="Housekeeping" />
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Sparkles size={25} color={colors.ink} /></View>
      <View style={styles.grow}>
        <AppText variant="headline">{open.length} open turns</AppText>
        <AppText style={styles.muted}>{overdue ? `${overdue} past their due window` : 'All turns inside their due window'}</AppText>
      </View>
    </View>
    {tasks.isLoading ? <ActivityIndicator accessibilityLabel="Loading housekeeping tasks" color={colors.ink} /> : null}
    {tasks.error ? <View accessibilityRole="alert" style={styles.alert}><AppText style={styles.alertText}>{errorMessage(tasks.error)}</AppText><AppButton compact tone="ghost" label="Retry" onPress={() => { void tasks.refetch(); }} /></View> : null}
    {tasks.data && tasks.data.length === 0 ? <AppText style={styles.muted}>No housekeeping tasks yet. Checkouts create room turns automatically.</AppText> : null}
    <View style={styles.list}>
      {(tasks.data ?? []).map((task) => <TaskCard key={task.id} task={task} role={role ?? 'front-desk'} expanded={expanded === task.id} onToggle={() => setExpanded(expanded === task.id ? null : task.id)} />)}
    </View>
  </Screen>;
}

function TaskCard({ task, role, expanded, onToggle }: { task: HousekeepingTask; role: AppRole; expanded: boolean; onToggle: () => void }) {
  const action = useHousekeepingAction();
  const [pending, setPending] = useState<TaskAction | null>(null);
  const [reason, setReason] = useState('');
  const actions = availableTaskActions(task, role);
  const run = async (selected: TaskAction, why?: string) => {
    try {
      await action.mutateAsync({ task, action: selected, reason: why });
      setPending(null); setReason('');
    } catch { /* surfaced through action.error */ }
  };
  const choose = (selected: TaskAction) => {
    if ('needsReason' in selected && selected.needsReason) { setPending(selected); return; }
    void run(selected);
  };
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" aria-expanded={expanded} accessibilityLabel={`${task.roomName ?? 'Room'}, ${statusLabel[task.status]}. ${expanded ? 'Hide' : 'Show'} checklist`} onPress={onToggle} style={styles.head}>
      <View style={styles.grow}>
        <View style={styles.title}>
          <AppText variant="title">{task.roomName ?? 'Room'}</AppText>
          {task.priority === 'rush' ? <StatusBadge label="Rush" tone="coral" /> : null}
          {task.overdue ? <StatusBadge label="Overdue" tone="danger" /> : null}
        </View>
        <StatusBadge label={statusLabel[task.status]} tone={statusTone[task.status]} />
      </View>
      {task.status === 'blocked' ? <TriangleAlert size={22} color={colors.danger} /> : <Clock3 size={22} color={colors.textMuted} />}
      {expanded ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
    </Pressable>
    <View style={styles.details}>
      <Detail label="ASSIGNEE" value={task.assignee?.displayName ?? 'Unassigned'} />
      <Detail label="DUE" value={task.dueAt ? formatOperationalTime(task.dueAt, 'en') : 'No window'} />
      <Detail label="CHECKLIST" value={`${task.checklist.completed}/${task.checklist.total}`} />
    </View>
    {task.blockedReason ? <AppText variant="caption" style={styles.blocker}>Blocker: {task.blockedReason}</AppText> : null}
    {task.lastChange ? <AppText variant="caption" style={styles.muted}>Updated by {task.lastChange.actorName ?? 'system'} at {formatOperationalTime(task.lastChange.at, 'en')}</AppText> : null}
    {expanded ? <Checklist taskId={task.id} editable={role !== 'front-desk' && task.status !== 'done'} /> : null}
    {pending ? <View style={styles.reason}>
      <AppInput label={pending.kind === 'escalate' ? 'What needs maintenance?' : 'What is blocking this turn?'} value={reason} onChangeText={setReason} maxLength={300} />
      <View style={styles.actions}>
        <AppButton compact tone="coral" label={pending.label} disabled={reason.trim().length < 3} loading={action.isPending} onPress={() => run(pending, reason.trim())} />
        <AppButton compact tone="ghost" label="Cancel" onPress={() => { setPending(null); setReason(''); }} />
      </View>
    </View> : actions.length ? <View style={styles.actions}>
      {actions.map((item) => <AppButton key={item.label} compact tone={item.kind === 'escalate' || (item.kind === 'inspect' && item.result === 'failed') ? 'ghost' : 'ink'} label={item.label} loading={action.isPending && action.variables?.action.label === item.label} disabled={action.isPending} onPress={() => choose(item)} />)}
    </View> : null}
    {action.error ? <AppText accessibilityRole="alert" variant="caption" style={styles.alertText}>{errorMessage(action.error)}</AppText> : null}
  </View>;
}

function Checklist({ taskId, editable }: { taskId: string; editable: boolean }) {
  const detail = useHousekeepingTask(taskId);
  const toggle = useToggleChecklistItem();
  if (detail.isLoading) return <ActivityIndicator color={colors.ink} />;
  if (detail.error) return <AppText style={styles.alertText}>{errorMessage(detail.error)}</AppText>;
  return <View style={styles.checklist}>
    {(detail.data?.checklistItems ?? []).map((item) => {
      const done = item.completedAt !== null;
      const Icon = done ? CheckSquare : Square;
      return <Pressable key={item.id} role="checkbox" aria-checked={done} aria-disabled={!editable} disabled={!editable || toggle.isPending} onPress={() => toggle.mutate({ taskId, itemId: item.id, completed: !done })} style={({ pressed }) => [styles.checkItem, pressed && styles.pressed]}>
        <Icon size={20} color={done ? colors.success : colors.textMuted} />
        <AppText style={[styles.grow, done && styles.checkDone]}>{item.label}{item.required ? '' : ' (optional)'}</AppText>
      </Pressable>;
    })}
    {toggle.error ? <AppText accessibilityRole="alert" variant="caption" style={styles.alertText}>{errorMessage(toggle.error)}</AppText> : null}
  </View>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><AppText variant="caption" style={styles.muted}>{label}</AppText><AppText variant="label">{value}</AppText></View>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 144, borderRadius: radii.xl, padding: spacing.xl, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: spacing.xs },
  muted: { color: colors.textMuted },
  list: { gap: spacing.lg },
  card: { padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.md },
  head: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  detail: { gap: 2 },
  blocker: { color: colors.danger },
  reason: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  checklist: { gap: spacing.xs, paddingVertical: spacing.xs },
  checkItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  alert: { padding: spacing.md, borderRadius: radii.md, backgroundColor: '#FFE8E4', gap: spacing.sm },
  alertText: { color: colors.danger },
  pressed: { opacity: 0.72 },
});
