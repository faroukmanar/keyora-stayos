import { StyleSheet, View } from 'react-native';
import { AppText } from '@/shared/components/app-text';
import { colors, radii, spacing } from '@/theme/tokens';
export function MetricCard({ value, label, accent }: { value: string; label: string; accent?: string }) { return <View style={[styles.card, accent ? { backgroundColor: accent, borderColor: accent } : null]}><AppText variant="headline">{value}</AppText><AppText variant="caption" style={{ color: accent ? colors.ink : colors.textMuted }}>{label}</AppText></View>; }
const styles = StyleSheet.create({ card: { flex: 1, minWidth: 100, minHeight: 100, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'space-between' } });
