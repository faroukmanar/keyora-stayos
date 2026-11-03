import { Bell, Building2, Check, Globe2, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppHeader } from '@/shared/components/app-header';
import { AppText } from '@/shared/components/app-text';
import { Screen } from '@/shared/components/screen';
import { colors, radii, spacing } from '@/theme/tokens';
import { useAuthStore } from '@/features/auth/store/auth-store';

export function SettingsScreen() {
  const propertyId = useAuthStore((state) => state.user?.propertyId);
  const [arrivalAlerts, setArrivalAlerts] = useState(true);
  const [taskAlerts, setTaskAlerts] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const save = async () => {
    if (!propertyId) { setSaveError('The authenticated session is missing a property scope.'); return; }
    setSaving(true); setSaveError(''); setSaved(false);
    try {
      const apiUrl = new URL(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100').origin;
      const response = await fetch(`${apiUrl}/v1/properties/${encodeURIComponent(propertyId)}/notification-preferences/me`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ locale: 'en', emailEnabled: true, pushEnabled: true, arrivalReminders: arrivalAlerts, quietStart: '22:00:00', quietEnd: '07:00:00', timezone: 'Africa/Casablanca', urgentBypass: taskAlerts, unsubscribedAt: null }) });
      if (!response.ok) throw new Error('Preferences could not be saved.');
      setSaved(true);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Preferences could not be saved.'); } finally { setSaving(false); }
  };
  return <Screen tabs><AppHeader eyebrow="KEYORA Medina" title="Settings" />
    <View style={styles.grid}><SettingSection icon={Building2} title="Property profile" description="Operational identity shared by web and mobile"><SettingLine label="Property" value="KEYORA Medina" /><SettingLine label="Timezone" value="Africa/Casablanca" /><SettingLine label="Currency" value="MAD" /></SettingSection><SettingSection icon={ShieldCheck} title="Security" description="Session and tenant controls enforced by the API"><SettingLine label="Web session" value="HttpOnly · SameSite Strict" /><SettingLine label="MFA" value="Required for owners" /><SettingLine label="Data scope" value="Property isolated" /></SettingSection><SettingSection icon={Bell} title="Notifications" description="Choose the operational events that need attention"><ToggleLine label="Arrival and departure alerts" value={arrivalAlerts} onValueChange={setArrivalAlerts} /><ToggleLine label="Blocked housekeeping tasks" value={taskAlerts} onValueChange={setTaskAlerts} /></SettingSection><SettingSection icon={Globe2} title="Locale" description="Interface and guest communication defaults"><SettingLine label="Interface" value="English" /><SettingLine label="Guest fallback" value="French" /><SettingLine label="Arabic" value="RTL ready" /></SettingSection></View>
    {saveError ? <View accessibilityRole="alert" style={styles.error}><AppText variant="caption" style={styles.errorText}>{saveError}</AppText></View> : null}<View style={styles.saveBar}><View style={styles.saveCopy}><LockKeyhole size={19} color={colors.success} /><View><AppText variant="label">Changes are tenant scoped</AppText><AppText variant="caption" style={styles.muted}>No credentials are stored in browser storage.</AppText></View></View><Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={save} style={[styles.save, saved && styles.saved]}>{saved ? <Check size={18} color={colors.ink} /> : null}<AppText variant="label" style={saved ? undefined : styles.saveText}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save preferences'}</AppText></Pressable></View>
  </Screen>;
}
function SettingSection({ icon: Icon, title, description, children }: React.PropsWithChildren<{ icon: typeof Building2; title: string; description: string }>) { return <View style={styles.section}><View style={styles.sectionHead}><View style={styles.icon}><Icon size={20} color={colors.cobalt} /></View><View style={styles.grow}><AppText variant="title">{title}</AppText><AppText variant="caption" style={styles.muted}>{description}</AppText></View></View><View style={styles.lines}>{children}</View></View>; }
function SettingLine({ label, value }: { label: string; value: string }) { return <View style={styles.line}><AppText style={styles.muted}>{label}</AppText><AppText variant="label">{value}</AppText></View>; }
function ToggleLine({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.line}><AppText style={styles.grow}>{label}</AppText><Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ false: colors.surfaceMuted, true: colors.cobalt }} thumbColor={colors.white} /></View>; }
const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, section: { minWidth: 300, flexGrow: 1, flexBasis: '47%', padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.lg }, sectionHead: { flexDirection: 'row', gap: spacing.md }, icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1 }, muted: { color: colors.textMuted }, lines: { borderTopWidth: 1, borderTopColor: colors.border }, line: { minHeight: 54, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, error: { padding: spacing.md, borderRadius: radii.md, backgroundColor: '#FFE8E4' }, errorText: { color: colors.danger }, saveBar: { minHeight: 78, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }, saveCopy: { flex: 1, minWidth: 240, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, save: { minHeight: 46, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.cobalt, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, saved: { backgroundColor: colors.lime }, saveText: { color: colors.white }, });
