import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BedDouble, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Room } from '../../../../packages/contracts/src';
import { roomImage } from '@/features/rooms/room-visuals';
import { AppText } from '@/shared/components/app-text';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

export const roomTone = { available: 'success', occupied: 'blue', cleaning: 'lime', maintenance: 'danger' } as const;
export function RoomCard({ room }: { room: Room }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${room.name}`} onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <Image source={roomImage(room.id)} contentFit="cover" transition={180} style={styles.image} accessibilityLabel={`${room.name} accommodation`} />
    <View style={styles.body}>
      <View style={styles.top}><View style={styles.grow}><AppText variant="title">{room.name}</AppText><AppText variant="caption" style={styles.muted}>{room.roomType}</AppText></View><StatusBadge label={room.status} tone={roomTone[room.status]} /></View>
      <View style={styles.meta}><Users size={16} color={colors.textMuted} /><AppText variant="caption" style={styles.muted}>{room.capacity} guests</AppText>{room.amenities?.length ? <><BedDouble size={16} color={colors.textMuted} /><AppText variant="caption" style={styles.muted}>{room.amenities.slice(0, 3).join(' · ')}</AppText></> : null}</View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({ card: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed: { opacity: 0.78 }, image: { width: '100%', aspectRatio: 1.72, backgroundColor: colors.surfaceMuted }, body: { padding: spacing.lg, gap: spacing.md }, top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, grow: { flex: 1, gap: spacing.xs }, meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, muted: { color: colors.textMuted } });
