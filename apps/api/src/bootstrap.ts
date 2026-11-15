import pg from 'pg';
import Redis from 'ioredis';
import type { AppDependencies } from './app';
import type { ApiConfig } from './config';
import { AuthService } from './auth/auth-service';
import { PgAuthRepository } from './auth/pg-auth-repository';
import { createPasswordResetDelivery } from './auth/password-reset-delivery';
import { NotificationService } from './notifications/notification-service';
import { FakeNotificationProvider, HttpNotificationProvider } from './notifications/provider';
import { PgNotificationRepository } from './notifications/pg-notification-repository';
import { MetricsService } from './observability/metrics';
import { BufferedExporter } from './observability/telemetry';
import { AuditService } from './observability/audit';

/** Production composition root. Tests use it too so the real server cannot silently drop route groups. */
export async function createDependencies(config: ApiConfig): Promise<AppDependencies> {
  const rateLimitRedis = config.rateLimitRedisUrl ? new Redis(config.rateLimitRedisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 5_000 }) : undefined;
  if (rateLimitRedis) await rateLimitRedis.connect();
  const pool = config.databaseMode === 'required' ? new pg.Pool({ connectionString: config.databaseUrl, ssl: config.databaseTls ? { rejectUnauthorized: true } : undefined, max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }) : undefined;
  const metrics = new MetricsService({ environment: config.profile, version: config.serviceVersion });
  const traceExporter = new BufferedExporter({ mode: config.observabilityMode, url: config.traceExportUrl, token: config.traceExportToken, metrics, kind: 'trace' });
  const errorExporter = new BufferedExporter({ mode: config.observabilityMode, url: config.errorReportUrl, token: config.errorReportToken, metrics, kind: 'error' });
  const audit = pool ? new AuditService(pool) : undefined;
  const auth = pool ? await AuthService.create({ repository: new PgAuthRepository(pool), accessTokenSecret: config.accessTokenSecret, mfaKey: config.mfaEncryptionKey, deliverPasswordReset: createPasswordResetDelivery(config), audit }) : undefined;
  const notificationProvider = config.notificationMode === 'http' ? new HttpNotificationProvider(config.notificationProviderUrl!, config.notificationProviderToken!) : new FakeNotificationProvider();
  const notifications = pool ? new NotificationService(new PgNotificationRepository(pool), notificationProvider, config.notificationEncryptionKey, config.notificationWebhookSecret ?? config.accessTokenSecret) : undefined;
  return {
    auth,
    notifications,
    pool,
    metrics,
    traceExporter,
    errorExporter,
    rateLimitRedis,
    ready: pool ? async () => { const client = await pool.connect(); try { await client.query('SELECT 1'); } finally { client.release(); } } : undefined,
    close: async () => { await Promise.all([traceExporter.close(), errorExporter.close(), rateLimitRedis?.quit()]); if (pool) await pool.end(); },
  };
}
