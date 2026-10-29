import { buildApp } from './app';
import pg from 'pg';
import { loadConfig } from './config';
import { AuthService } from './auth/auth-service';
import { PgAuthRepository } from './auth/pg-auth-repository';
import { createPasswordResetDelivery } from './auth/password-reset-delivery';
import { NotificationService } from './notifications/notification-service';
import { FakeNotificationProvider, HttpNotificationProvider } from './notifications/provider';
import { PgNotificationRepository } from './notifications/pg-notification-repository';
import{MetricsService}from'./observability/metrics';
import{BufferedExporter}from'./observability/telemetry';
import{AuditService}from'./observability/audit';
import Redis from 'ioredis';

async function main() {
  const config = loadConfig();
  const rateLimitRedis = config.rateLimitRedisUrl ? new Redis(config.rateLimitRedisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 5_000 }) : undefined;
  if (rateLimitRedis) await rateLimitRedis.connect();
  const pool = config.databaseMode === 'required' ? new pg.Pool({ connectionString: config.databaseUrl, ssl: config.databaseTls ? { rejectUnauthorized: true } : undefined, max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }) : null;
  const metrics=new MetricsService({environment:config.profile,version:config.serviceVersion});const traceExporter=new BufferedExporter({mode:config.observabilityMode,url:config.traceExportUrl,token:config.traceExportToken,metrics,kind:'trace'});const errorExporter=new BufferedExporter({mode:config.observabilityMode,url:config.errorReportUrl,token:config.errorReportToken,metrics,kind:'error'});const audit=pool?new AuditService(pool):undefined;
  const auth = pool ? await AuthService.create({ repository: new PgAuthRepository(pool), accessTokenSecret: config.accessTokenSecret, mfaKey: config.mfaEncryptionKey, deliverPasswordReset: createPasswordResetDelivery(config),audit }) : undefined;
  const notificationProvider = config.notificationMode === 'http' ? new HttpNotificationProvider(config.notificationProviderUrl!, config.notificationProviderToken!) : new FakeNotificationProvider();
  const notifications = pool ? new NotificationService(new PgNotificationRepository(pool), notificationProvider, config.notificationEncryptionKey, config.notificationWebhookSecret ?? config.accessTokenSecret) : undefined;
  const app = await buildApp(config, {
    auth,
    notifications,
    metrics,traceExporter,errorExporter,rateLimitRedis,
    ready: pool ? async () => { const client = await pool.connect(); try { await client.query('SELECT 1'); } finally { client.release(); } } : undefined,
    close: async()=>{await Promise.all([traceExporter.close(),errorExporter.close(),rateLimitRedis?.quit()]);if(pool)await pool.end();},
  });
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Graceful shutdown started');
    const timer = setTimeout(() => { app.log.fatal('Graceful shutdown timed out'); process.exit(1); }, 10_000);
    try { await app.close(); process.exitCode = 0; }
    catch (error) { app.log.error({ err: error }, 'Graceful shutdown failed'); process.exitCode = 1; }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('uncaughtException', (error) => { app.log.fatal({ err: error }, 'Uncaught exception'); void shutdown('uncaughtException'); });
  process.once('unhandledRejection', (error) => { app.log.fatal({ err: error }, 'Unhandled rejection'); void shutdown('unhandledRejection'); });
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ profile: config.profile, host: config.host, port: config.port }, 'KEYORA API listening');
}

void main().catch((error) => {
  console.error('KEYORA API failed to start:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
