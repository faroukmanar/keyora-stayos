import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowUpRight, BedDouble, CircleDollarSign, LogIn, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { guests } from '@/data/demo-data';
import { occupancyRate } from '@/domain/operations';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useOperationsStore } from '@/features/operations/store/operations-store';
import { ReservationRow } from '@/features/reservations/components/reservation-row';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { MetricCard } from '@/shared/components/metric-card';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const rooms = useOperationsStore((state) => state.rooms);
  const reservations = useOperationsStore((state) => state.reservations);
  const tasks = useOperationsStore((state) => state.tasks);
  const arrivals = reservations.filter((item) => item.checkIn === '2026-10-28' || item.status === 'checked-in');
  return <Screen tabs><AppHeader eyebrow="Wednesday · 28 October" title={`Good morning, ${user?.name.split(' ')[0] ?? 'team'}`} notifications />
    <View style={styles.hero}><Image source={require('../../../../assets/images/casablanca-penthouse.webp')} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="Atlantic Penthouse" /><View style={styles.scrim} /><View style={styles.heroCopy}><AppText variant="caption" style={styles.heroKicker}>LIVE PORTFOLIO</AppText><AppText variant="headline" style={styles.heroTitle}>{occupancyRate(rooms)}% occupied</AppText><AppText style={styles.heroBody}>{rooms.filter((room) => room.status === 'available').length} rooms open · {tasks.filter((task) => task.status !== 'done').length} service actions</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open room inventory" onPress={() => router.push('/rooms')} style={styles.heroAction}><ArrowUpRight size={22} color={colors.ink} /></Pressable></View>
    <View style={styles.metrics}><MetricCard value={`${occupancyRate(rooms)}%`} label="Occupancy" accent={colors.lime} /><MetricCard value="42.8K" label="Revenue · MAD" /><MetricCard value="4.8" label="Guest score" accent={colors.sky} /></View>
    <View style={styles.sectionHead}><View><AppText variant="caption" style={styles.muted}>TODAY · LIVE PULSE</AppText><AppText variant="title">Operations at a glance</AppText></View></View>
    <View style={styles.actions}><QuickAction icon={LogIn} value={String(arrivals.length)} label="Arrivals" color={colors.coral} /><QuickAction icon={BedDouble} value={String(rooms.filter((room) => room.status === 'available').length)} label="Ready rooms" color={colors.cobalt} /><QuickAction icon={Sparkles} value={String(tasks.length)} label="Room turns" color={colors.gold} /><QuickAction icon={CircleDollarSign} value={String(guests.filter((guest) => guest.vip).length)} label="VIP guests" color={colors.success} /></View>
    <View style={styles.sectionHead}><AppText variant="title">Arrivals & in-house</AppText><AppText variant="caption" style={styles.muted}>{arrivals.length} active</AppText></View><View style={styles.list}>{arrivals.map((item) => <ReservationRow key={item.id} reservation={item} />)}</View>
  </Screen>;
}
function QuickAction({ icon: Icon, value, label, color }: { icon: typeof BedDouble; value: string; label: string; color: string }) { return <View style={styles.action}><View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}><Icon size={20} color={color} /></View><AppText variant="title">{value}</AppText><AppText variant="caption" style={styles.muted}>{label}</AppText></View>; }
const styles = StyleSheet.create({ hero: { minHeight: 252, borderRadius: radii.xl, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.xl }, scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(8,12,18,.47)' }, heroCopy: { gap: spacing.sm, maxWidth: 440 }, heroKicker: { color: colors.lime, letterSpacing: 1.5 }, heroTitle: { color: colors.white }, heroBody: { color: '#F2EEE6' }, heroAction: { position: 'absolute', right: spacing.lg, top: spacing.lg, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }, muted: { color: colors.textMuted }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, action: { width: '47%', minHeight: 132, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm }, actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, list: { gap: spacing.md } });
