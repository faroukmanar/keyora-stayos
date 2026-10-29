import { buildApp } from './app';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  const app = await buildApp(config);
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
