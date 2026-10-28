import { CalendarRange } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useOperationsStore } from '@/features/operations/store/operations-store';
import { ReservationRow } from '@/features/reservations/components/reservation-row';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';

const days = [{ d: '27', w: 'Tue' }, { d: '28', w: 'Wed' }, { d: '29', w: 'Thu' }, { d: '30', w: 'Fri' }, { d: '31', w: 'Sat' }, { d: '01', w: 'Sun' }, { d: '02', w: 'Mon' }];
export function CalendarScreen() {
  const reservations = useOperationsStore((state) => state.reservations);
  return <Screen tabs><AppHeader eyebrow="October 2026" title="Stay calendar" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>{days.map((day, index) => <View key={`${day.w}-${day.d}`} style={[styles.day, index === 1 && styles.dayActive]}><AppText variant="caption" style={index === 1 ? styles.activeText : styles.muted}>{day.w}</AppText><AppText variant="title" style={index === 1 ? styles.activeText : undefined}>{day.d}</AppText>{index === 1 ? <View style={styles.dot} /> : null}</View>)}</ScrollView>
    <View style={styles.callout}><View style={styles.icon}><CalendarRange size={24} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="label">Portfolio occupancy · 78%</AppText><AppText variant="caption" style={styles.muted}>3 arrivals · 1 departure · 2 rooms turning</AppText></View></View>
    <View style={styles.legend}><Legend color={colors.cobalt} label="Confirmed" /><Legend color={colors.success} label="In house" /><Legend color={colors.coral} label="Service" /></View>
    <View style={styles.heading}><AppText variant="title">Wednesday timeline</AppText><AppText variant="caption" style={styles.muted}>{reservations.length} reservations</AppText></View><View style={styles.list}>{reservations.map((item) => <ReservationRow key={item.id} reservation={item} />)}</View>
  </Screen>;
}
function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><AppText variant="caption" style={styles.muted}>{label}</AppText></View>; }
const styles = StyleSheet.create({ days: { gap: spacing.sm, paddingRight: spacing.xl }, day: { width: 64, height: 86, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.xs }, dayActive: { backgroundColor: colors.ink, borderColor: colors.ink }, activeText: { color: colors.white }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.lime }, muted: { color: colors.textMuted }, callout: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.sky, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, legendDot: { width: 9, height: 9, borderRadius: 5 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, list: { gap: spacing.md } });
