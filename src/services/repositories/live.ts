import type { AppUser } from '@/domain/models';
import { createRepositories } from './factory';
import type { TenantScope } from './query-keys';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';

/** One HTTP client per app so token refresh is shared across every live query. */
export const repositories = createRepositories({ apiUrl });

export function scopeFor(user: AppUser | null): TenantScope | null {
  if (!user?.organizationId || !user.propertyId) return null;
  return { organizationId: user.organizationId, propertyId: user.propertyId };
}
