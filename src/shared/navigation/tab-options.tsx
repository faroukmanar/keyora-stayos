import type { LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';
import { colors, fonts, radii } from '@/theme/tokens';
export const tabScreenOptions = { headerShown: false, tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { height: 78, paddingTop: 8, paddingBottom: 12, marginHorizontal: 16, marginBottom: 12, borderTopWidth: 0, borderRadius: radii.xl, backgroundColor: colors.surface, position: 'absolute' as const }, tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 11 } };
export function tabIcon(Icon: LucideIcon) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Icon color={String(color)} size={size} strokeWidth={2.2} />; }
  TabIcon.displayName = `${Icon.displayName ?? 'Icon'}TabIcon`;
  return TabIcon;
}
