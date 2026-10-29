import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { z } from 'zod';
import { apiErrorSchema } from '../../../packages/contracts/src';
import { clearNativeRefreshToken, loadNativeRefreshToken, saveNativeRefreshToken } from '@/services/auth/secure-session';
import { ApiError } from './api-error';

type Fetcher = typeof fetch;
type ClientPlatform = 'native' | 'web';
type TokenStore = { load(): Promise<string | null>; save(token: string): Promise<void>; clear(): Promise<void> };
type RequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: z.ZodType<T>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

const refreshResponseSchema = z.object({ accessToken: z.string().min(1).optional(), refreshToken: z.string().min(32).optional() }).passthrough();
const nativeTokenStore: TokenStore = { load: loadNativeRefreshToken, save: saveNativeRefreshToken, clear: clearNativeRefreshToken };
const webTokenStore: TokenStore = { load: async () => null, save: async () => {}, clear: async () => {} };
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class HttpClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(private readonly options: {
    baseUrl: string;
    platform?: ClientPlatform;
    fetcher?: Fetcher;
    tokenStore?: TokenStore;
    uuid?: () => string;
    retryDelayMs?: number;
  }) {
    const url = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('API base URL must be an HTTP(S) origin without embedded credentials.');
    this.options.baseUrl = url.toString().replace(/\/$/, '');
  }

  private get platform() { return this.options.platform ?? (Platform.OS === 'web' ? 'web' : 'native'); }
  private get fetcher() { return this.options.fetcher ?? fetch; }
  private get tokenStore() { return this.options.tokenStore ?? (this.platform === 'web' ? webTokenStore : nativeTokenStore); }
  private createUuid() { return (this.options.uuid ?? Crypto.randomUUID)(); }
  setAccessToken(token: string | null) { this.accessToken = token; }

  async clearSession() { this.accessToken = null; await this.tokenStore.clear(); }

  async request<T>(options: RequestOptions<T>): Promise<T> {
    if (!options.path.startsWith('/') || options.path.startsWith('//')) throw new Error('Request path must be an origin-relative path.');
    const method = options.method ?? 'GET';
    const idempotencyKey = method === 'GET' ? undefined : options.idempotencyKey ?? this.createUuid();
    const execute = (token: string | null) => this.execute({ ...options, method, idempotencyKey }, token);
    let response = await execute(this.accessToken);
    if (response.status === 401) {
      await this.refresh();
      response = await execute(this.accessToken);
    }
    return this.parse(response, options.schema);
  }

  private async execute(options: RequestOptions<unknown> & { method: string; idempotencyKey?: string }, accessToken: string | null) {
    const headers: Record<string, string> = { accept: 'application/json', 'x-request-id': this.createUuid() };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (accessToken && this.platform === 'native') headers.authorization = `Bearer ${accessToken}`;
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
    const init: RequestInit = { method: options.method, headers, credentials: this.platform === 'web' ? 'include' : 'omit', body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal };
    const safeToRetry = options.method === 'GET';
    let lastError: unknown;
    for (let attempt = 0; attempt < (safeToRetry ? 3 : 1); attempt += 1) {
      try {
        const response = await this.fetcher(`${this.options.baseUrl}${options.path}`, init);
        if (!safeToRetry || ![502, 503, 504].includes(response.status) || attempt === 2) return response;
      } catch (error) {
        lastError = error;
        if (!safeToRetry || attempt === 2) throw new ApiError(0, 'NETWORK_ERROR', 'The network request failed.');
      }
      await delay((this.options.retryDelayMs ?? 100) * (attempt + 1));
    }
    throw lastError ?? new ApiError(0, 'NETWORK_ERROR', 'The network request failed.');
  }

  private async parse<T>(response: Response, schema: z.ZodType<T>) {
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      if (parsed.success) throw ApiError.from(response.status, parsed.data);
      throw new ApiError(response.status, 'INVALID_ERROR_RESPONSE', 'The server returned an invalid error response.', response.headers.get('x-request-id') ?? undefined);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(502, 'INVALID_API_RESPONSE', 'The server response did not match the versioned contract.');
    return parsed.data;
  }

  private async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const refreshToken = this.platform === 'native' ? await this.tokenStore.load() : null;
      if (this.platform === 'native' && !refreshToken) { await this.clearSession(); throw new ApiError(401, 'SESSION_EXPIRED', 'The session has expired.'); }
      const response = await this.fetcher(`${this.options.baseUrl}/v1/auth/refresh`, {
        method: 'POST', credentials: this.platform === 'web' ? 'include' : 'omit',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-request-id': this.createUuid() },
        body: JSON.stringify({ clientType: this.platform, ...(refreshToken ? { refreshToken } : {}) }),
      });
      if (!response.ok) { await this.clearSession(); throw new ApiError(401, 'SESSION_EXPIRED', 'The session has expired.'); }
      const payload = refreshResponseSchema.parse(await response.json());
      if (this.platform === 'native') {
        if (!payload.accessToken || !payload.refreshToken) { await this.clearSession(); throw new ApiError(502, 'INVALID_API_RESPONSE', 'The refresh response was invalid.'); }
        this.accessToken = payload.accessToken;
        await this.tokenStore.save(payload.refreshToken);
      }
    })().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }
}
