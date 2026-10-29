import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const configSchema = z.object({
  KEYORA_PROFILE: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  API_HOST: z.ipv4().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  DATABASE_URL: z.string().url().default('postgresql://keyora:keyora-local-only@127.0.0.1:5432/keyora'),
  DATABASE_TLS: booleanString.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanString.default(false),
}).strict();

export type ApiConfig = {
  profile: 'local' | 'test' | 'staging' | 'production';
  host: string;
  port: number;
  corsOrigins: readonly string[];
  databaseUrl: string;
  databaseTls: boolean;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  trustProxy: boolean;
};

const allowedKeys = new Set(Object.keys(configSchema.shape));

export function loadConfig(environment: Record<string, string | undefined> = process.env): ApiConfig {
  const source = Object.fromEntries(Object.entries(environment).filter(([key]) => allowedKeys.has(key)));
  const value = configSchema.parse(source);
  const corsOrigins = [...new Set(value.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean))];
  if (corsOrigins.length === 0) throw new Error('CORS_ORIGINS must contain at least one explicit origin');
  if (corsOrigins.some((origin) => origin === '*' || !origin.startsWith('http'))) throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins; wildcards are forbidden');
  if ((value.KEYORA_PROFILE === 'staging' || value.KEYORA_PROFILE === 'production') && !value.DATABASE_TLS) throw new Error('DATABASE_TLS=true is required outside local/test profiles');
  if (value.KEYORA_PROFILE === 'production' && corsOrigins.some((origin) => origin.startsWith('http://'))) throw new Error('Production CORS origins must use HTTPS');
  if (value.KEYORA_PROFILE === 'production' && /localhost|127\.0\.0\.1|local-only/i.test(value.DATABASE_URL)) throw new Error('Production DATABASE_URL cannot use local/example credentials');
  return { profile: value.KEYORA_PROFILE, host: value.API_HOST, port: value.API_PORT, corsOrigins, databaseUrl: value.DATABASE_URL, databaseTls: value.DATABASE_TLS, logLevel: value.LOG_LEVEL, trustProxy: value.TRUST_PROXY };
}
