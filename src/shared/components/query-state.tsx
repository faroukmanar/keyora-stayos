import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppButton } from '@/shared/components/app-button';
import { AppText } from '@/shared/components/app-text';
import { colors, radii, spacing } from '@/theme/tokens';

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.';

/** Loading and error states for live queries; renders nothing once data is available. */
export function QueryState({ isLoading, error, onRetry, label }: { isLoading: boolean; error: unknown; onRetry: () => void; label: string }) {
  if (isLoading) return <ActivityIndicator accessibilityLabel={`Loading ${label}`} color={colors.ink} style={styles.loading} />;
  if (!error) return null;
  return <View accessibilityRole="alert" style={styles.alert}><AppText style={styles.text}>{errorMessage(error)}</AppText><AppButton compact tone="ghost" label="Retry" onPress={onRetry} /></View>;
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return <AppText accessibilityRole="alert" variant="caption" style={styles.text}>{errorMessage(error)}</AppText>;
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xl },
  alert: { padding: spacing.md, borderRadius: radii.md, backgroundColor: '#FFE8E4', gap: spacing.sm },
  text: { color: colors.danger },
});
