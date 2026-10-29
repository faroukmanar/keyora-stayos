import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const configSchema = z.object({
  KEYORA_PROFILE: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  API_HOST: z.ipv4().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  DATABASE_URL: z.string().url().default('postgresql://keyora:keyora-local-only@127.0.0.1:5432/keyora'),
  DATABASE_TLS: booleanString.default(false),
  DATABASE_MODE: z.enum(['disabled', 'required']).default('disabled'),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('local-only-access-token-secret-32-chars'),
  MFA_ENCRYPTION_KEY_BASE64: z.string().optional(),
  EMAIL_PROVIDER_URL: z.string().url().optional(),
  EMAIL_PROVIDER_TOKEN: z.string().min(20).optional(),
  PASSWORD_RESET_WEB_URL: z.string().url().optional(),
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
  databaseMode: 'disabled' | 'required';
  accessTokenSecret: string;
  mfaEncryptionKey: Buffer;
  emailProviderUrl?: string;
  emailProviderToken?: string;
  passwordResetWebUrl?: string;
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
  if ((value.KEYORA_PROFILE === 'staging' || value.KEYORA_PROFILE === 'production') && /owner|postgres/i.test(new URL(value.DATABASE_URL).username)) throw new Error('Runtime DATABASE_URL must use a restricted non-owner login');
  if ((value.KEYORA_PROFILE === 'staging' || value.KEYORA_PROFILE === 'production') && value.DATABASE_MODE !== 'required') throw new Error('DATABASE_MODE=required is mandatory outside local/test profiles');
  if ((value.KEYORA_PROFILE === 'staging' || value.KEYORA_PROFILE === 'production') && /local-only|replace-with/i.test(value.ACCESS_TOKEN_SECRET)) throw new Error('A unique ACCESS_TOKEN_SECRET is required outside local/test profiles');
  const mfaEncryptionKey = value.MFA_ENCRYPTION_KEY_BASE64 && !value.MFA_ENCRYPTION_KEY_BASE64.startsWith('replace-with')
    ? Buffer.from(value.MFA_ENCRYPTION_KEY_BASE64, 'base64')
    : Buffer.from(value.ACCESS_TOKEN_SECRET.padEnd(32, '0').slice(0, 32));
  if (mfaEncryptionKey.length !== 32) throw new Error('MFA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
  if ((value.KEYORA_PROFILE === 'staging' || value.KEYORA_PROFILE === 'production') && !value.MFA_ENCRYPTION_KEY_BASE64) throw new Error('MFA_ENCRYPTION_KEY_BASE64 is required outside local/test profiles');
  if (value.KEYORA_PROFILE === 'production') {
    if (!value.EMAIL_PROVIDER_URL || !value.EMAIL_PROVIDER_TOKEN || !value.PASSWORD_RESET_WEB_URL) throw new Error('Production password recovery requires EMAIL_PROVIDER_URL, EMAIL_PROVIDER_TOKEN, and PASSWORD_RESET_WEB_URL');
    if (![value.EMAIL_PROVIDER_URL, value.PASSWORD_RESET_WEB_URL].every((url) => url.startsWith('https://'))) throw new Error('Production password recovery URLs must use HTTPS');
    if (value.EMAIL_PROVIDER_TOKEN.startsWith('replace-')) throw new Error('Production EMAIL_PROVIDER_TOKEN must come from the secret manager');
  }
  return { profile: value.KEYORA_PROFILE, host: value.API_HOST, port: value.API_PORT, corsOrigins, databaseUrl: value.DATABASE_URL, databaseTls: value.DATABASE_TLS, databaseMode: value.DATABASE_MODE, accessTokenSecret: value.ACCESS_TOKEN_SECRET, mfaEncryptionKey, emailProviderUrl: value.EMAIL_PROVIDER_URL, emailProviderToken: value.EMAIL_PROVIDER_TOKEN, passwordResetWebUrl: value.PASSWORD_RESET_WEB_URL, logLevel: value.LOG_LEVEL, trustProxy: value.TRUST_PROXY };
}
