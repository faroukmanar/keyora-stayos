import { router } from 'expo-router';
import { CalendarDays, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { guests, rooms } from '@/data/demo-data';
import type { Reservation } from '@/domain/models';
import { AppText } from '@/shared/components/app-text';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

export function ReservationRow({ reservation }: { reservation: Reservation }) {
  const guest = guests.find((item) => item.id === reservation.guestId);
  const room = rooms.find((item) => item.id === reservation.roomId);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open reservation ${reservation.id}`} onPress={() => router.push({ pathname: '/reservation/[id]', params: { id: reservation.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.icon}><CalendarDays size={20} color={colors.cobalt} /></View><View style={styles.grow}><View style={styles.title}><AppText variant="label">{guest?.name}</AppText><StatusBadge label={reservation.status} tone={reservation.status === 'checked-in' ? 'success' : 'neutral'} /></View><AppText variant="caption" style={styles.muted}>{room?.name} · {reservation.checkIn.slice(5)} → {reservation.checkOut.slice(5)}</AppText></View><ChevronRight size={20} color={colors.textMuted} />
  </Pressable>;
}
const styles = StyleSheet.create({ row: { minHeight: 76, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, pressed: { opacity: 0.72 }, icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, muted: { color: colors.textMuted } });
