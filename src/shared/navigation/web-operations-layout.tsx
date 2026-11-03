import { router, usePathname } from 'expo-router';
import { BedDouble, CalendarRange, ClipboardList, Gauge, Hotel, LogOut, Menu, Settings, Sparkles, UsersRound, Wrench, X } from 'lucide-react-native';
import { type PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { AppText } from '@/shared/components/app-text';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: Gauge },
  { href: '/reservations', label: 'Reservations', icon: ClipboardList },
  { href: '/availability', label: 'Availability', icon: CalendarRange },
  { href: '/rooms', label: 'Rooms', icon: BedDouble },
  { href: '/guests', label: 'Guests', icon: UsersRound },
  { href: '/housekeeping', label: 'Housekeeping', icon: Sparkles },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
const mobileNavigation = navigation.slice(0, 5);

export function WebOperationsLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [menuOpen, setMenuOpen] = useState(false);
  const desktop = width >= 1024;
  const tablet = width >= 768;
  const navigate = (href: string) => { setMenuOpen(false); router.push(href as never); };
  const logout = async () => {
    try { await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100'}/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientType: 'web' }) }); } finally { signOut(); router.replace('/sign-in'); }
  };

  return <View style={styles.app}>
    {desktop ? <View style={styles.sidebar} accessibilityRole="navigation">
      <View style={styles.brand}><View style={styles.mark}><Hotel size={20} color={colors.ink} /></View><View><AppText variant="title" style={[styles.brandName, styles.brandNameDark]}>KEYORA</AppText><AppText variant="caption" style={styles.brandMeta}>STAYOS · LIVE</AppText></View></View>
      <View style={styles.property}><AppText variant="caption" style={styles.overline}>ACTIVE PROPERTY</AppText><AppText variant="label">KEYORA Medina</AppText><AppText variant="caption" style={styles.muted}>Marrakech · GMT+1</AppText></View>
      <View style={styles.nav}>{navigation.map((item) => <NavItem key={item.href} {...item} active={pathname.startsWith(item.href)} onPress={() => navigate(item.href)} />)}</View>
      <View style={styles.account}><View style={styles.avatar}><AppText variant="label">{user?.name.split(' ').map((part) => part[0]).slice(0, 2).join('') ?? 'KO'}</AppText></View><View style={styles.accountCopy}><AppText variant="label" numberOfLines={1}>{user?.name ?? 'KEYORA Operator'}</AppText><AppText variant="caption" style={styles.muted}>{user?.role ?? 'Operations'}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={logout} style={styles.iconAction}><LogOut size={18} color={colors.textMuted} /></Pressable></View>
    </View> : null}

    <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
      {!desktop ? <View style={styles.mobileHeader}><View style={styles.mobileBrand}><View style={styles.mark}><Hotel size={18} color={colors.ink} /></View><AppText variant="title" style={styles.brandName}>KEYORA</AppText></View><View style={styles.mobileActions}><AppText variant="caption" style={styles.live}>LIVE</AppText><Pressable accessibilityRole="button" accessibilityLabel={menuOpen ? 'Close navigation' : 'Open navigation'} onPress={() => setMenuOpen((open) => !open)} style={styles.iconAction}>{menuOpen ? <X size={21} color={colors.ink} /> : <Menu size={21} color={colors.ink} />}</Pressable></View></View> : null}
      {menuOpen && !desktop ? <View style={[styles.menu, tablet && styles.menuTablet]} accessibilityRole="navigation">{navigation.map((item) => <NavItem key={item.href} {...item} active={pathname.startsWith(item.href)} onPress={() => navigate(item.href)} />)}<Pressable accessibilityRole="button" onPress={logout} style={styles.logout}><LogOut size={18} color={colors.danger} /><AppText variant="label" style={styles.logoutText}>Sign out</AppText></Pressable></View> : null}
      <View style={styles.content}>{children}</View>
      {!tablet ? <View style={styles.bottomNav} accessibilityRole="tablist">{mobileNavigation.map((item) => { const Icon = item.icon; const active = pathname.startsWith(item.href); return <Pressable key={item.href} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={item.label} onPress={() => navigate(item.href)} style={styles.bottomItem}><Icon size={21} color={active ? colors.cobalt : colors.textMuted} strokeWidth={active ? 2.6 : 2} /><AppText variant="caption" style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{item.label}</AppText></Pressable>; })}</View> : null}
    </View>
  </View>;
}

function NavItem({ href: _href, label, icon: Icon, active, onPress }: { href: string; label: string; icon: typeof Gauge; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="link" accessibilityState={{ selected: active }} accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}><Icon size={19} color={active ? colors.white : colors.textMuted} strokeWidth={active ? 2.6 : 2} /><AppText variant="label" style={active ? styles.navTextActive : styles.navText}>{label}</AppText>{active ? <View style={styles.activeDot} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  app: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F1E8' }, sidebar: { width: 252, padding: spacing.lg, backgroundColor: colors.ink, borderRightWidth: 1, borderRightColor: '#272723' },
  brand: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, mark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, brandName: { fontFamily: fonts.bodyBold, letterSpacing: -0.8 }, brandNameDark: { color: colors.white }, brandMeta: { color: '#A5A59D', letterSpacing: 1.1 },
  property: { marginVertical: spacing.lg, padding: spacing.md, borderRadius: radii.md, backgroundColor: '#20201D', gap: 3 }, overline: { color: colors.lime, letterSpacing: 1.1 }, muted: { color: colors.textMuted }, nav: { flex: 1, gap: 4 },
  navItem: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, navItemActive: { backgroundColor: colors.cobalt }, navText: { color: '#C7C5BC' }, navTextActive: { color: colors.white }, activeDot: { marginLeft: 'auto', width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime }, pressed: { opacity: 0.72 },
  account: { minHeight: 68, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: '#30302B', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, accountCopy: { flex: 1 }, iconAction: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  workspace: { flex: 1, minWidth: 0 }, workspaceDesktop: { paddingLeft: 0 }, content: { flex: 1 }, mobileHeader: { minHeight: 66, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, mobileActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, live: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: '#E4F8BF', color: '#315C00', letterSpacing: 1 },
  menu: { position: 'absolute', zIndex: 20, top: 66, left: 0, right: 0, padding: spacing.lg, gap: 4, backgroundColor: colors.ink, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg }, menuTablet: { left: 'auto', width: 320, borderBottomLeftRadius: radii.lg }, logout: { minHeight: 48, marginTop: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, logoutText: { color: '#FF8B80' },
  bottomNav: { minHeight: 76, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center' }, bottomItem: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3 }, bottomLabel: { fontSize: 10, color: colors.textMuted }, bottomLabelActive: { color: colors.cobalt },
});
