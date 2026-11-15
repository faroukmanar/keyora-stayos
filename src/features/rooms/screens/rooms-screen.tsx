import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { RoomStatus } from '../../../../packages/contracts/src';
import { useRooms } from '@/features/operations/hooks/use-live-data';
import { RoomCard } from '@/features/rooms/components/room-card';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { QueryState } from '@/shared/components/query-state';
import { Screen } from '@/shared/components/screen';
import { SearchField } from '@/shared/components/search-field';
import { colors, radii, spacing } from '@/theme/tokens';

type Filter = 'all' | RoomStatus;
const filters: Filter[] = ['all', 'available', 'occupied', 'cleaning', 'maintenance'];
type Capacity = 'any' | 2 | 4;

export function RoomsScreen() {
  const { width } = useWindowDimensions();
  const columns = width >= 1200 ? 3 : width >= 768 ? 2 : 1;
  const rooms = useRooms();
  const list = useMemo(() => rooms.data ?? [], [rooms.data]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [roomType, setRoomType] = useState('All types');
  const [capacity, setCapacity] = useState<Capacity>('any');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const types = useMemo(() => ['All types', ...Array.from(new Set(list.map((room) => room.roomType)))], [list]);
  const activeFilters = (filter !== 'all' ? 1 : 0) + (roomType !== 'All types' ? 1 : 0) + (capacity !== 'any' ? 1 : 0);
  const visible = useMemo(() => list.filter((room) =>
    (filter === 'all' || room.status === filter)
    && (roomType === 'All types' || room.roomType === roomType)
    && (capacity === 'any' || room.capacity >= capacity)
    && `${room.name} ${room.roomType} ${(room.amenities ?? []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())), [capacity, filter, list, query, roomType]);
  const clearFilters = () => { setFilter('all'); setRoomType('All types'); setCapacity('any'); };
  return <Screen tabs><AppHeader eyebrow={`${list.length} sellable spaces`} title="Room inventory" /><SearchField value={query} onChangeText={setQuery} onFilterPress={() => setAdvancedOpen((value) => !value)} activeFilters={activeFilters} placeholder="Search rooms, types or amenities" />
    <View><AppText variant="caption" style={styles.label}>STATUS</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{filters.map((item) => <FilterChip key={item} label={item} active={filter === item} onPress={() => setFilter(item)} />)}</ScrollView></View>
    <View><AppText variant="caption" style={styles.label}>ROOM TYPE</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{types.map((item) => <FilterChip key={item} label={item} active={roomType === item} onPress={() => setRoomType(item)} />)}</ScrollView></View>
    {advancedOpen ? <View style={styles.advanced}><View style={styles.advancedHead}><View><AppText variant="title">Refine inventory</AppText><AppText variant="caption" style={styles.muted}>Guest capacity</AppText></View>{activeFilters ? <Pressable accessibilityRole="button" onPress={clearFilters} hitSlop={8}><AppText variant="label" style={styles.clear}>Clear all</AppText></Pressable> : null}</View><View style={styles.filters}><FilterChip label="Any" active={capacity === 'any'} onPress={() => setCapacity('any')} /><FilterChip label="2+ guests" active={capacity === 2} onPress={() => setCapacity(2)} /><FilterChip label="4+ guests" active={capacity === 4} onPress={() => setCapacity(4)} /></View></View> : null}
    <QueryState label="rooms" isLoading={rooms.isLoading} error={rooms.error} onRetry={() => { void rooms.refetch(); }} />
    <View style={styles.heading}><View><AppText variant="title">{visible.length} {visible.length === 1 ? 'space' : 'spaces'}</AppText><AppText variant="caption" style={styles.muted}>{activeFilters ? `${activeFilters} active filters` : 'Live status'}</AppText></View>{activeFilters ? <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}><AppText variant="caption" style={styles.clear}>Reset</AppText></Pressable> : null}</View>
    {visible.length ? <View style={styles.list}>{visible.map((room) => <View key={room.id} style={[styles.roomGridItem, columns === 3 ? styles.roomGridThird : columns === 2 ? styles.roomGridHalf : styles.roomGridFull]}><RoomCard room={room} /></View>)}</View> : rooms.data ? <View style={styles.empty}><AppText variant="title">No matching rooms</AppText><AppText style={styles.muted}>Try another status, type, or capacity.</AppText><Pressable accessibilityRole="button" onPress={clearFilters} style={styles.emptyAction}><AppText variant="label" style={styles.emptyActionText}>Clear filters</AppText></Pressable></View> : null}
  </Screen>;
}
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" aria-selected={active} onPress={onPress} style={({ pressed }) => [styles.filter, active && styles.filterActive, pressed && styles.pressed]}><AppText variant="caption" style={active ? styles.filterText : styles.muted}>{label}</AppText></Pressable>; }
const styles = StyleSheet.create({ label: { color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm }, filterScroll: { gap: spacing.sm, paddingRight: spacing.xl }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, filter: { minHeight: 42, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' }, filterActive: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { color: colors.white, textTransform: 'capitalize' }, muted: { color: colors.textMuted }, pressed: { opacity: .68 }, advanced: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.sky, gap: spacing.md }, advancedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, clear: { color: colors.cobalt }, clearButton: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, list: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, roomGridItem: { minWidth: 0 }, roomGridThird: { width: '32%' }, roomGridHalf: { width: '48.5%' }, roomGridFull: { width: '100%' }, empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm }, emptyAction: { minHeight: 48, marginTop: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, emptyActionText: { color: colors.white } });
