import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiConfig } from '../config';
import type { Actor } from './types';
import { AuthService } from './auth-service';

const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128), propertyId: z.uuid(), clientType: z.enum(['native', 'web']), deviceName: z.string().trim().min(1).max(160), mfaCode: z.string().regex(/^\d{6}$/).optional() }).strict();
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512).optional(), clientType: z.enum(['native', 'web']) }).strict();
const resetRequestSchema = z.object({ email: z.email().max(254), propertyId: z.uuid() }).strict();
const resetConfirmSchema = z.object({ token: z.string().min(32).max(512), newPassword: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).regex(/[^A-Za-z0-9]/) }).strict();
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const sessionParamsSchema = z.object({ id: z.uuid() });

export async function registerAuthRoutes(app: FastifyInstance, auth: AuthService, config: ApiConfig) {
  await app.register(cookie);
  const secure = config.profile === 'staging' || config.profile === 'production';
  const accessCookie = secure ? '__Host-keyora_access' : 'keyora_access';
  const refreshCookie = secure ? '__Host-keyora_refresh' : 'keyora_refresh';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
  const setWebCookies = (reply: FastifyReply, result: Awaited<ReturnType<AuthService['login']>>) => {
    reply.setCookie(accessCookie, result.accessToken, { ...cookieOptions, maxAge: 5 * 60 });
    reply.setCookie(refreshCookie, result.refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 });
  };
  const clearWebCookies = (reply: FastifyReply) => { reply.clearCookie(accessCookie, cookieOptions); reply.clearCookie(refreshCookie, cookieOptions); };
  const bearer = (request: FastifyRequest) => request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ?? request.cookies[accessCookie];
  const actor = async (request: FastifyRequest): Promise<Actor> => { const token = bearer(request); if (!token) throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 }); return auth.authenticate(token); };
  const authRateLimit = { config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '1 minute', groupId: 'authentication' } } } as const;
  const assertWebOrigin = (request: FastifyRequest) => {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !config.corsOrigins.includes(origin) || request.headers['sec-fetch-site'] === 'cross-site') {
      throw Object.assign(new Error('Request origin is not allowed.'), { statusCode: 403, code: 'CSRF_REJECTED' });
    }
  };

  app.post('/v1/auth/login', authRateLimit, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    if (input.clientType === 'web') assertWebOrigin(request);
    const result = await auth.login({ ...input, ip: request.ip, userAgent: request.headers['user-agent'] });
    if (input.clientType === 'web') { setWebCookies(reply, result); return { user: result.actor, accessExpiresInSeconds: 300 }; }
    return { user: result.actor, accessToken: result.accessToken, refreshToken: result.refreshToken, accessExpiresInSeconds: 300, refreshExpiresAt: result.refreshExpiresAt.toISOString() };
  });

  app.post('/v1/auth/refresh', authRateLimit, async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    if (input.clientType === 'web') assertWebOrigin(request);
    const presented = input.clientType === 'web' ? request.cookies[refreshCookie] : input.refreshToken;
    if (!presented) throw Object.assign(new Error('Refresh token is required.'), { statusCode: 401 });
    const result = await auth.refresh(presented, request.ip, request.headers['user-agent']);
    if (input.clientType === 'web') { setWebCookies(reply, result); return { user: result.actor, accessExpiresInSeconds: 300 }; }
    return { user: result.actor, accessToken: result.accessToken, refreshToken: result.refreshToken, accessExpiresInSeconds: 300, refreshExpiresAt: result.refreshExpiresAt.toISOString() };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const input = refreshSchema.partial().parse(request.body ?? {});
    await auth.logout(request.cookies[refreshCookie] ?? input.refreshToken);
    clearWebCookies(reply);
    return reply.status(204).send();
  });

  app.post('/v1/auth/password-reset/request', authRateLimit, async (request, reply) => { const input = resetRequestSchema.parse(request.body); try { await auth.requestPasswordReset(input.email, input.propertyId); } catch (error) { request.log.error({ err: error }, 'Password reset delivery failed'); } return reply.status(202).send({ accepted: true }); });
  app.post('/v1/auth/password-reset/confirm', authRateLimit, async (request, reply) => { const input = resetConfirmSchema.parse(request.body); await auth.confirmPasswordReset(input.token, input.newPassword); clearWebCookies(reply); return reply.status(204).send(); });
  app.get('/v1/auth/sessions', async (request) => auth.listSessions(await actor(request)));
  app.delete('/v1/auth/sessions/:id', async (request, reply) => { const params = sessionParamsSchema.parse(request.params); await auth.revokeSession(await actor(request), params.id); return reply.status(204).send(); });
  app.post('/v1/auth/mfa/setup', async (request) => auth.setupMfa(await actor(request)));
  app.post('/v1/auth/mfa/confirm', async (request, reply) => { const input = codeSchema.parse(request.body); await auth.confirmMfa(await actor(request), input.code); clearWebCookies(reply); return reply.status(204).send(); });
  app.post('/v1/auth/mfa/disable', async (request, reply) => { const input = codeSchema.parse(request.body); await auth.disableMfa(await actor(request), input.code); clearWebCookies(reply); return reply.status(204).send(); });
}
