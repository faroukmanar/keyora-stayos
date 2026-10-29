import type { ApiConfig } from '../config';

export function createPasswordResetDelivery(config: ApiConfig) {
  if (!config.emailProviderUrl || !config.emailProviderToken || !config.passwordResetWebUrl) return undefined;
  return async ({ email, token, expiresAt }: { email: string; token: string; expiresAt: Date }) => {
    const resetUrl = new URL(config.passwordResetWebUrl!);
    resetUrl.searchParams.set('token', token);
    const response = await fetch(config.emailProviderUrl!, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.emailProviderToken}`, 'content-type': 'application/json', 'user-agent': 'keyora-api/1.0' },
      body: JSON.stringify({ template: 'password-reset-v1', recipient: email, variables: { resetUrl: resetUrl.toString(), expiresAt: expiresAt.toISOString() } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Password reset provider failed with status ${response.status}`);
  };
}
