import { AlertTriangle, CheckCircle2, Plus, Wrench, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useCreateMaintenance, useMaintenanceBlocks, useReleaseMaintenance, useRooms } from '@/features/operations/hooks/use-live-data';
import { AppButton } from '@/shared/components/app-button';
import { AppHeader } from '@/shared/components/app-header';
import { AppInput } from '@/shared/components/app-input';
import { AppText } from '@/shared/components/app-text';
import { InlineError, QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { formatOperationalDate } from '@/shared/i18n/format';
import { colors, radii, spacing } from '@/theme/tokens';

const DAY = 86_400_000;

export function MaintenanceScreen() {
  const role = useAuthStore((state) => state.user?.role);
  const canWrite = role === 'owner' || role === 'manager' || role === 'front-desk';
  const blocks = useMaintenanceBlocks();
  const rooms = useRooms();
  const create = useCreateMaintenance();
  const release = useReleaseMaintenance();
  const [formOpen, setFormOpen] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('1');
  const roomName = new Map((rooms.data ?? []).map((room) => [room.id, room.name]));
  const list = blocks.data ?? [];
  // Evaluate overdue against the fetch time so render stays pure.
  const now = blocks.dataUpdatedAt;
  const active = list.filter((block) => block.status === 'active');
  const overdue = active.filter((block) => Date.parse(block.endsAt) < now);
  const submit = async () => {
    const duration = Number(days);
    if (!roomId || reason.trim().length < 3 || !Number.isInteger(duration) || duration < 1 || duration > 90) return;
    const startsAt = new Date();
    try {
      await create.mutateAsync({ roomId, reason: reason.trim(), startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + duration * DAY).toISOString() });
      setFormOpen(false); setRoomId(null); setReason(''); setDays('1');
    } catch { /* surfaced through create.error */ }
  };
  return <Screen tabs><AppHeader eyebrow="Engineering desk" title="Maintenance" notifications />
    <View style={styles.metrics}><Metric icon={Wrench} value={String(active.length)} label="Rooms blocked" color={colors.cobalt} /><Metric icon={AlertTriangle} value={String(overdue.length)} label="Past planned end" color={colors.coral} /><Metric icon={CheckCircle2} value={String(list.length - active.length)} label="Released" color={colors.success} /></View>
    <View style={styles.heading}><View style={styles.grow}><AppText variant="title">Maintenance blocks</AppText><AppText style={styles.muted}>A blocked room cannot be sold until it is released.</AppText></View>{canWrite ? <AppButton compact tone={formOpen ? 'ghost' : 'ink'} icon={formOpen ? X : Plus} label={formOpen ? 'Close' : 'Block a room'} onPress={() => setFormOpen((value) => !value)} /> : null}</View>
    {formOpen ? <View style={styles.form}>
      <AppText variant="label">Room</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(rooms.data ?? []).filter((room) => room.status !== 'maintenance').map((room) => <Pressable key={room.id} role="radio" aria-checked={roomId === room.id} onPress={() => setRoomId(room.id)} style={[styles.chip, roomId === room.id && styles.chipActive]}><AppText variant="caption" style={roomId === room.id ? styles.chipTextActive : styles.muted}>{room.name}</AppText></Pressable>)}</ScrollView>
      <AppInput label="Reason" value={reason} onChangeText={setReason} maxLength={300} placeholder="Air conditioning repair" />
      <AppInput label="Planned duration (days)" value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={2} />
      <AppButton label="Create block" loading={create.isPending} disabled={!roomId || reason.trim().length < 3} onPress={submit} />
      <InlineError error={create.error} />
    </View> : null}
    <QueryState label="maintenance blocks" isLoading={blocks.isLoading} error={blocks.error} onRetry={() => { void blocks.refetch(); }} />
    <InlineError error={release.error} />
    <View style={styles.list}>{list.map((block) => {
      const isActive = block.status === 'active';
      const late = isActive && Date.parse(block.endsAt) < now;
      return <View key={block.id} style={styles.card}>
        <View style={[styles.icon, late && styles.iconUrgent]}><Wrench size={20} color={late ? colors.danger : colors.cobalt} /></View>
        <View style={styles.grow}><View style={styles.itemTitle}><AppText variant="label">{block.reason}</AppText><StatusBadge label={late ? 'overdue' : block.status} tone={!isActive ? 'success' : late ? 'danger' : 'neutral'} /></View><AppText variant="caption" style={styles.muted}>{roomName.get(block.roomId) ?? 'Room'} · {formatOperationalDate(block.startsAt, 'en', { day: 'numeric', month: 'short' })} → {formatOperationalDate(block.endsAt, 'en', { day: 'numeric', month: 'short' })}</AppText></View>
        {isActive && canWrite ? <Pressable accessibilityRole="button" accessibilityLabel={`Release ${roomName.get(block.roomId) ?? 'room'}`} disabled={release.isPending} onPress={() => release.mutate(block.id)} style={styles.resolve}><CheckCircle2 size={17} color={colors.success} /><AppText variant="label" style={styles.resolveText}>Release</AppText></Pressable> : null}
      </View>;
    })}</View>
    {blocks.data && !list.length ? <AppText style={styles.muted}>No maintenance blocks.</AppText> : null}
  </Screen>;
}
function Metric({ icon: Icon, value, label, color }: { icon: typeof AlertTriangle; value: string; label: string; color: string }) { return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}><Icon size={20} color={color} /></View><View><AppText variant="title">{value}</AppText><AppText variant="caption" style={styles.muted}>{label}</AppText></View></View>; }
const styles = StyleSheet.create({ metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, metric: { minWidth: 180, flex: 1, minHeight: 92, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, metricIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, muted: { color: colors.textMuted }, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, form: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.sky, gap: spacing.md }, chips: { gap: spacing.sm }, chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, chipActive: { backgroundColor: colors.ink, borderColor: colors.ink }, chipTextActive: { color: colors.white }, list: { gap: spacing.sm }, card: { minHeight: 82, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }, icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, iconUrgent: { backgroundColor: '#FFE7E2' }, grow: { flex: 1, minWidth: 220, gap: 4 }, itemTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, resolve: { minHeight: 42, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: '#B8DEC9', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, resolveText: { color: colors.success } });
