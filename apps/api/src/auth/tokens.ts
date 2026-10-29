import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { AppRole } from '../../../../packages/contracts/src';

export type AccessClaims = {
  userId: string;
  organizationId: string;
  propertyId: string;
  role: AppRole;
  sessionId: string;
  passwordVersion: number;
};

const encoder = new TextEncoder();

export class TokenService {
  private readonly secret: Uint8Array;
  constructor(secret: string, private readonly issuer = 'keyora-api', private readonly audience = 'keyora-clients') {
    this.secret = encoder.encode(secret);
  }

  async createAccessToken(claims: AccessClaims) {
    return new SignJWT({ org: claims.organizationId, property: claims.propertyId, role: claims.role, sid: claims.sessionId, pv: claims.passwordVersion })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti(randomBytes(16).toString('hex'))
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'], issuer: this.issuer, audience: this.audience, clockTolerance: 5 });
    if (!payload.sub || typeof payload.org !== 'string' || typeof payload.property !== 'string' || typeof payload.role !== 'string' || typeof payload.sid !== 'string' || typeof payload.pv !== 'number') throw new Error('Invalid access token claims');
    if (!['owner', 'manager', 'front-desk', 'housekeeping'].includes(payload.role)) throw new Error('Invalid access token role');
    return { userId: payload.sub, organizationId: payload.org, propertyId: payload.property, role: payload.role as AppRole, sessionId: payload.sid, passwordVersion: payload.pv };
  }

  createOpaqueToken() { return randomBytes(32).toString('base64url'); }
  hashOpaqueToken(token: string) { return createHash('sha256').update(token, 'utf8').digest(); }
  hashMetadata(value: string | undefined) { return value ? createHash('sha256').update(value, 'utf8').digest() : null; }
}
