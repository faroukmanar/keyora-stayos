import { hash, verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { decryptMfaSecret, encryptMfaSecret, createMfaSecret, verifyTotp } from './mfa';
import { TokenService, type AccessClaims } from './tokens';
import type { Actor, AuthRepository, AuthUser } from './types';
import type { AuditService } from '../observability/audit';

const unauthorized = () => Object.assign(new Error('Email, password, property, or verification code is invalid.'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
const invalidSession = () => Object.assign(new Error('The session is invalid or expired.'), { statusCode: 401, code: 'INVALID_SESSION' });

export type LoginInput = { email: string; password: string; propertyId: string; clientType: 'native' | 'web'; deviceName: string; mfaCode?: string; ip?: string; userAgent?: string };
export type AuthResult = { actor: Actor; accessToken: string; refreshToken: string; refreshExpiresAt: Date };

export class AuthService {
  private constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
    private readonly dummyPasswordHash: string,
    private readonly mfaKey: Buffer,
    private readonly deliverPasswordReset: (message: { email: string; token: string; expiresAt: Date }) => Promise<void>,
    private readonly audit?: AuditService,
  ) {}

  static async create(options: { repository: AuthRepository; accessTokenSecret: string; mfaKey: Buffer; deliverPasswordReset?: (message: { email: string; token: string; expiresAt: Date }) => Promise<void>; audit?:AuditService }) {
    const dummyPasswordHash = await hash('invalid-user-password-never-used', { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 });
    return new AuthService(options.repository, new TokenService(options.accessTokenSecret), dummyPasswordHash, options.mfaKey, options.deliverPasswordReset ?? (async () => {}),options.audit);
  }

  private async issue(user: AuthUser, clientType: 'native' | 'web', deviceName: string, ip?: string, userAgent?: string): Promise<AuthResult> {
    const refreshToken = this.tokens.createOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await this.repository.createSession({ user, familyId: randomUUID(), refreshTokenHash: this.tokens.hashOpaqueToken(refreshToken), clientType, deviceName, ipHash: this.tokens.hashMetadata(ip), userAgentHash: this.tokens.hashMetadata(userAgent), expiresAt: refreshExpiresAt });
    const accessToken = await this.tokens.createAccessToken({ userId: user.id, organizationId: user.organizationId, propertyId: user.propertyId, role: user.role, sessionId: session.id, passwordVersion: user.passwordVersion });
    return { actor: { id: user.id, organizationId: user.organizationId, propertyId: user.propertyId, displayName: user.displayName, role: user.role, passwordVersion: user.passwordVersion, sessionId: session.id }, accessToken, refreshToken, refreshExpiresAt };
  }

  async login(input: LoginInput) {
    const user = await this.repository.findLoginUser(input.email, input.propertyId);
    const validPassword = await verify(user?.passwordHash ?? this.dummyPasswordHash, input.password).catch(() => false);
    if (!user || user.status !== 'active' || (user.lockedUntil && user.lockedUntil > new Date()) || !validPassword) {
      if (user && (!user.lockedUntil || user.lockedUntil <= new Date())) await this.repository.recordLoginFailure(user);
      if(user)void this.audit?.record({organizationId:user.organizationId,propertyId:user.propertyId,actorUserId:user.id,category:'authentication',action:'authentication.login_failed',outcome:'denied',entityType:'session',requestId:randomUUID(),metadata:{reason:'invalid_credentials'}}).catch(()=>{});
      throw unauthorized();
    }
    if (user.mfaEnabled) {
      if (!user.mfaSecretCiphertext || !input.mfaCode || !verifyTotp(decryptMfaSecret(user.mfaSecretCiphertext, this.mfaKey), input.mfaCode)) {
        await this.repository.recordLoginFailure(user);
        throw unauthorized();
      }
    }
    await this.repository.recordLoginSuccess(user);
    const result=await this.issue(user, input.clientType, input.deviceName, input.ip, input.userAgent);
    void this.audit?.record({organizationId:user.organizationId,propertyId:user.propertyId,actorUserId:user.id,category:'authentication',action:'authentication.login_succeeded',outcome:'succeeded',entityType:'session',entityId:result.actor.sessionId,requestId:randomUUID(),metadata:{clientType:input.clientType}}).catch(()=>{});return result;
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<AuthResult> {
    if (!refreshToken || refreshToken.length < 32) throw invalidSession();
    const nextRefresh = this.tokens.createOpaqueToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await this.repository.rotateSession(this.tokens.hashOpaqueToken(refreshToken), this.tokens.hashOpaqueToken(nextRefresh), expiresAt, this.tokens.hashMetadata(ip), this.tokens.hashMetadata(userAgent));
    const accessToken = await this.tokens.createAccessToken({ userId: session.userId, organizationId: session.organizationId, propertyId: session.propertyId, role: session.role, sessionId: session.id, passwordVersion: session.passwordVersion });
    return { actor: { id: session.userId, organizationId: session.organizationId, propertyId: session.propertyId, displayName: session.displayName, role: session.role, passwordVersion: session.passwordVersion, sessionId: session.id }, accessToken, refreshToken: nextRefresh, refreshExpiresAt: expiresAt };
  }

  async logout(refreshToken?: string) { if (refreshToken) await this.repository.revokeSessionByHash(this.tokens.hashOpaqueToken(refreshToken), 'logout'); }

  async authenticate(accessToken: string): Promise<Actor> {
    let claims: AccessClaims;
    try { claims = await this.tokens.verifyAccessToken(accessToken); } catch { throw invalidSession(); }
    const session = await this.repository.getActorSession({ sessionId: claims.sessionId, userId: claims.userId, organizationId: claims.organizationId, propertyId: claims.propertyId });
    if (!session || session.passwordVersion !== claims.passwordVersion) throw invalidSession();
    return { id: session.userId, organizationId: session.organizationId, propertyId: session.propertyId, displayName: session.displayName, role: session.role, passwordVersion: session.passwordVersion, sessionId: session.id };
  }

  async requestPasswordReset(email: string, propertyId: string) {
    const user = await this.repository.findLoginUser(email, propertyId);
    if (!user) return;
    const token = this.tokens.createOpaqueToken(); const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.repository.createPasswordReset(user, this.tokens.hashOpaqueToken(token), expiresAt);
    await this.deliverPasswordReset({ email: user.email, token, expiresAt });
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    const passwordHash = await hash(newPassword, { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 });
    if (!await this.repository.consumePasswordReset(this.tokens.hashOpaqueToken(token), passwordHash)) throw invalidSession();
  }

  async listSessions(actor: Actor) { return this.repository.listSessions(actor); }
  async revokeSession(actor: Actor, sessionId: string) { if (!await this.repository.revokeSession(actor, sessionId)) throw Object.assign(new Error('Session not found.'), { statusCode: 404 }); }

  async setupMfa(actor: Actor, issuer = 'KEYORA StayOS') {
    const secret = createMfaSecret();
    await this.repository.setPendingMfa(actor, encryptMfaSecret(secret, this.mfaKey));
    const label = encodeURIComponent(`${issuer}:${actor.displayName}`);
    return { secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` };
  }

  async confirmMfa(actor: Actor, code: string) {
    const pending = await this.repository.getPendingMfa(actor);
    if (!pending || !verifyTotp(decryptMfaSecret(pending, this.mfaKey), code)) throw unauthorized();
    await this.repository.enableMfa(actor);
  }

  async disableMfa(actor: Actor, code: string) {
    const user = await this.repository.getUserForActor(actor);
    if (!user?.mfaEnabled || !user.mfaSecretCiphertext || !verifyTotp(decryptMfaSecret(user.mfaSecretCiphertext, this.mfaKey), code)) throw unauthorized();
    await this.repository.disableMfa(actor);
  }
}
