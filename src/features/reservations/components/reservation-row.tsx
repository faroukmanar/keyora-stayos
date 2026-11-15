import { router } from 'expo-router';
import { CalendarDays, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Reservation } from '../../../../packages/contracts/src';
import { AppText } from '@/shared/components/app-text';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

export const reservationTone = (status: Reservation['status']) => status === 'checked-in' || status === 'checked-out' ? 'success' : status === 'cancelled' || status === 'no-show' ? 'danger' : 'blue';

export function ReservationRow({ reservation, roomName }: { reservation: Reservation; roomName?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open reservation for ${reservation.guest.displayName}`} onPress={() => router.push({ pathname: '/reservation/[id]', params: { id: reservation.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.icon}><CalendarDays size={20} color={colors.cobalt} /></View><View style={styles.grow}><View style={styles.title}><AppText variant="label">{reservation.guest.displayName}</AppText><StatusBadge label={reservation.status} tone={reservationTone(reservation.status)} /></View><AppText variant="caption" style={styles.muted}>{roomName ?? 'Room'} · {reservation.checkIn.slice(5)} → {reservation.checkOut.slice(5)}</AppText></View><ChevronRight size={20} color={colors.textMuted} />
  </Pressable>;
}
const styles = StyleSheet.create({ row: { minHeight: 76, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, pressed: { opacity: 0.72 }, icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, muted: { color: colors.textMuted } });
