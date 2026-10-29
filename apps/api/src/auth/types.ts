import type { AppRole } from '../../../../packages/contracts/src';

export type AuthUser = {
  id: string; organizationId: string; propertyId: string; email: string; displayName: string; passwordHash: string;
  passwordVersion: number; failedAuthAttempts: number; lockedUntil: Date | null; status: string; role: AppRole;
  mfaEnabled: boolean; mfaSecretCiphertext: Buffer | null;
};
export type Actor = Pick<AuthUser, 'id' | 'organizationId' | 'propertyId' | 'displayName' | 'role' | 'passwordVersion'> & { sessionId: string };
export type SessionRecord = {
  id: string; familyId: string; userId: string; organizationId: string; propertyId: string; role: AppRole;
  clientType: 'native' | 'web'; deviceName: string; expiresAt: Date; revokedAt: Date | null; passwordVersion: number; displayName: string;
};

export type NewSession = {
  user: AuthUser; familyId: string; refreshTokenHash: Buffer; clientType: 'native' | 'web'; deviceName: string;
  ipHash: Buffer | null; userAgentHash: Buffer | null; expiresAt: Date;
};

export interface AuthRepository {
  findLoginUser(email: string, propertyId: string): Promise<AuthUser | null>;
  getUserForActor(actor: Actor): Promise<AuthUser | null>;
  recordLoginFailure(user: AuthUser): Promise<{ lockedUntil: Date | null }>;
  recordLoginSuccess(user: AuthUser): Promise<void>;
  createSession(input: NewSession): Promise<SessionRecord>;
  rotateSession(refreshHash: Buffer, nextHash: Buffer, expiresAt: Date, ipHash: Buffer | null, userAgentHash: Buffer | null): Promise<SessionRecord>;
  revokeSessionByHash(refreshHash: Buffer, reason: string): Promise<void>;
  getActorSession(claims: { sessionId: string; userId: string; organizationId: string; propertyId: string }): Promise<SessionRecord | null>;
  listSessions(actor: Actor): Promise<Array<Pick<SessionRecord, 'id' | 'clientType' | 'deviceName' | 'expiresAt' | 'revokedAt'>>>;
  revokeSession(actor: Actor, sessionId: string): Promise<boolean>;
  createPasswordReset(user: AuthUser, tokenHash: Buffer, expiresAt: Date): Promise<void>;
  consumePasswordReset(tokenHash: Buffer, passwordHash: string): Promise<boolean>;
  setPendingMfa(actor: Actor, ciphertext: Buffer): Promise<void>;
  getPendingMfa(actor: Actor): Promise<Buffer | null>;
  enableMfa(actor: Actor): Promise<void>;
  disableMfa(actor: Actor): Promise<void>;
}
