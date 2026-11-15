import { router } from 'expo-router';
import { ArrowLeft, Bell, Settings } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/shared/components/app-text';
import { IconButton } from '@/shared/components/icon-button';
import { colors, spacing } from '@/theme/tokens';
export function AppHeader({ title, eyebrow, back, notifications, settings }: { title: string; eyebrow?: string; back?: boolean; notifications?: boolean; settings?: boolean }) {
  return <View style={styles.row}><View style={styles.leading}>{back ? <IconButton label="Go back" icon={ArrowLeft} onPress={() => router.back()} /> : null}<View style={styles.copy}>{eyebrow ? <AppText variant="caption" style={styles.eyebrow}>{eyebrow}</AppText> : null}<AppText variant="title">{title}</AppText></View></View><View style={styles.actions}>{notifications ? <IconButton label="Notifications" icon={Bell} onPress={() => {}} /> : null}{settings ? <IconButton label="Settings and account" icon={Settings} onPress={() => router.push('/settings' as never)} /> : null}</View></View>;
}
const styles = StyleSheet.create({ row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }, copy: { flex: 1 }, actions: { flexDirection: 'row', gap: spacing.sm }, eyebrow: { color: colors.textMuted, textTransform: 'uppercase' } });
