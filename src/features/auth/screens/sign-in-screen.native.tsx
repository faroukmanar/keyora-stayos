import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { signInNative } from '@/features/auth/native-session';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { AppInput } from '@/shared/components/app-input';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';

const demoPropertyId = '10000000-0000-4000-8000-000000000002';

export function SignInScreen() {
  const user = useAuthStore((state) => state.user);
  const sessionChecked = useAuthStore((state) => state.sessionChecked);
  const hydrate = useAuthStore((state) => state.hydrate);
  const [email, setEmail] = useState(__DEV__ ? 'owner@demo.keyora.test' : '');
  const [password, setPassword] = useState(__DEV__ ? 'Local-Test-Only!2026' : '');
  const [propertyId, setPropertyId] = useState(process.env.EXPO_PUBLIC_PROPERTY_ID ?? (__DEV__ ? demoPropertyId : ''));
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (!sessionChecked) return null;
  if (user) return <Redirect href="/dashboard" />;
  const submit = async () => {
    setError(''); setLoading(true);
    try {
      if (!z.string().email().safeParse(email).success || !z.string().uuid().safeParse(propertyId).success || !password) throw new Error('Enter a valid work email, password, and property ID.');
      hydrate(await signInNative({ email, password, propertyId, ...(mfaCode ? { mfaCode } : {}) }));
      router.replace('/dashboard');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Sign-in failed.'); } finally { setLoading(false); }
  };
  return <Screen background={colors.ink}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.shell}><View style={styles.hero}><Image source={require('../../../../assets/images/keyora-riad-hero.webp')} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="KEYORA riad courtyard" /><View style={styles.scrim} /><View style={styles.heroCopy}><AppText variant="caption" style={styles.kicker}>KEYORA · STAYOS</AppText><AppText variant="display" style={styles.heading}>Your secure{`\n`}operations desk.</AppText><View style={styles.trust}><ShieldCheck size={18} color={colors.lime} /><AppText variant="caption" style={styles.trustText}>Device-bound encrypted session · MFA ready</AppText></View></View></View><View style={styles.panel}><View style={styles.panelHead}><View style={styles.icon}><LockKeyhole size={21} color={colors.cobalt} /></View><View><AppText variant="title">Sign in</AppText><AppText style={styles.muted}>Use your assigned property workspace.</AppText></View></View><View style={styles.form}><AppInput label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" /><AppInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /><AppInput label="Property ID" value={propertyId} onChangeText={setPropertyId} autoCapitalize="none" /><AppInput label="MFA code (if enabled)" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" maxLength={6} />{error ? <View accessibilityRole="alert" style={styles.error}><AppText variant="caption" style={styles.errorText}>{error}</AppText></View> : null}<Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={submit} style={({ pressed }) => [styles.submit, pressed && styles.pressed, loading && styles.disabled]}><AppText variant="label" style={styles.submitText}>{loading ? 'Signing in…' : 'Open operations desk'}</AppText><ArrowRight size={19} color={colors.white} /></Pressable></View></View></KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({ shell: { flex: 1, justifyContent: 'center', gap: spacing.lg }, hero: { minHeight: 270, padding: spacing.xl, overflow: 'hidden', justifyContent: 'flex-end' }, scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(9,12,12,.58)' }, heroCopy: { gap: spacing.md }, kicker: { color: colors.lime, letterSpacing: 2 }, heading: { color: colors.white, fontSize: 42, lineHeight: 43 }, trust: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, trustText: { color: '#F0EEE7' }, panel: { padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.canvas, gap: spacing.xl }, panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, form: { gap: spacing.md }, muted: { color: colors.textMuted }, error: { padding: spacing.md, borderRadius: radii.md, backgroundColor: '#FFE8E4' }, errorText: { color: colors.danger }, submit: { minHeight: 52, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.cobalt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, submitText: { color: colors.white }, pressed: { opacity: .78 }, disabled: { opacity: .55 } });
