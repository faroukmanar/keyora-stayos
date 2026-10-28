import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors, layout, radii } from '@/theme/tokens';
export function IconButton({ label, icon: Icon, onPress, inverted }: { label: string; icon: LucideIcon; onPress: () => void; inverted?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.button, inverted && styles.inverted, pressed && styles.pressed]}><Icon size={21} color={inverted ? colors.white : colors.ink} strokeWidth={2.3} /></Pressable>; }
const styles = StyleSheet.create({ button: { width: layout.minimumTouchTarget, height: layout.minimumTouchTarget, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, inverted: { backgroundColor: colors.ink, borderColor: colors.ink }, pressed: { opacity: 0.7 } });
