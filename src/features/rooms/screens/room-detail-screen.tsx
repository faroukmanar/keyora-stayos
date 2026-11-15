import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { CalendarCheck, Check, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { RoomStatus } from '../../../../packages/contracts/src';
import { propertyToday } from '@/domain/operations';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useReservations, useRoom, useRoomStatus } from '@/features/operations/hooks/use-live-data';
import { ReservationRow } from '@/features/reservations/components/reservation-row';
import { roomTone } from '@/features/rooms/components/room-card';
import { roomImage } from '@/features/rooms/room-visuals';
import { AppButton } from '@/shared/components/app-button';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { InlineError, QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

const statuses: RoomStatus[] = ['available', 'occupied', 'cleaning', 'maintenance'];

export function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const role = useAuthStore((state) => state.user?.role);
  const room = useRoom(id);
  const reservations = useReservations();
  const setStatus = useRoomStatus();
  if (!room.data) return <Screen><AppHeader title="Room" back /><QueryState label="room" isLoading={room.isLoading} error={room.error} onRetry={() => { void room.refetch(); }} /></Screen>;
  const item = room.data;
  const today = propertyToday();
  const stays = (reservations.data ?? []).filter((reservation) => reservation.roomId === item.id && (reservation.status === 'checked-in' || (reservation.status === 'confirmed' && reservation.checkOut >= today))).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const canEdit = role === 'owner' || role === 'manager' || role === 'front-desk';
  const canBook = canEdit;
  return <Screen><AppHeader eyebrow={item.roomType} title={item.name} back />
    <View style={styles.hero}><Image source={roomImage(item.id)} contentFit="cover" transition={180} accessibilityLabel={`${item.name} room`} style={styles.image} /><View style={styles.heroStatus}><StatusBadge label={item.status} tone={roomTone[item.status]} /></View></View>
    <View style={styles.facts}><Fact icon={Users} value={String(item.capacity)} label="Guests" /><Fact icon={CalendarCheck} value={String(stays.length)} label="Upcoming stays" /></View>
    {item.amenities?.length ? <Section eyebrow="WHAT THIS ROOM OFFERS" title="Amenities"><View style={styles.amenities}>{item.amenities.map((amenity) => <View key={amenity} style={styles.amenity}><View style={styles.check}><Check size={15} color={colors.success} /></View><AppText>{amenity}</AppText></View>)}</View></Section> : null}
    <Section eyebrow="IN HOUSE AND UPCOMING" title="Stays">{stays.length ? stays.map((reservation) => <ReservationRow key={reservation.id} reservation={reservation} roomName={item.name} />) : <AppText style={styles.muted}>No current or upcoming stays.</AppText>}</Section>
    {canBook ? <AppButton label="Create reservation" icon={CalendarCheck} tone="coral" onPress={() => router.push(`/book/${item.id}` as Href)} /> : null}
    {canEdit ? <View style={styles.operations}>
      <View><AppText variant="caption" style={styles.muted}>STAFF CONTROLS</AppText><AppText variant="title">Operational status</AppText></View>
      <AppText style={styles.muted}>A room becomes available through its housekeeping task; the server refuses it while a turn is open.</AppText>
      <View style={styles.statuses}>{statuses.map((status) => <Pressable key={status} accessibilityRole="button" aria-selected={item.status === status} disabled={setStatus.isPending || item.status === status} onPress={() => setStatus.mutate({ room: item, status })} style={({ pressed }) => [styles.status, item.status === status && styles.statusActive, pressed && styles.pressed]}><AppText variant="caption" style={item.status === status ? styles.statusText : styles.muted}>{status}</AppText></Pressable>)}</View>
      <InlineError error={setStatus.error} />
    </View> : null}
  </Screen>;
}

function Fact({ icon: Icon, value, label }: { icon: typeof Users; value: string; label: string }) { return <View style={styles.fact}><Icon size={21} color={colors.cobalt} /><AppText variant="title">{value}</AppText><AppText variant="caption" style={styles.muted}>{label}</AppText></View>; }
function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) { return <View style={styles.section}><View><AppText variant="caption" style={styles.eyebrow}>{eyebrow}</AppText><AppText variant="title">{title}</AppText></View>{children}</View>; }

const styles = StyleSheet.create({ hero: { position: 'relative' }, image: { width: '100%', aspectRatio: 1.35, borderRadius: radii.xl, backgroundColor: colors.surfaceMuted }, heroStatus: { position: 'absolute', right: spacing.md, top: spacing.md }, muted: { color: colors.textMuted }, facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, fact: { width: '47%', minHeight: 116, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.xs }, section: { padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.lg }, eyebrow: { color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.xs }, amenities: { gap: spacing.md }, amenity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, check: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E7F7EF', alignItems: 'center', justifyContent: 'center' }, operations: { padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.sky, gap: spacing.md }, statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, status: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, statusActive: { backgroundColor: colors.ink, borderColor: colors.ink }, statusText: { color: colors.white, textTransform: 'capitalize' }, pressed: { opacity: .7 } });
