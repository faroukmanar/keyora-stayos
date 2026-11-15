import { useLocalSearchParams } from 'expo-router';
import { Ban, CalendarDays, CheckCircle2, CircleUserRound, Hash, Hotel, LogIn, LogOut, UserX } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import type { ReservationStatus } from '../../../../packages/contracts/src';
import { canTransitionReservation, formatMoney, nightsBetween } from '@/domain/operations';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useReservation, useReservationTransition, useRoom } from '@/features/operations/hooks/use-live-data';
import { reservationTone } from '@/features/reservations/components/reservation-row';
import { AppButton } from '@/shared/components/app-button';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { InlineError, QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

const guidance: Record<ReservationStatus, string> = {
  confirmed: 'Verify identity before check-in.',
  'checked-in': 'Check-out creates a priority room turn for housekeeping.',
  'checked-out': 'Room turn sent to housekeeping.',
  cancelled: 'Inventory has been released.',
  'no-show': 'Inventory has been released.',
};

export function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const role = useAuthStore((state) => state.user?.role);
  const reservation = useReservation(id);
  const room = useRoom(reservation.data?.roomId);
  const transition = useReservationTransition();
  if (!reservation.data) return <Screen><AppHeader title="Reservation" back /><QueryState label="reservation" isLoading={reservation.isLoading} error={reservation.error} onRetry={() => { void reservation.refetch(); }} /></Screen>;
  const item = reservation.data;
  const canAct = role === 'owner' || role === 'manager' || role === 'front-desk';
  const complete = !canTransitionReservation(item.status, 'checked-in') && !canTransitionReservation(item.status, 'checked-out');
  const move = (target: ReservationStatus) => transition.mutate({ reservation: item, target });
  const pending = (target: ReservationStatus) => transition.isPending && transition.variables?.target === target;
  return <Screen><AppHeader eyebrow="Reservation" title={item.guest.displayName} back />
    <View style={styles.hero}><StatusBadge label={item.status} tone={reservationTone(item.status)} /><AppText variant="headline">{item.guest.displayName}</AppText><AppText style={styles.muted}>{room.data?.name ?? 'Room'} · {room.data?.roomType ?? ''}</AppText></View>
    <View style={styles.details}>
      <Detail icon={CircleUserRound} label="Guest" value={`${item.guest.displayName}${item.guest.vip ? ' · VIP' : ''} · ${item.adults} adults${item.children ? `, ${item.children} children` : ''}`} />
      <Detail icon={Hotel} label="Room" value={room.data ? `${room.data.name} · ${room.data.status}` : '—'} />
      <Detail icon={CalendarDays} label="Stay" value={`${item.checkIn} → ${item.checkOut} · ${nightsBetween(item.checkIn, item.checkOut)} nights`} />
      <Detail icon={Hash} label="Confirmation" value={item.id.slice(0, 8).toUpperCase()} />
    </View>
    <View style={styles.total}><View><AppText variant="caption" style={styles.muted}>TOTAL · TAXES INCLUDED</AppText><AppText variant="title">Signed quote</AppText></View><AppText variant="headline">{formatMoney(item.total)}</AppText></View>
    <View style={styles.actions}>
      <View style={styles.actionHead}><View style={styles.actionIcon}>{complete ? <CheckCircle2 size={22} color={colors.success} /> : <LogIn size={22} color={colors.cobalt} />}</View><View style={styles.grow}><AppText variant="title">{complete ? 'Stay lifecycle complete' : 'Front-desk actions'}</AppText><AppText variant="caption" style={styles.muted}>{guidance[item.status]}</AppText></View></View>
      {canAct && item.status === 'confirmed' ? <>
        <AppButton label="Check guest in" icon={LogIn} loading={pending('checked-in')} disabled={transition.isPending} onPress={() => move('checked-in')} />
        <AppButton label="Mark no-show" icon={UserX} tone="ghost" loading={pending('no-show')} disabled={transition.isPending} onPress={() => move('no-show')} />
        <AppButton label="Cancel reservation" icon={Ban} tone="ghost" loading={pending('cancelled')} disabled={transition.isPending} onPress={() => move('cancelled')} />
      </> : null}
      {canAct && item.status === 'checked-in' ? <AppButton label="Check guest out" icon={LogOut} tone="coral" loading={pending('checked-out')} disabled={transition.isPending} onPress={() => move('checked-out')} /> : null}
      {!canAct && !complete ? <AppText variant="caption" style={styles.muted}>Front desk, managers, and owners can change this reservation.</AppText> : null}
      <InlineError error={transition.error} />
    </View>
  </Screen>;
}
function Detail({ icon: Icon, label, value }: { icon: typeof Hotel; label: string; value: string }) { return <View style={styles.detail}><View style={styles.icon}><Icon size={20} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="caption" style={styles.muted}>{label.toUpperCase()}</AppText><AppText variant="label">{value}</AppText></View></View>; }
const styles = StyleSheet.create({ hero: { minHeight: 180, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.sky, justifyContent: 'flex-end', alignItems: 'flex-start', gap: spacing.sm }, muted: { color: colors.textMuted }, details: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }, detail: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, total: { minHeight: 116, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.lime, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, actions: { padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.md }, actionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }, actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' } });
