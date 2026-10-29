import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Check, CheckSquare, Search, Square, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useOperationsStore } from '@/features/operations/store/operations-store';
import type { RoomStatus } from '@/domain/models';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { StatusBadge } from '@/shared/components/status-badge';
import { colors, radii, spacing } from '@/theme/tokens';

const statuses: RoomStatus[] = ['available', 'occupied', 'cleaning', 'maintenance'];

export function RoomsOperationsScreen() {
  const rooms = useOperationsStore((state) => state.rooms);
  const setRoomStatus = useOperationsStore((state) => state.setRoomStatus);
  const reorderRooms = useOperationsStore((state) => state.reorderRooms);
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RoomStatus | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<RoomStatus>('available');
  const [saved, setSaved] = useState(false);
  const visible = useMemo(() => rooms.filter((room) => (status === 'all' || room.status === status) && `${room.name} ${room.type} ${room.property}`.toLowerCase().includes(query.trim().toLowerCase())), [query, rooms, status]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectAll = () => setSelected((current) => current.length === visible.length ? [] : visible.map((room) => room.id));
  const applyBulk = () => {
    selected.forEach((id) => setRoomStatus(id, bulkStatus));
    setSelected([]);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };
  const move = (id: string, direction: -1 | 1) => {
    const index = rooms.findIndex((room) => room.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rooms.length) return;
    const ids = rooms.map((room) => room.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderRooms(ids);
  };
  return <Screen tabs><AppHeader eyebrow="Inventory control" title="Rooms" notifications />
    <View style={styles.toolbar}>
      <View style={styles.search}><Search size={18} color={colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search room, type or property" placeholderTextColor={colors.textMuted} accessibilityLabel="Search rooms" style={styles.input} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.icon}><X size={17} color={colors.textMuted} /></Pressable> : null}</View>
      <View accessibilityRole="radiogroup" style={styles.filters}>{['all', ...statuses].map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: status === item }} onPress={() => setStatus(item as RoomStatus | 'all')} style={[styles.filter, status === item && styles.filterActive]}><AppText variant="caption" style={status === item ? styles.filterTextActive : styles.filterText}>{item}</AppText></Pressable>)}</View>
    </View>
    {selected.length ? <View style={styles.bulk}><View style={styles.grow}><AppText variant="label">{selected.length} rooms selected</AppText><AppText variant="caption" style={styles.muted}>Bulk changes are audited and property scoped.</AppText></View><View accessibilityRole="radiogroup" style={styles.filters}>{statuses.map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: bulkStatus === item }} onPress={() => setBulkStatus(item)} style={[styles.filter, bulkStatus === item && styles.filterActive]}><AppText variant="caption" style={bulkStatus === item ? styles.filterTextActive : styles.filterText}>{item}</AppText></Pressable>)}</View><Pressable accessibilityRole="button" onPress={applyBulk} style={styles.primary}><Check size={17} color={colors.white} /><AppText variant="label" style={styles.primaryText}>Apply status</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Clear selection" onPress={() => setSelected([])} style={styles.icon}><X size={18} color={colors.textMuted} /></Pressable></View> : null}
    {saved ? <View accessibilityRole="status" style={styles.saved}><Check size={17} color={colors.success} /><AppText variant="label">Inventory changes applied</AppText></View> : null}
    {desktop ? <View style={styles.table}><View style={[styles.row, styles.head]}><Box checked={selected.length === visible.length && visible.length > 0} label="Select all rooms" onPress={selectAll} /><AppText variant="caption" style={[styles.headText, styles.roomCol]}>ROOM</AppText><AppText variant="caption" style={[styles.headText, styles.typeCol]}>TYPE</AppText><AppText variant="caption" style={[styles.headText, styles.statusCol]}>STATUS</AppText><AppText variant="caption" style={[styles.headText, styles.capacityCol]}>SLEEPS</AppText><View style={styles.orderCol} /></View>{visible.map((room, index) => <View key={room.id} style={[styles.row, selected.includes(room.id) && styles.selected]}><Box checked={selected.includes(room.id)} label={`Select ${room.name}`} onPress={() => toggle(room.id)} /><Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })} style={styles.roomCol}><AppText variant="label">{room.name}</AppText><AppText variant="caption" style={styles.muted}>{room.property} · {room.floor}</AppText></Pressable><View style={styles.typeCol}><AppText>{room.type}</AppText></View><View style={styles.statusCol}><StatusBadge label={room.status} tone={room.status === 'available' ? 'success' : room.status === 'maintenance' ? 'danger' : 'neutral'} /></View><View style={styles.capacityCol}><AppText>{room.capacity}</AppText></View><View style={styles.orderCol}><Pressable accessibilityRole="button" accessibilityLabel={`Move ${room.name} up`} disabled={index === 0} onPress={() => move(room.id, -1)} style={styles.icon}><ArrowUp size={17} color={index === 0 ? colors.border : colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Move ${room.name} down`} disabled={index === visible.length - 1} onPress={() => move(room.id, 1)} style={styles.icon}><ArrowDown size={17} color={index === visible.length - 1 ? colors.border : colors.textMuted} /></Pressable></View></View>)}</View> : <View style={styles.cards}>{visible.map((room) => <Pressable key={room.id} accessibilityRole="button" accessibilityLabel={`${room.name}, ${room.status}. Select room`} accessibilityState={{ selected: selected.includes(room.id) }} onPress={() => toggle(room.id)} style={[styles.card, selected.includes(room.id) && styles.selected]}><Box checked={selected.includes(room.id)} label={`Select ${room.name}`} onPress={() => toggle(room.id)} /><View style={styles.grow}><AppText variant="label">{room.name}</AppText><AppText variant="caption" style={styles.muted}>{room.type} · sleeps {room.capacity}</AppText></View><StatusBadge label={room.status} tone={room.status === 'available' ? 'success' : 'neutral'} /></Pressable>)}</View>}
    {!visible.length ? <View style={styles.empty}><AppText variant="title">No rooms match those filters</AppText><AppText style={styles.muted}>Clear the search or choose another status.</AppText></View> : null}
  </Screen>;
}

function Box({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress} style={styles.box}>{checked ? <CheckSquare size={20} color={colors.cobalt} /> : <Square size={20} color={colors.textMuted} />}</Pressable>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  search: { flex: 1, minWidth: 260, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, minWidth: 0, paddingVertical: spacing.sm, color: colors.text, fontSize: 16 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.textMuted, textTransform: 'capitalize' },
  filterTextActive: { color: colors.white, textTransform: 'capitalize' },
  bulk: { minHeight: 64, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.sky, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  grow: { flex: 1, minWidth: 180 },
  primary: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.cobalt, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primaryText: { color: colors.white },
  saved: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: '#EAF7E0', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface },
  row: { minHeight: 72, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { minHeight: 44, backgroundColor: '#ECE7DD' },
  headText: { color: colors.textMuted, letterSpacing: .8 },
  box: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  roomCol: { flex: 2, gap: 2 },
  typeCol: { flex: 1.4 },
  statusCol: { width: 128 },
  capacityCol: { width: 80 },
  orderCol: { width: 80, flexDirection: 'row' },
  selected: { backgroundColor: '#EEF2FF' },
  cards: { gap: spacing.sm },
  card: { minHeight: 76, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { minHeight: 220, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted: { color: colors.textMuted },
});
