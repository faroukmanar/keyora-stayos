import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { API_VERSION, apiErrorSchema } from '../../../packages/contracts/src';
import type { ApiConfig } from './config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AppDependencies = { ready?: () => Promise<void> };

function statusFor(error: unknown) {
  if (error instanceof ZodError) return 422;
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) return error.statusCode;
  return 500;
}

export async function buildApp(config: ApiConfig, dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    trustProxy: config.trustProxy,
    requestIdHeader: false,
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      return typeof supplied === 'string' && UUID.test(supplied) ? supplied : randomUUID();
    },
    logger: config.profile === 'test' ? false : { level: config.logLevel, redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.token', 'req.body.refreshToken'], censor: '[REDACTED]' } },
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, {
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed'), false);
    },
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  app.get('/v1/health', async () => ({ status: 'ok' as const, version: API_VERSION }));
  app.get('/v1/ready', async (_request, reply) => {
    try {
      await dependencies.ready?.();
      return { status: 'ready' as const, version: API_VERSION };
    } catch {
      return reply.status(503).send({ status: 'unavailable', version: API_VERSION });
    }
  });
  app.setNotFoundHandler(async (request, reply) => reply.status(404).send(apiErrorSchema.parse({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', requestId: request.id } })));
  app.setErrorHandler(async (error, request, reply) => {
    const status = statusFor(error);
    if (status >= 500) request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
    const message = status >= 500 ? 'An unexpected error occurred.' : status === 422 ? 'The request failed validation.' : error instanceof Error ? error.message : 'The request could not be processed.';
    return reply.status(status).send(apiErrorSchema.parse({ error: { code: status >= 500 ? 'INTERNAL_ERROR' : status === 422 ? 'VALIDATION_ERROR' : 'REQUEST_ERROR', message, requestId: request.id } }));
  });
  return app;
}
