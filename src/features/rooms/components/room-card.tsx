import { Image } from 'expo-image';
import { router } from 'expo-router';
import { MapPin, ShieldCheck, Star, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Room } from '@/domain/models';
import { roomDetails } from '@/data/demo-data';
import { AppText } from '@/shared/components/app-text';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

const tone = { available: 'success', occupied: 'blue', cleaning: 'lime', maintenance: 'danger' } as const;
export function RoomCard({ room }: { room: Room }) {
  const details = roomDetails[room.id];
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${room.name}`} onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View><Image source={room.image} contentFit="cover" transition={180} style={styles.image} accessibilityLabel={`${room.name} accommodation`} /><View style={styles.rating}><Star size={14} color={colors.ink} fill={colors.ink} /><AppText variant="caption">{details.rating.toFixed(2)}</AppText></View></View>
    <View style={styles.body}>
      <View style={styles.top}><View style={styles.grow}><AppText variant="title">{room.name}</AppText><AppText variant="caption" style={styles.muted}>{room.type}</AppText></View><StatusBadge label={room.status} tone={tone[room.status]} /></View>
      <View style={styles.meta}><MapPin size={16} color={colors.textMuted} /><AppText variant="caption" style={styles.muted}>{room.city}</AppText><Users size={16} color={colors.textMuted} /><AppText variant="caption" style={styles.muted}>{room.capacity} guests</AppText></View><View style={styles.footer}><View style={styles.flexible}><ShieldCheck size={16} color={colors.success} /><AppText variant="caption" style={styles.flexibleText}>Flexible cancellation</AppText></View><View><AppText variant="label" style={styles.rate}>{room.nightlyRate.toLocaleString()} MAD</AppText><AppText variant="caption" style={styles.night}>per night</AppText></View></View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({ card: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed: { opacity: 0.78 }, image: { width: '100%', aspectRatio: 1.72, backgroundColor: colors.surfaceMuted }, rating: { position: 'absolute', right: spacing.md, top: spacing.md, minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: 'rgba(255,252,246,.94)', flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, body: { padding: spacing.lg, gap: spacing.md }, top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, grow: { flex: 1, gap: spacing.xs }, meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, muted: { color: colors.textMuted }, footer: { minHeight: 48, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, flexible: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flexibleText: { color: colors.success }, rate: { textAlign: 'right' }, night: { color: colors.textMuted, textAlign: 'right' } });
