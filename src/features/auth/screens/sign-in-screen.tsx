import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BedDouble, Building2, ConciergeBell, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { AppRole } from '@/domain/models';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';

const roles = [
  { role: 'owner', label: 'Property owner', description: 'Portfolio, revenue and team oversight', icon: Building2 },
  { role: 'manager', label: 'Operations manager', description: 'Daily arrivals, rooms and service', icon: ConciergeBell },
  { role: 'front-desk', label: 'Front desk', description: 'Guests, bookings and check-in', icon: BedDouble },
  { role: 'housekeeping', label: 'Housekeeping', description: 'Prioritized room turnaround', icon: Sparkles },
] satisfies { role: AppRole; label: string; description: string; icon: typeof Building2 }[];

export function SignInScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  return <Screen background={colors.ink}><View style={styles.hero}><Image source={require('../../../../assets/images/keyora-riad-hero.webp')} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="KEYORA riad courtyard" /><View style={styles.scrim} /><View style={styles.brand}><AppText variant="caption" style={styles.kicker}>KEYORA · STAYOS</AppText><AppText variant="display" style={styles.heading}>Hospitality,{`\n`}beautifully run.</AppText><AppText style={styles.copy}>A production-grade command center for independent hotels, riads and modern stays.</AppText></View></View><View style={styles.panel}><AppText variant="title">Enter the live demo</AppText><AppText style={styles.muted}>Choose a role. Every workspace uses the same real-time operating model.</AppText><View style={styles.roles}>{roles.map(({ role, label, description, icon: Icon }) => <Pressable key={role} accessibilityRole="button" accessibilityLabel={`Continue as ${label}`} onPress={() => { signIn(role); router.replace('/dashboard'); }} style={({ pressed }) => [styles.role, pressed && styles.pressed]}><View style={styles.roleIcon}><Icon size={21} color={colors.ink} /></View><View style={styles.grow}><AppText variant="label">{label}</AppText><AppText variant="caption" style={styles.muted}>{description}</AppText></View></Pressable>)}</View></View></Screen>;
}
const styles = StyleSheet.create({ hero: { minHeight: 360, marginHorizontal: -20, marginTop: -12, padding: spacing.xl, justifyContent: 'flex-end', overflow: 'hidden' }, scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(12,12,11,.52)' }, brand: { gap: spacing.md }, kicker: { color: colors.lime, letterSpacing: 2 }, heading: { color: colors.white, fontSize: 48, lineHeight: 47 }, copy: { color: '#F2EEE6', maxWidth: 520 }, panel: { marginTop: -42, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.canvas, gap: spacing.md }, roles: { gap: spacing.md }, role: { minHeight: 78, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, pressed: { opacity: .72 }, roleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: spacing.xs }, muted: { color: colors.textMuted } });
