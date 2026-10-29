export type TenantScope = { organizationId: string; propertyId: string };

export const queryKeys = {
  property: (scope: TenantScope) => ['organization', scope.organizationId, 'property', scope.propertyId] as const,
  rooms: (scope: TenantScope) => [...queryKeys.property(scope), 'rooms'] as const,
  reservations: (scope: TenantScope) => [...queryKeys.property(scope), 'reservations'] as const,
  guests: (scope: TenantScope) => [...queryKeys.property(scope), 'guests'] as const,
  housekeeping: (scope: TenantScope) => [...queryKeys.property(scope), 'housekeeping'] as const,
};
