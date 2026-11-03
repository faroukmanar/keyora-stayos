import { AlertTriangle, CheckCircle2, Clock3, Plus, Wrench } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { rooms } from '@/data/demo-data';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

type MaintenanceStatus = 'open' | 'in-progress' | 'resolved';
type MaintenanceItem = { id: string; roomId: string; title: string; owner: string; age: string; priority: 'urgent' | 'standard'; status: MaintenanceStatus };
const initialItems: MaintenanceItem[] = [
  { id: 'MX-204', roomId: 'rabat', title: 'Air conditioning inspection', owner: 'Youssef', age: '18 min', priority: 'urgent', status: 'in-progress' },
  { id: 'MX-203', roomId: 'dorm', title: 'Replace locker hinge', owner: 'Imane', age: '1 h', priority: 'standard', status: 'open' },
  { id: 'MX-201', roomId: 'atlas', title: 'Courtyard light calibration', owner: 'Amine', age: 'Yesterday', priority: 'standard', status: 'resolved' },
];

export function MaintenanceScreen() {
  const [items, setItems] = useState(initialItems);
  const resolve = (id: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, status: 'resolved' } : item));
  const create = () => setItems((current) => [{ id: `MX-${205 + current.length}`, roomId: 'fez', title: 'New inspection request', owner: 'Unassigned', age: 'Just now', priority: 'standard', status: 'open' }, ...current]);
  return <Screen tabs><AppHeader eyebrow="Engineering desk" title="Maintenance" notifications />
    <View style={styles.metrics}><Metric icon={AlertTriangle} value={String(items.filter((item) => item.priority === 'urgent' && item.status !== 'resolved').length)} label="Urgent" color={colors.coral} /><Metric icon={Clock3} value={String(items.filter((item) => item.status === 'in-progress').length)} label="In progress" color={colors.cobalt} /><Metric icon={CheckCircle2} value={String(items.filter((item) => item.status === 'resolved').length)} label="Resolved" color={colors.success} /></View>
    <View style={styles.heading}><View><AppText variant="title">Work orders</AppText><AppText style={styles.muted}>Room-impacting issues stay visible until verified.</AppText></View><Pressable accessibilityRole="button" onPress={create} style={styles.newAction}><Plus size={18} color={colors.white} /><AppText variant="label" style={styles.actionText}>New work order</AppText></Pressable></View>
    <View style={styles.list}>{items.map((item) => { const room = rooms.find((entry) => entry.id === item.roomId); return <View key={item.id} style={styles.card}><View style={[styles.icon, item.priority === 'urgent' && styles.iconUrgent]}><Wrench size={20} color={item.priority === 'urgent' ? colors.danger : colors.cobalt} /></View><View style={styles.grow}><View style={styles.itemTitle}><AppText variant="label">{item.title}</AppText><StatusBadge label={item.status} tone={item.status === 'resolved' ? 'success' : item.priority === 'urgent' ? 'danger' : 'neutral'} /></View><AppText variant="caption" style={styles.muted}>{item.id} · {room?.name} · {item.owner} · {item.age}</AppText></View>{item.status !== 'resolved' ? <Pressable accessibilityRole="button" accessibilityLabel={`Resolve ${item.id}`} onPress={() => resolve(item.id)} style={styles.resolve}><CheckCircle2 size={17} color={colors.success} /><AppText variant="label" style={styles.resolveText}>Resolve</AppText></Pressable> : null}</View>; })}</View>
  </Screen>;
}
function Metric({ icon: Icon, value, label, color }: { icon: typeof AlertTriangle; value: string; label: string; color: string }) { return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}><Icon size={20} color={color} /></View><View><AppText variant="title">{value}</AppText><AppText variant="caption" style={styles.muted}>{label}</AppText></View></View>; }
const styles = StyleSheet.create({ metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, metric: { minWidth: 180, flex: 1, minHeight: 92, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, metricIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, muted: { color: colors.textMuted }, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, newAction: { minHeight: 46, paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.cobalt, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, actionText: { color: colors.white }, list: { gap: spacing.sm }, card: { minHeight: 82, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }, icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, iconUrgent: { backgroundColor: '#FFE7E2' }, grow: { flex: 1, minWidth: 220, gap: 4 }, itemTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, resolve: { minHeight: 42, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: '#B8DEC9', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, resolveText: { color: colors.success }, });
