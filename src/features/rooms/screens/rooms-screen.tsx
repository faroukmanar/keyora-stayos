import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { RoomStatus } from '@/domain/models';
import { useOperationsStore } from '@/features/operations/store/operations-store';
import { RoomCard } from '@/features/rooms/components/room-card';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { SearchField } from '@/shared/components/search-field';
import { colors, radii, spacing } from '@/theme/tokens';

type Filter = 'all' | RoomStatus;
const filters: Filter[] = ['all', 'available', 'occupied', 'cleaning', 'maintenance'];
type Capacity = 'any' | 2 | 4;
type PriceBand = 'all' | 'under-1500' | '1500-2500' | '2500-plus';
export function RoomsScreen() {
  const rooms = useOperationsStore((state) => state.rooms);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [city, setCity] = useState('All cities');
  const [capacity, setCapacity] = useState<Capacity>('any');
  const [price, setPrice] = useState<PriceBand>('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const cities = useMemo(() => ['All cities', ...Array.from(new Set(rooms.map((room) => room.city)))], [rooms]);
  const activeFilters = (filter !== 'all' ? 1 : 0) + (city !== 'All cities' ? 1 : 0) + (capacity !== 'any' ? 1 : 0) + (price !== 'all' ? 1 : 0);
  const visible = useMemo(() => rooms.filter((room) => {
    const matchesPrice = price === 'all' || (price === 'under-1500' && room.nightlyRate < 1500) || (price === '1500-2500' && room.nightlyRate >= 1500 && room.nightlyRate <= 2500) || (price === '2500-plus' && room.nightlyRate > 2500);
    return (filter === 'all' || room.status === filter) && (city === 'All cities' || room.city === city) && (capacity === 'any' || room.capacity >= capacity) && matchesPrice && `${room.name} ${room.city} ${room.type} ${room.property}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [capacity, city, filter, price, query, rooms]);
  const clearFilters = () => { setFilter('all'); setCity('All cities'); setCapacity('any'); setPrice('all'); };
  return <Screen tabs><AppHeader eyebrow={`${rooms.length} sellable spaces`} title="Room inventory" /><SearchField value={query} onChangeText={setQuery} onFilterPress={() => setAdvancedOpen((value) => !value)} activeFilters={activeFilters} placeholder="Search rooms, cities or types" />
    <View><AppText variant="caption" style={styles.label}>STATUS</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{filters.map((item) => <FilterChip key={item} label={item} active={filter === item} onPress={() => setFilter(item)} />)}</ScrollView></View>
    <View><AppText variant="caption" style={styles.label}>DESTINATION</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{cities.map((item) => <FilterChip key={item} label={item} active={city === item} onPress={() => setCity(item)} />)}</ScrollView></View>
    {advancedOpen ? <View style={styles.advanced}><View style={styles.advancedHead}><View><AppText variant="title">Refine inventory</AppText><AppText variant="caption" style={styles.muted}>Capacity and nightly rate</AppText></View>{activeFilters ? <Pressable accessibilityRole="button" onPress={clearFilters} hitSlop={8}><AppText variant="label" style={styles.clear}>Clear all</AppText></Pressable> : null}</View><AppText variant="caption" style={styles.label}>GUEST CAPACITY</AppText><View style={styles.filters}><FilterChip label="Any" active={capacity === 'any'} onPress={() => setCapacity('any')} /><FilterChip label="2+ guests" active={capacity === 2} onPress={() => setCapacity(2)} /><FilterChip label="4+ guests" active={capacity === 4} onPress={() => setCapacity(4)} /></View><AppText variant="caption" style={styles.label}>NIGHTLY RATE</AppText><View style={styles.filters}><FilterChip label="Any rate" active={price === 'all'} onPress={() => setPrice('all')} /><FilterChip label="Under 1,500" active={price === 'under-1500'} onPress={() => setPrice('under-1500')} /><FilterChip label="1,500–2,500" active={price === '1500-2500'} onPress={() => setPrice('1500-2500')} /><FilterChip label="2,500+" active={price === '2500-plus'} onPress={() => setPrice('2500-plus')} /></View></View> : null}
    <View style={styles.heading}><View><AppText variant="title">{visible.length} {visible.length === 1 ? 'space' : 'spaces'}</AppText><AppText variant="caption" style={styles.muted}>{activeFilters ? `${activeFilters} active filters` : 'Across the KEYORA portfolio'}</AppText></View>{activeFilters ? <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}><AppText variant="caption" style={styles.clear}>Reset</AppText></Pressable> : <AppText variant="caption" style={styles.muted}>Live status</AppText>}</View>{visible.length ? <View style={styles.list}>{visible.map((room) => <RoomCard key={room.id} room={room} />)}</View> : <View style={styles.empty}><AppText variant="title">No matching rooms</AppText><AppText style={styles.muted}>Try another city, rate, or capacity.</AppText><Pressable accessibilityRole="button" onPress={clearFilters} style={styles.emptyAction}><AppText variant="label" style={styles.emptyActionText}>Clear filters</AppText></Pressable></View>}</Screen>;
}
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.filter, active && styles.filterActive, pressed && styles.pressed]}><AppText variant="caption" style={active ? styles.filterText : styles.muted}>{label}</AppText></Pressable>; }
const styles = StyleSheet.create({ label: { color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm }, filterScroll: { gap: spacing.sm, paddingRight: spacing.xl }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, filter: { minHeight: 42, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' }, filterActive: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { color: colors.white, textTransform: 'capitalize' }, muted: { color: colors.textMuted }, pressed: { opacity: .68 }, advanced: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.sky, gap: spacing.md }, advancedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, clear: { color: colors.cobalt }, clearButton: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, list: { gap: spacing.xl }, empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm }, emptyAction: { minHeight: 48, marginTop: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, emptyActionText: { color: colors.white } });
