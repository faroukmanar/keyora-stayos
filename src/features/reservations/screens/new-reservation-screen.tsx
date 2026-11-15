import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CalendarCheck, Check, ReceiptText, UserPlus, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import type { Quote } from '../../../../packages/contracts/src';
import { addDays, formatMoney, isRoomAvailable, propertyToday } from '@/domain/operations';
import { newBookingKeys, useCreateBooking, useGuests, useQuote, useReservations, useRoom } from '@/features/operations/hooks/use-live-data';
import { AppButton } from '@/shared/components/app-button';
import { AppHeader } from '@/shared/components/app-header';
import { AppInput } from '@/shared/components/app-input';
import { AppText } from '@/shared/components/app-text';
import { errorMessage, QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { SearchField } from '@/shared/components/search-field';
import { colors, radii, spacing } from '@/theme/tokens';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const staySchema = z.object({
  checkIn: z.string().regex(datePattern, 'Use YYYY-MM-DD for check-in'),
  checkOut: z.string().regex(datePattern, 'Use YYYY-MM-DD for check-out'),
}).refine((value) => value.checkOut > value.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });
const newGuestSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter the guest name').max(160),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,24}$/, 'Enter a valid phone number').or(z.literal('')),
});

export function NewReservationScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const room = useRoom(roomId);
  const reservations = useReservations();
  const [guestSearch, setGuestSearch] = useState('');
  const guests = useGuests(guestSearch);
  const quoteMutation = useQuote();
  const booking = useCreateBooking();
  const today = propertyToday();
  const [guestId, setGuestId] = useState<string | null>(null);
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [newGuest, setNewGuest] = useState({ displayName: '', email: '', phone: '' });
  const [checkIn, setCheckIn] = useState(addDays(today, 1));
  const [checkOut, setCheckOut] = useState(addDays(today, 3));
  const [adults, setAdults] = useState(2);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  // One key pair per form session: retries reuse it, a changed quote gets a fresh pair.
  const keys = useMemo(() => newBookingKeys(), [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!room.data) return <Screen><AppHeader title="Create reservation" back /><QueryState label="room" isLoading={room.isLoading} error={room.error} onRetry={() => { void room.refetch(); }} /></Screen>;
  const item = room.data;
  const invalidateQuote = () => { setQuote(null); setError(''); };

  const requestQuote = async () => {
    setError('');
    const stay = staySchema.safeParse({ checkIn, checkOut });
    if (!stay.success) { setError(stay.error.issues[0]?.message ?? 'Review the stay dates'); return; }
    if (adults > item.capacity) { setError(`${item.name} accommodates up to ${item.capacity} guests`); return; }
    if (!isRoomAvailable(item.id, checkIn, checkOut, reservations.data ?? [])) { setError('These dates overlap an existing reservation'); return; }
    try { setQuote(await quoteMutation.mutateAsync({ roomId: item.id, checkIn, checkOut, adults, children: 0 })); } catch (caught) { setError(errorMessage(caught)); }
  };

  const confirm = async () => {
    if (!quote) return;
    setError('');
    let guest: { id: string } | { displayName: string; email: string | null; phone: string | null };
    if (creatingGuest) {
      const parsed = newGuestSchema.safeParse(newGuest);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the guest details'); return; }
      guest = { displayName: parsed.data.displayName, email: parsed.data.email || null, phone: parsed.data.phone || null };
    } else {
      if (!guestId) { setError('Choose a guest or add a new one'); return; }
      guest = { id: guestId };
    }
    try {
      const reservation = await booking.mutateAsync({ roomId: item.id, checkIn, checkOut, adults, children: 0, quoteId: quote.id, guest, keys });
      router.replace(`/reservation/${reservation.id}` as Href);
    } catch (caught) { setError(errorMessage(caught)); }
  };

  return <Screen><AppHeader eyebrow="Direct booking" title="Create reservation" back />
    <View style={styles.roomCard}><View style={styles.roomIcon}><CalendarCheck size={24} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="title">{item.name}</AppText><AppText variant="caption" style={styles.muted}>{item.roomType} · up to {item.capacity} guests</AppText></View></View>

    <View style={styles.section}><View><AppText variant="caption" style={styles.eyebrow}>STAY DETAILS</AppText><AppText variant="title">Dates and party</AppText></View>
      <AppInput label="Check-in" value={checkIn} onChangeText={(value) => { setCheckIn(value); invalidateQuote(); }} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      <AppInput label="Check-out" value={checkOut} onChangeText={(value) => { setCheckOut(value); invalidateQuote(); }} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      <View><AppText variant="label">Guests</AppText><View style={styles.counter}><Pressable accessibilityRole="button" accessibilityLabel="Remove guest" onPress={() => { setAdults((value) => Math.max(1, value - 1)); invalidateQuote(); }} style={styles.counterButton}><AppText variant="title">−</AppText></Pressable><View style={styles.counterValue}><UsersRound size={19} color={colors.cobalt} /><AppText variant="title">{adults}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Add guest" onPress={() => { setAdults((value) => Math.min(item.capacity, value + 1)); invalidateQuote(); }} style={styles.counterButton}><AppText variant="title">+</AppText></Pressable></View></View>
    </View>

    <View style={styles.section}><View style={styles.sectionHead}><View style={styles.grow}><AppText variant="caption" style={styles.eyebrow}>PRIMARY GUEST</AppText><AppText variant="title">Who is staying?</AppText></View><AppButton compact tone="ghost" icon={UserPlus} label={creatingGuest ? 'Choose existing' : 'New guest'} onPress={() => { setCreatingGuest((value) => !value); setError(''); }} /></View>
      {creatingGuest ? <>
        <AppInput label="Guest name" value={newGuest.displayName} onChangeText={(displayName) => setNewGuest((value) => ({ ...value, displayName }))} />
        <AppInput label="Email (optional)" value={newGuest.email} onChangeText={(email) => setNewGuest((value) => ({ ...value, email }))} autoCapitalize="none" keyboardType="email-address" />
        <AppInput label="Phone (optional)" value={newGuest.phone} onChangeText={(phone) => setNewGuest((value) => ({ ...value, phone }))} keyboardType="phone-pad" />
      </> : <>
        <SearchField value={guestSearch} onChangeText={setGuestSearch} placeholder="Search guests by name" />
        <QueryState label="guests" isLoading={guests.isLoading} error={guests.error} onRetry={() => { void guests.refetch(); }} />
        <View style={styles.guestList}>{(guests.data ?? []).slice(0, 8).map((guest) => <Pressable key={guest.id} role="radio" aria-checked={guestId === guest.id} accessibilityLabel={guest.displayName} onPress={() => setGuestId(guest.id)} style={({ pressed }) => [styles.guest, guestId === guest.id && styles.guestActive, pressed && styles.pressed]}><View style={styles.avatar}><AppText variant="label">{guest.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</AppText></View><View style={styles.grow}><AppText variant="label">{guest.displayName}</AppText>{guest.vip ? <AppText variant="caption" style={styles.muted}>VIP</AppText> : null}</View>{guestId === guest.id ? <View style={styles.selected}><Check size={16} color={colors.white} /></View> : null}</Pressable>)}</View>
      </>}
    </View>

    {error ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}><AppText variant="label" style={styles.errorText}>{error}</AppText></View> : null}

    <View style={styles.quote}>
      {quote ? <>
        <View><AppText variant="caption" style={styles.quoteMuted}>SIGNED QUOTE · VALID 15 MIN</AppText><AppText variant="title" style={styles.quoteText}>{formatMoney(quote.total)}</AppText></View>
        <View style={styles.lines}><Line label={`${quote.breakdown.nights.length} nights`} value={formatMoney({ amountMinor: quote.breakdown.subtotalMinor, currency: quote.total.currency })} />{quote.breakdown.taxes.map((tax) => <Line key={tax.name} label={tax.name} value={formatMoney({ amountMinor: tax.amountMinor, currency: quote.total.currency })} />)}{quote.breakdown.discount ? <Line label={`Discount ${quote.breakdown.discount.code}`} value={`−${formatMoney({ amountMinor: quote.breakdown.discount.amountMinor, currency: quote.total.currency })}`} /> : null}</View>
        <AppButton label="Confirm reservation" icon={CalendarCheck} tone="coral" loading={booking.isPending} onPress={confirm} />
      </> : <>
        <View><AppText variant="caption" style={styles.quoteMuted}>DIRECT RATE</AppText><AppText variant="title" style={styles.quoteText}>Get a signed price for these dates</AppText></View>
        <AppButton label="Get price" icon={ReceiptText} tone="lime" loading={quoteMutation.isPending} onPress={requestQuote} />
      </>}
    </View>
  </Screen>;
}

function Line({ label, value }: { label: string; value: string }) { return <View style={styles.line}><AppText style={styles.quoteMuted}>{label}</AppText><AppText variant="label" style={styles.quoteText}>{value}</AppText></View>; }

const styles = StyleSheet.create({ roomCard: { minHeight: 94, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, roomIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, muted: { color: colors.textMuted }, section: { padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.lg }, sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, eyebrow: { color: colors.textMuted, letterSpacing: 1 }, guestList: { gap: spacing.sm }, guest: { minHeight: 72, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, guestActive: { borderColor: colors.cobalt, backgroundColor: colors.sky }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, selected: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cobalt, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: .72 }, counter: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, counterButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, counterValue: { minWidth: 84, height: 48, borderRadius: radii.pill, backgroundColor: colors.sky, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, error: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: '#FDE8E8' }, errorText: { color: colors.danger }, quote: { padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.ink, gap: spacing.lg }, quoteMuted: { color: '#CACAC4', letterSpacing: 1 }, quoteText: { color: colors.white, marginTop: spacing.xs }, lines: { gap: spacing.sm }, line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md } });
