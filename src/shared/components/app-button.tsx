import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/shared/components/app-text';
import { colors, layout, radii, spacing } from '@/theme/tokens';
type Props = { label: string; onPress: () => void | Promise<void>; icon?: LucideIcon; tone?: 'coral' | 'ink' | 'lime' | 'ghost'; loading?: boolean; disabled?: boolean; compact?: boolean };
export function AppButton({ label, onPress, icon: Icon, tone = 'ink', loading, disabled, compact }: Props) {
  const background = tone === 'coral' ? colors.coral : tone === 'lime' ? colors.lime : tone === 'ghost' ? 'transparent' : colors.ink;
  const foreground = tone === 'ink' || tone === 'coral' ? colors.white : colors.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); await onPress(); }} style={({ pressed }) => [styles.base, { backgroundColor: background, paddingHorizontal: compact ? spacing.lg : spacing.xl }, tone === 'ghost' && styles.ghost, pressed && styles.pressed, (disabled || loading) && styles.disabled]}>{loading ? <ActivityIndicator color={foreground} /> : <View style={styles.content}><AppText variant="label" style={{ color: foreground }}>{label}</AppText>{Icon ? <Icon size={19} color={foreground} strokeWidth={2.4} /> : null}</View>}</Pressable>;
}
const styles = StyleSheet.create({ base: { minHeight: layout.minimumTouchTarget, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' }, ghost: { borderWidth: 1, borderColor: colors.border }, content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, pressed: { opacity: 0.76 }, disabled: { opacity: 0.45 } });
