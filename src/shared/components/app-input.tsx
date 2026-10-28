import { StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { AppText } from '@/shared/components/app-text';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
export function AppInput({ label, error, multiline, ...props }: TextInputProps & { label: string; error?: string }) { return <View style={styles.field}><AppText variant="label">{label}</AppText><TextInput {...props} accessibilityLabel={label} multiline={multiline} placeholderTextColor={colors.textMuted} style={[styles.input, multiline && styles.multiline, error && styles.error]} />{error ? <AppText variant="caption" style={styles.errorText}>{error}</AppText> : null}</View>; }
const styles = StyleSheet.create({ field: { gap: spacing.sm }, input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }, multiline: { minHeight: 112, paddingTop: spacing.md, textAlignVertical: 'top' }, error: { borderColor: colors.danger }, errorText: { color: colors.danger } });
