import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '@/theme/tokens';
export function Screen({ children, tabs = false, background = colors.canvas }: PropsWithChildren<{ tabs?: boolean; background?: string }>) { return <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={['top']}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, tabs && styles.tabs]}><View style={styles.inner}>{children}</View></ScrollView></SafeAreaView>; }
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: layout.screenGutter, paddingTop: spacing.md, paddingBottom: spacing.xxxl }, tabs: { paddingBottom: layout.tabBarClearance }, inner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: spacing.xl } });
