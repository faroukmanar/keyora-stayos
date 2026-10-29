import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type Redis from 'ioredis';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { API_VERSION, apiErrorSchema } from '../../../packages/contracts/src';
import { registerAuthRoutes } from './auth/routes';
import type { AuthService } from './auth/auth-service';
import { registerNotificationRoutes } from './notifications/routes';
import type { NotificationService } from './notifications/notification-service';
import type{MetricsService}from'./observability/metrics';
import{traceContext,sanitizeTelemetryMessage,type BufferedExporter,type SpanRecord,type ErrorRecord}from'./observability/telemetry';
import{timingSafeEqual}from'node:crypto';
import type { ApiConfig } from './config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AppDependencies = { ready?: () => Promise<void>; auth?: AuthService; notifications?: NotificationService; metrics?:MetricsService; traceExporter?:BufferedExporter; errorExporter?:BufferedExporter; rateLimitRedis?: Redis; close?: () => Promise<void> };

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
    logger: config.profile === 'test' ? false : { level: config.logLevel,base:{service:'keyora-api',environment:config.profile,version:config.serviceVersion}, redact: { paths: ['req.headers.authorization','req.headers.cookie','req.headers.set-cookie','req.body','res.headers.set-cookie','password','token','refreshToken','secret'], censor: '[REDACTED]' },serializers:{req(request){return{method:request.method,url:String(request.url).split('?')[0],id:request.id};},res(reply){return{statusCode:reply.statusCode};}} },
  });

  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(rateLimit, {
    global: true,
    redis: dependencies.rateLimitRedis,
    skipOnError: false,
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    allowList: (request) => request.routeOptions.url === '/v1/health' || request.routeOptions.url === '/v1/ready',
  });
  await app.register(cors, {
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(Object.assign(new Error('Origin is not allowed'), { statusCode: 403, code: 'CORS_REJECTED' }), false);
    },
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const cookie = request.headers.cookie ?? '';
    const usesWebSession = /(?:^|;\s*)(?:__Host-)?keyora_(?:access|refresh)=/.test(cookie);
    if (!usesWebSession) return;
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];
    if (typeof origin !== 'string' || !config.corsOrigins.includes(origin) || fetchSite === 'cross-site') {
      return reply.status(403).send({ error: { code: 'CSRF_REJECTED', message: 'Request origin is not allowed.', requestId: request.id } });
    }
  });
  if (dependencies.auth) await registerAuthRoutes(app, dependencies.auth, config);
  if (dependencies.auth && dependencies.notifications) await registerNotificationRoutes(app, dependencies.notifications, dependencies.auth);
  if (dependencies.close) app.addHook('onClose', dependencies.close);
  const observations=new WeakMap<object,{start:bigint;traceId:string;spanId:string;parentSpanId?:string}>();
  app.addHook('onRequest',async(request,reply)=>{const context=traceContext(typeof request.headers.traceparent==='string'?request.headers.traceparent:undefined);observations.set(request,{start:process.hrtime.bigint(),...context});reply.header('traceparent',`00-${context.traceId}-${context.spanId}-01`);});
  app.addHook('onResponse',async(request,reply)=>{const observation=observations.get(request);if(!observation)return;const durationMs=Number(process.hrtime.bigint()-observation.start)/1e6;const route=request.routeOptions.url??'unmatched';dependencies.metrics?.observeRequest(request.method,route,reply.statusCode,durationMs/1000);dependencies.traceExporter?.record({traceId:observation.traceId,spanId:observation.spanId,parentSpanId:observation.parentSpanId,name:`${request.method} ${route}`,method:request.method,status:reply.statusCode,durationMs,requestId:request.id,environment:config.profile,version:config.serviceVersion,timestamp:new Date().toISOString()} satisfies SpanRecord);});
  if(dependencies.metrics)app.get('/internal/metrics',async(request,reply)=>{const presented=request.headers.authorization?.replace(/^Bearer\s+/i,'')??'';const expected=Buffer.from(config.metricsToken);const actual=Buffer.from(presented);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply.status(401).send({error:{code:'UNAUTHORIZED',message:'Authentication required.',requestId:request.id}});reply.header('content-type',dependencies.metrics!.contentType());return reply.send(await dependencies.metrics!.render());});

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
    const message = status >= 500 ? 'An unexpected error occurred.' : status === 429 ? 'Too many requests. Try again later.' : status === 422 ? 'The request failed validation.' : error instanceof Error ? error.message : 'The request could not be processed.';
    const suppliedCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
    const route=request.routeOptions.url??'unmatched';dependencies.metrics?.error(route,suppliedCode??(status>=500?'INTERNAL_ERROR':'REQUEST_ERROR'));if(status>=500){const observation=observations.get(request);dependencies.errorExporter?.record({traceId:observation?.traceId??'0'.repeat(32),requestId:request.id,route,type:error instanceof Error?error.name:'Error',code:suppliedCode??'INTERNAL_ERROR',message:sanitizeTelemetryMessage(error instanceof Error?error.message:'unexpected'),environment:config.profile,version:config.serviceVersion,timestamp:new Date().toISOString()} satisfies ErrorRecord);}
    return reply.status(status).send(apiErrorSchema.parse({ error: { code: status >= 500 ? 'INTERNAL_ERROR' : status === 429 ? 'RATE_LIMITED' : status === 422 ? 'VALIDATION_ERROR' : suppliedCode ?? 'REQUEST_ERROR', message, requestId: request.id } }));
  });
  return app;
}
