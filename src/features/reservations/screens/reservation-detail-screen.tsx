import { useLocalSearchParams } from 'expo-router';
import { CalendarDays, CircleUserRound, Hash, Hotel, Radio } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { guests } from '@/data/demo-data';
import { reservationTotal } from '@/domain/operations';
import { useOperationsStore } from '@/features/operations/store/operations-store';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

export function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reservation = useOperationsStore((state) => state.reservations.find((item) => item.id === id));
  const room = useOperationsStore((state) => state.rooms.find((item) => item.id === reservation?.roomId));
  const guest = guests.find((item) => item.id === reservation?.guestId);
  if (!reservation || !room) return <Screen><AppHeader title="Reservation not found" back /></Screen>;
  const price = reservationTotal(room, reservation.checkIn, reservation.checkOut);
  return <Screen><AppHeader eyebrow="Reservation" title={reservation.id} back /><View style={styles.hero}><StatusBadge label={reservation.status} tone={reservation.status === 'checked-in' ? 'success' : 'blue'} /><AppText variant="headline">{guest?.name}</AppText><AppText style={styles.muted}>{room.name} · {room.property}</AppText></View><View style={styles.details}><Detail icon={CircleUserRound} label="Guest" value={`${guest?.name} · ${reservation.adults} adults`} /><Detail icon={Hotel} label="Room" value={`${room.name} · ${room.floor}`} /><Detail icon={CalendarDays} label="Stay" value={`${reservation.checkIn} → ${reservation.checkOut}`} /><Detail icon={Radio} label="Channel" value={reservation.channel} /><Detail icon={Hash} label="Confirmation" value={reservation.id} /></View><View style={styles.total}><View><AppText variant="caption" style={styles.muted}>ROOM + TAX</AppText><AppText variant="title">{price.subtotal.toLocaleString()} + {price.tax.toLocaleString()} MAD</AppText></View><AppText variant="headline">{price.total.toLocaleString()}</AppText></View></Screen>;
}
function Detail({ icon: Icon, label, value }: { icon: typeof Hotel; label: string; value: string }) { return <View style={styles.detail}><View style={styles.icon}><Icon size={20} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="caption" style={styles.muted}>{label.toUpperCase()}</AppText><AppText variant="label">{value}</AppText></View></View>; }
const styles = StyleSheet.create({ hero: { minHeight: 180, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.sky, justifyContent: 'flex-end', alignItems: 'flex-start', gap: spacing.sm }, muted: { color: colors.textMuted }, details: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }, detail: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, total: { minHeight: 116, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.lime, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md } });
