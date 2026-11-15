import { CalendarRange } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { addDays, propertyToday, rangesOverlap } from '@/domain/operations';
import { useReservations, useRooms } from '@/features/operations/hooks/use-live-data';
import { ReservationRow } from '@/features/reservations/components/reservation-row';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { formatOperationalDate } from '@/shared/i18n/format';
import { colors, radii, spacing } from '@/theme/tokens';

const noon = (day: string) => `${day}T12:00:00Z`;

export function CalendarScreen() {
  const today = propertyToday();
  const [selected, setSelected] = useState(today);
  const reservations = useReservations();
  const rooms = useRooms();
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index - 1));
  const roomName = new Map((rooms.data ?? []).map((room) => [room.id, room.name]));
  const holding = (reservations.data ?? []).filter((item) => item.status === 'confirmed' || item.status === 'checked-in');
  const onDay = holding.filter((item) => rangesOverlap(selected, addDays(selected, 1), item.checkIn, item.checkOut) || item.checkOut === selected);
  const arrivals = onDay.filter((item) => item.checkIn === selected).length;
  const departures = onDay.filter((item) => item.checkOut === selected).length;
  const occupiedRooms = new Set(onDay.filter((item) => item.checkOut !== selected).map((item) => item.roomId)).size;
  const occupancy = rooms.data?.length ? Math.round((occupiedRooms / rooms.data.length) * 100) : 0;
  return <Screen tabs><AppHeader eyebrow={formatOperationalDate(noon(selected), 'en', { month: 'long', year: 'numeric' })} title="Stay calendar" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>{days.map((day) => {
      const active = day === selected;
      return <Pressable key={day} accessibilityRole="button" aria-selected={active} accessibilityLabel={formatOperationalDate(noon(day), 'en', { weekday: 'long', day: 'numeric', month: 'long' })} onPress={() => setSelected(day)} style={[styles.day, active && styles.dayActive]}><AppText variant="caption" style={active ? styles.activeText : styles.muted}>{formatOperationalDate(noon(day), 'en', { weekday: 'short' })}</AppText><AppText variant="title" style={active ? styles.activeText : undefined}>{day.slice(8)}</AppText>{day === today ? <View style={styles.dot} /> : null}</Pressable>;
    })}</ScrollView>
    <QueryState label="reservations" isLoading={reservations.isLoading} error={reservations.error} onRetry={() => { void reservations.refetch(); }} />
    <View style={styles.callout}><View style={styles.icon}><CalendarRange size={24} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="label">Occupancy · {occupancy}%</AppText><AppText variant="caption" style={styles.muted}>{arrivals} arrivals · {departures} departures</AppText></View></View>
    <View style={styles.heading}><AppText variant="title">{formatOperationalDate(noon(selected), 'en', { weekday: 'long' })} timeline</AppText><AppText variant="caption" style={styles.muted}>{onDay.length} reservations</AppText></View>
    <View style={styles.list}>{onDay.length ? onDay.map((item) => <ReservationRow key={item.id} reservation={item} roomName={roomName.get(item.roomId)} />) : <AppText style={styles.muted}>No stays on this day.</AppText>}</View>
  </Screen>;
}
const styles = StyleSheet.create({ days: { gap: spacing.sm, paddingRight: spacing.xl }, day: { width: 64, height: 86, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.xs }, dayActive: { backgroundColor: colors.ink, borderColor: colors.ink }, activeText: { color: colors.white }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.lime }, muted: { color: colors.textMuted }, callout: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.sky, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, list: { gap: spacing.md } });
