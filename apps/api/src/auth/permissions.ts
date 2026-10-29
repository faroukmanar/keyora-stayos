import type { AppRole } from '../../../../packages/contracts/src';

export const permissions = [
  'property:manage', 'staff:manage', 'room:read', 'room:write', 'reservation:read', 'reservation:write',
  'reservation:check-in', 'guest:read', 'guest:write', 'guest:export', 'housekeeping:read', 'housekeeping:write',
  'payment:read', 'payment:refund', 'audit:read',
] as const;
export type Permission = typeof permissions[number];

const all = new Set<Permission>(permissions);
const rolePermissions: Record<AppRole, ReadonlySet<Permission>> = {
  owner: all,
  manager: new Set(permissions.filter((permission) => permission !== 'property:manage')),
  'front-desk': new Set(['room:read', 'room:write', 'reservation:read', 'reservation:write', 'reservation:check-in', 'guest:read', 'guest:write', 'payment:read', 'housekeeping:read']),
  housekeeping: new Set(['room:read', 'housekeeping:read', 'housekeeping:write']),
};

export function hasPermission(role: AppRole, permission: Permission) {
  return rolePermissions[role].has(permission);
}

export function assertPermission(role: AppRole, permission: Permission) {
  if (!hasPermission(role, permission)) {
    const error = new Error('You do not have permission to perform this action.') as Error & { statusCode: number; code: string };
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }
}
