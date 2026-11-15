import { Mail, Phone, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGuests } from '@/features/operations/hooks/use-live-data';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { SearchField } from '@/shared/components/search-field';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

export function GuestsScreen() {
  const [query, setQuery] = useState('');
  const guests = useGuests(query);
  const list = guests.data ?? [];
  const masked = list.some((guest) => guest.sensitiveFieldsMasked);
  return <Screen tabs><AppHeader eyebrow="Guest intelligence" title="Relationships" />
    <View style={styles.summary}><View style={styles.metric}><AppText variant="headline" numberOfLines={1} style={[styles.metricValue, styles.metricLime]}>{list.length}</AppText><AppText variant="caption" numberOfLines={1} style={styles.metricLabel}>{query.trim() ? 'MATCHING PROFILES' : 'ACTIVE PROFILES'}</AppText></View><View style={styles.rule} /><View style={styles.metric}><AppText variant="headline" numberOfLines={1} style={[styles.metricValue, styles.metricSky]}>{list.filter((guest) => guest.vip).length}</AppText><AppText variant="caption" numberOfLines={1} style={styles.metricLabel}>VIP GUESTS</AppText></View></View>
    <SearchField value={query} onChangeText={setQuery} placeholder="Search guests by name" />
    {masked ? <View style={styles.notice}><ShieldCheck size={16} color={colors.success} /><AppText variant="caption" style={styles.muted}>Contact details are masked for your role.</AppText></View> : null}
    <QueryState label="guests" isLoading={guests.isLoading} error={guests.error} onRetry={() => { void guests.refetch(); }} />
    <View style={styles.list}>{list.map((guest) => <View key={guest.id} style={styles.card}><View style={styles.avatar}><AppText variant="title">{initials(guest.displayName)}</AppText></View><View style={styles.grow}><View style={styles.name}><AppText variant="title">{guest.displayName}</AppText>{guest.vip ? <StatusBadge label="VIP" tone="lime" /> : null}</View>{guest.email ? <View style={styles.line}><Mail size={15} color={colors.textMuted} /><AppText variant="caption" style={styles.muted}>{guest.email}</AppText></View> : null}{guest.phone ? <View style={styles.line}><Phone size={15} color={colors.textMuted} /><AppText variant="caption" style={styles.muted}>{guest.phone}</AppText></View> : null}</View></View>)}</View>
    {guests.data && !list.length ? <AppText style={styles.muted}>{query.trim() ? 'No guests match this search.' : 'No guest profiles yet.'}</AppText> : null}
  </Screen>;
}
const styles = StyleSheet.create({ summary: { minHeight: 144, borderRadius: radii.xl, padding: spacing.lg, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'stretch' }, metric: { flex: 1, minWidth: 0, paddingHorizontal: spacing.md, alignItems: 'flex-start', justifyContent: 'center', gap: spacing.sm }, metricValue: { fontSize: 48, lineHeight: 52, fontVariant: ['tabular-nums'] }, metricLime: { color: colors.lime }, metricSky: { color: '#AFC4FF' }, metricLabel: { color: '#D7D7D1', letterSpacing: .8, fontSize: 11 }, rule: { width: 1, marginVertical: spacing.md, backgroundColor: '#42423E' }, muted: { color: colors.textMuted }, notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, list: { gap: spacing.md }, card: { padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.md }, avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.sm }, name: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm } });
