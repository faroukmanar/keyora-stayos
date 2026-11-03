import { z } from 'zod';
import { appRoleSchema } from '../../../packages/contracts/src';
import { clearNativeRefreshToken, loadNativeRefreshToken, saveNativeRefreshToken } from '@/services/auth/secure-session';
import type { AppUser } from '@/domain/models';

const responseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(32),
  user: z.object({ id: z.string().uuid(), organizationId: z.string().uuid(), propertyId: z.string().uuid(), displayName: z.string().min(1), role: appRoleSchema, sessionId: z.string().uuid() }).passthrough(),
}).passthrough();

const apiOrigin = () => new URL(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100').origin;
const toUser = (user: z.infer<typeof responseSchema>['user']): AppUser => ({ id: user.id, name: user.displayName, role: user.role, organizationId: user.organizationId, propertyId: user.propertyId, sessionId: user.sessionId });

export async function restoreNativeSession() {
  const refreshToken = await loadNativeRefreshToken();
  if (!refreshToken) return null;
  const response = await fetch(`${apiOrigin()}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ clientType: 'native', refreshToken }) });
  if (!response.ok) { await clearNativeRefreshToken(); return null; }
  const parsed = responseSchema.parse(await response.json());
  await saveNativeRefreshToken(parsed.refreshToken);
  return toUser(parsed.user);
}

export async function signInNative(input: { email: string; password: string; propertyId: string; mfaCode?: string }) {
  const response = await fetch(`${apiOrigin()}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ ...input, email: input.email.trim().toLowerCase(), clientType: 'native', deviceName: 'KEYORA StayOS mobile' }) });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message ?? 'Sign-in failed. Check your credentials and try again.'); }
  const parsed = responseSchema.parse(await response.json());
  await saveNativeRefreshToken(parsed.refreshToken);
  return toUser(parsed.user);
}

export async function signOutNative() { await clearNativeRefreshToken(); }
