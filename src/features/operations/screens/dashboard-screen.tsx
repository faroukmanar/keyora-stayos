import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowUpRight, BedDouble, LogIn, LogOut, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatMoney, occupancyRate, propertyToday } from '@/domain/operations';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useHousekeepingTasks } from '@/features/housekeeping/hooks/use-housekeeping';
import { useReservations, useRooms } from '@/features/operations/hooks/use-live-data';
import { ReservationRow } from '@/features/reservations/components/reservation-row';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { MetricCard } from '@/shared/components/metric-card';
import { QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { formatOperationalDate } from '@/shared/i18n/format';
import { colors, radii, spacing } from '@/theme/tokens';

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const rooms = useRooms();
  const reservations = useReservations();
  const tasks = useHousekeepingTasks();
  const today = propertyToday();
  const roomList = rooms.data ?? [];
  const all = reservations.data ?? [];
  const arrivals = all.filter((item) => item.status === 'confirmed' && item.checkIn === today);
  const departures = all.filter((item) => item.status === 'checked-in' && item.checkOut === today);
  const inHouse = all.filter((item) => item.status === 'checked-in');
  const active = [...arrivals, ...inHouse];
  const roomName = new Map(roomList.map((room) => [room.id, room.name]));
  const openTurns = (tasks.data ?? []).filter((task) => task.status !== 'done').length;
  const inHouseValue = inHouse.length ? formatMoney({ amountMinor: inHouse.reduce((sum, item) => sum + item.total.amountMinor, 0), currency: inHouse[0].total.currency }) : '—';
  const occupancy = occupancyRate(roomList);
  const ready = roomList.filter((room) => room.status === 'available').length;
  return <Screen tabs><AppHeader eyebrow={formatOperationalDate(new Date(), 'en', { weekday: 'long', day: 'numeric', month: 'long' })} title={`Hello, ${user?.name.split(' ')[0] ?? 'team'}`} notifications settings />
    <QueryState label="operations" isLoading={rooms.isLoading || reservations.isLoading} error={rooms.error ?? reservations.error} onRetry={() => { void rooms.refetch(); void reservations.refetch(); }} />
    <View style={styles.hero}><Image source={require('../../../../assets/images/casablanca-penthouse.webp')} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="Property" /><View style={styles.scrim} /><View style={styles.heroCopy}><AppText variant="caption" style={styles.heroKicker}>LIVE PROPERTY</AppText><AppText variant="headline" style={styles.heroTitle}>{occupancy}% occupied</AppText><AppText style={styles.heroBody}>{ready} rooms ready · {openTurns} open room turns</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Open room inventory" onPress={() => router.push('/rooms')} style={styles.heroAction}><ArrowUpRight size={22} color={colors.ink} /></Pressable></View>
    <View style={styles.metrics}><MetricCard value={`${occupancy}%`} label="Occupancy" accent={colors.lime} /><MetricCard value={inHouseValue} label="In-house stay value" /><MetricCard value={String(inHouse.length)} label="Stays in house" accent={colors.sky} /></View>
    <View style={styles.sectionHead}><View><AppText variant="caption" style={styles.muted}>TODAY · LIVE PULSE</AppText><AppText variant="title">Operations at a glance</AppText></View></View>
    <View style={styles.actions}><QuickAction icon={LogIn} value={String(arrivals.length)} label="Arrivals today" color={colors.coral} /><QuickAction icon={LogOut} value={String(departures.length)} label="Departures today" color={colors.gold} /><QuickAction icon={BedDouble} value={String(ready)} label="Ready rooms" color={colors.cobalt} /><QuickAction icon={Sparkles} value={String(openTurns)} label="Room turns" color={colors.success} /></View>
    <View style={styles.sectionHead}><AppText variant="title">Arrivals & in-house</AppText><AppText variant="caption" style={styles.muted}>{active.length} active</AppText></View>
    <View style={styles.list}>{active.length ? active.map((item) => <ReservationRow key={item.id} reservation={item} roomName={roomName.get(item.roomId)} />) : <AppText style={styles.muted}>No arrivals or in-house guests right now.</AppText>}</View>
  </Screen>;
}
function QuickAction({ icon: Icon, value, label, color }: { icon: typeof BedDouble; value: string; label: string; color: string }) { return <View style={styles.action}><View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}><Icon size={20} color={color} /></View><AppText variant="title">{value}</AppText><AppText variant="caption" style={styles.muted}>{label}</AppText></View>; }
const styles = StyleSheet.create({ hero: { minHeight: 252, borderRadius: radii.xl, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.xl }, scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(8,12,18,.47)' }, heroCopy: { gap: spacing.sm, maxWidth: 440 }, heroKicker: { color: colors.lime, letterSpacing: 1.5 }, heroTitle: { color: colors.white }, heroBody: { color: '#F2EEE6' }, heroAction: { position: 'absolute', right: spacing.lg, top: spacing.lg, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }, muted: { color: colors.textMuted }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, action: { width: '47%', minHeight: 132, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm }, actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, list: { gap: spacing.md } });
