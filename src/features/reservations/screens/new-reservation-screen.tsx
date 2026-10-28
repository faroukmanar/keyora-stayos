import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CalendarCheck, Check, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { guests } from '@/data/demo-data';
import { isRoomAvailable, reservationTotal } from '@/domain/operations';
import { useOperationsStore } from '@/features/operations/store/operations-store';
import { AppButton } from '@/shared/components/app-button';
import { AppHeader } from '@/shared/components/app-header';
import { AppInput } from '@/shared/components/app-input';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const bookingSchema = z.object({
  guestId: z.string().min(1, 'Choose a guest'),
  checkIn: z.string().regex(datePattern, 'Use YYYY-MM-DD'),
  checkOut: z.string().regex(datePattern, 'Use YYYY-MM-DD'),
  adults: z.number().int().min(1),
}).refine((value) => Date.parse(value.checkOut) > Date.parse(value.checkIn), { message: 'Check-out must be after check-in', path: ['checkOut'] });

export function NewReservationScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const room = useOperationsStore((state) => state.rooms.find((item) => item.id === roomId));
  const reservations = useOperationsStore((state) => state.reservations);
  const createReservation = useOperationsStore((state) => state.createReservation);
  const [guestId, setGuestId] = useState(guests[0]?.id ?? '');
  const [checkIn, setCheckIn] = useState('2026-11-05');
  const [checkOut, setCheckOut] = useState('2026-11-08');
  const [adults, setAdults] = useState(2);
  const [arrivalNote, setArrivalNote] = useState('');
  const [error, setError] = useState('');

  const quote = useMemo(() => {
    if (!room || !datePattern.test(checkIn) || !datePattern.test(checkOut)) return null;
    try { return reservationTotal(room, checkIn, checkOut); } catch { return null; }
  }, [checkIn, checkOut, room]);

  if (!room) return <Screen><AppHeader title="Room not found" back /></Screen>;

  const submit = () => {
    setError('');
    const parsed = bookingSchema.safeParse({ guestId, checkIn, checkOut, adults });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the reservation details'); return; }
    if (adults > room.capacity) { setError(`${room.name} accommodates up to ${room.capacity} guests`); return; }
    if (!isRoomAvailable(room.id, checkIn, checkOut, reservations)) { setError('These dates overlap an existing reservation'); return; }
    const nextNumber = Math.max(1051, ...reservations.map((item) => Number(item.id.replace('KEY-', '')) || 0)) + 1;
    const id = `KEY-${nextNumber}`;
    createReservation({ id, guestId, roomId: room.id, checkIn, checkOut, adults, status: 'confirmed', channel: 'Direct', arrivalNote: arrivalNote.trim() || undefined });
    router.replace(`/reservation/${id}` as Href);
  };

  return <Screen><AppHeader eyebrow="Direct booking" title="Create reservation" back />
    <View style={styles.roomCard}><View style={styles.roomIcon}><CalendarCheck size={24} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="title">{room.name}</AppText><AppText variant="caption" style={styles.muted}>{room.property} · up to {room.capacity} guests</AppText></View><AppText variant="label">{room.nightlyRate.toLocaleString()} MAD</AppText></View>
    <View style={styles.section}><View><AppText variant="caption" style={styles.eyebrow}>PRIMARY GUEST</AppText><AppText variant="title">Who is staying?</AppText></View><View style={styles.guestList}>{guests.map((guest) => <Pressable key={guest.id} accessibilityRole="radio" accessibilityState={{ checked: guestId === guest.id }} onPress={() => setGuestId(guest.id)} style={({ pressed }) => [styles.guest, guestId === guest.id && styles.guestActive, pressed && styles.pressed]}><View style={styles.avatar}><AppText variant="label">{guest.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</AppText></View><View style={styles.grow}><AppText variant="label">{guest.name}</AppText><AppText variant="caption" style={styles.muted}>{guest.stays} previous stays</AppText></View>{guestId === guest.id ? <View style={styles.selected}><Check size={16} color={colors.white} /></View> : null}</Pressable>)}</View></View>
    <View style={styles.section}><View><AppText variant="caption" style={styles.eyebrow}>STAY DETAILS</AppText><AppText variant="title">Dates and party</AppText></View><AppInput label="Check-in" value={checkIn} onChangeText={setCheckIn} placeholder="YYYY-MM-DD" autoCapitalize="none" /><AppInput label="Check-out" value={checkOut} onChangeText={setCheckOut} placeholder="YYYY-MM-DD" autoCapitalize="none" /><View><AppText variant="label">Guests</AppText><View style={styles.counter}><Pressable accessibilityRole="button" accessibilityLabel="Remove guest" onPress={() => setAdults((value) => Math.max(1, value - 1))} style={styles.counterButton}><AppText variant="title">−</AppText></Pressable><View style={styles.counterValue}><UsersRound size={19} color={colors.cobalt} /><AppText variant="title">{adults}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Add guest" onPress={() => setAdults((value) => Math.min(room.capacity, value + 1))} style={styles.counterButton}><AppText variant="title">+</AppText></Pressable></View></View><AppInput label="Arrival note (optional)" value={arrivalNote} onChangeText={setArrivalNote} multiline placeholder="Airport transfer, dietary notes, expected arrival…" /></View>
    {error ? <View accessibilityLiveRegion="polite" style={styles.error}><AppText variant="label" style={styles.errorText}>{error}</AppText></View> : null}
    <View style={styles.quote}><View><AppText variant="caption" style={styles.quoteMuted}>CONFIRMED DIRECT RATE</AppText><AppText variant="title" style={styles.quoteText}>{quote ? `${quote.total.toLocaleString()} MAD` : 'Enter valid dates'}</AppText></View><AppButton label="Confirm reservation" icon={CalendarCheck} tone="coral" disabled={!quote} onPress={submit} /></View>
  </Screen>;
}

const styles = StyleSheet.create({ roomCard: { minHeight: 94, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, roomIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, muted: { color: colors.textMuted }, section: { padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.lg }, eyebrow: { color: colors.textMuted, letterSpacing: 1 }, guestList: { gap: spacing.sm }, guest: { minHeight: 72, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, guestActive: { borderColor: colors.cobalt, backgroundColor: colors.sky }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, selected: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cobalt, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: .72 }, counter: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, counterButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, counterValue: { minWidth: 84, height: 48, borderRadius: radii.pill, backgroundColor: colors.sky, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, error: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: '#FDE8E8' }, errorText: { color: colors.danger }, quote: { padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.ink, gap: spacing.lg }, quoteMuted: { color: '#CACAC4', letterSpacing: 1 }, quoteText: { color: colors.white, marginTop: spacing.xs } });
