export type AppRole = 'owner' | 'manager' | 'front-desk' | 'housekeeping';

export type AppUser = { id: string; name: string; role: AppRole; organizationId?: string; propertyId?: string; sessionId?: string };
