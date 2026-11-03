import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { z } from 'zod';
import { appRoleSchema } from '../../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { AppInput } from '@/shared/components/app-input';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';

const loginResponseSchema = z.object({ user: z.object({ id: z.string().uuid(), organizationId: z.string().uuid(), propertyId: z.string().uuid(), displayName: z.string().min(1), role: appRoleSchema, sessionId: z.string().uuid() }).passthrough(), accessExpiresInSeconds: z.number().int().positive() }).passthrough();
const localPropertyId = '10000000-0000-4000-8000-000000000002';

export function SignInScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const user = useAuthStore((state) => state.user);
  const sessionChecked = useAuthStore((state) => state.sessionChecked);
  const hydrate = useAuthStore((state) => state.hydrate);
  const [email, setEmail] = useState(__DEV__ ? 'owner@demo.keyora.test' : '');
  const [password, setPassword] = useState(__DEV__ ? 'Local-Test-Only!2026' : '');
  const [propertyId, setPropertyId] = useState(process.env.EXPO_PUBLIC_PROPERTY_ID ?? (__DEV__ ? localPropertyId : ''));
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (!sessionChecked) return null;
  if (user) return <Redirect href="/dashboard" />;

  const submit = async () => {
    setLoading(true); setError('');
    try {
      if (!z.string().email().safeParse(email).success || !z.string().uuid().safeParse(propertyId).success || !password) throw new Error('Enter a valid email, password, and property ID.');
      const apiUrl = new URL(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100').origin;
      const response = await fetch(`${apiUrl}/v1/auth/login`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password, propertyId, clientType: 'web', deviceName: 'KEYORA web console', ...(mfaCode ? { mfaCode } : {}) }) });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message ?? 'Sign-in failed. Check your credentials and try again.'); }
      const parsed = loginResponseSchema.parse(await response.json());
      hydrate({ id: parsed.user.id, name: parsed.user.displayName, role: parsed.user.role, organizationId: parsed.user.organizationId, propertyId: parsed.user.propertyId, sessionId: parsed.user.sessionId });
      router.replace('/dashboard');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Sign-in failed.'); } finally { setLoading(false); }
  };

  return <Screen background={colors.ink}><View style={[styles.shell, compact && styles.shellCompact]}><View style={[styles.visual, compact && styles.visualCompact]}><Image source={require('../../../../assets/images/keyora-riad-hero.webp')} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="KEYORA riad courtyard" /><View style={styles.scrim} /><View style={styles.visualCopy}><AppText variant="caption" style={styles.kicker}>KEYORA · STAYOS</AppText><AppText variant="display" style={[styles.heading, compact && styles.headingCompact]}>The calm side of{`\n`}busy hospitality.</AppText><AppText style={styles.heroBody}>One secure operations desk for reservations, rooms, guests, service, and the moments between.</AppText><View style={styles.trust}><ShieldCheck size={18} color={colors.lime} /><AppText variant="caption" style={styles.trustText}>Tenant isolated · HttpOnly session · MFA ready</AppText></View></View></View><View style={[styles.panel, compact && styles.panelCompact]}><View style={styles.panelHead}><View style={styles.lock}><LockKeyhole size={21} color={colors.cobalt} /></View><View><AppText variant="headline">Welcome back</AppText><AppText style={styles.muted}>Sign in to the live property workspace.</AppText></View></View><View style={styles.form}><AppInput label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" /><AppInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /><AppInput label="Property ID" value={propertyId} onChangeText={setPropertyId} autoCapitalize="none" /><AppInput label="MFA code (if enabled)" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" maxLength={6} />{error ? <View accessibilityRole="alert" style={styles.error}><KeyRound size={18} color={colors.danger} /><AppText variant="caption" style={styles.errorText}>{error}</AppText></View> : null}<Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={submit} style={({ pressed }) => [styles.submit, pressed && styles.pressed, loading && styles.disabled]}><AppText variant="label" style={styles.submitText}>{loading ? 'Signing in…' : 'Open operations desk'}</AppText><ArrowRight size={19} color={colors.white} /></Pressable></View><AppText variant="caption" style={styles.privacy}>Web credentials are sent only to the configured API. Tokens stay in Secure, HttpOnly, SameSite cookies and never enter browser storage.</AppText></View></View></Screen>;
}

const styles = StyleSheet.create({ shell: { width: '100%', maxWidth: 1180, minHeight: 680, alignSelf: 'center', flexDirection: 'row', borderRadius: 32, overflow: 'hidden', backgroundColor: colors.surface }, shellCompact: { minHeight: 0, flexDirection: 'column', borderRadius: 22 }, visual: { flex: 1.15, minHeight: 680, padding: 48, justifyContent: 'flex-end' }, visualCompact: { flex: 0, minHeight: 300, padding: spacing.xl }, scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(9,12,12,.58)' }, visualCopy: { maxWidth: 520, gap: spacing.lg }, kicker: { color: colors.lime, letterSpacing: 2 }, heading: { color: colors.white, fontSize: 58, lineHeight: 58 }, headingCompact: { fontSize: 38, lineHeight: 39 }, heroBody: { color: '#F0EEE7', maxWidth: 470 }, trust: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, trustText: { color: '#D7D4CB' }, panel: { width: '43%', minWidth: 390, padding: 44, justifyContent: 'center', gap: spacing.xl }, panelCompact: { width: '100%', minWidth: 0, padding: spacing.xl }, panelHead: { gap: spacing.lg }, lock: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, muted: { color: colors.textMuted }, form: { gap: spacing.md }, error: { padding: spacing.md, borderRadius: radii.md, backgroundColor: '#FFE8E4', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, errorText: { color: colors.danger, flex: 1 }, submit: { minHeight: 54, marginTop: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.cobalt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, submitText: { color: colors.white }, pressed: { opacity: .78 }, disabled: { opacity: .55 }, privacy: { color: colors.textMuted }, });
