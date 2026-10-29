import { z } from 'zod';
import { ApiError } from '@/services/http/api-error';
import { HttpClient } from '@/services/http/http-client';
import { queryKeys } from '@/services/repositories/query-keys';

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } } as Response;
}

const uuids = Array.from({ length: 30 }, (_, index) => `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const uuidFactory = () => uuids.shift() ?? '50000000-0000-4000-8000-999999999999';
const tokenStore = () => {
  let token: string | null = 'refresh-before';
  return { load: jest.fn(async () => token), save: jest.fn(async (next: string) => { token = next; }), clear: jest.fn(async () => { token = null; }) };
};

describe('HttpClient', () => {
  it('validates successful responses at runtime', async () => {
    const client = new HttpClient({ baseUrl: 'https://api.example.test', platform: 'native', uuid: uuidFactory, fetcher: jest.fn(async () => response(200, { value: 'safe' })) });
    await expect(client.request({ path: '/v1/value', schema: z.object({ value: z.literal('safe') }) })).resolves.toEqual({ value: 'safe' });
    const invalid = new HttpClient({ baseUrl: 'https://api.example.test', platform: 'native', uuid: uuidFactory, fetcher: jest.fn(async () => response(200, { value: 42 })) });
    await expect(invalid.request({ path: '/v1/value', schema: z.object({ value: z.string() }) })).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE', status: 502 });
  });

  it('uses one refresh for concurrent 401 responses', async () => {
    const store = tokenStore(); let refreshes = 0;
    const fetcher = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/v1/auth/refresh')) { refreshes += 1; await Promise.resolve(); return response(200, { accessToken: 'access-after', refreshToken: 'refresh-token-after-rotation-1234567890' }); }
      return (init?.headers as Record<string, string>).authorization === 'Bearer access-after' ? response(200, { value: 'ok' }) : response(401, { error: { code: 'INVALID_SESSION', message: 'expired', requestId: '50000000-0000-4000-8000-000000000099' } });
    }) as typeof fetch;
    const client = new HttpClient({ baseUrl: 'https://api.example.test', platform: 'native', uuid: uuidFactory, fetcher, tokenStore: store });
    client.setAccessToken('access-before');
    await expect(Promise.all(Array.from({ length: 4 }, () => client.request({ path: '/v1/value', schema: z.object({ value: z.string() }) })))).resolves.toHaveLength(4);
    expect(refreshes).toBe(1);
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledWith('refresh-token-after-rotation-1234567890');
  });

  it('never blindly retries unsafe mutations and preserves idempotency through an auth refresh', async () => {
    const failing = jest.fn(async () => { throw new Error('offline'); }) as typeof fetch;
    const noRetry = new HttpClient({ baseUrl: 'https://api.example.test', platform: 'native', uuid: uuidFactory, fetcher: failing, tokenStore: tokenStore(), retryDelayMs: 0 });
    await expect(noRetry.request({ method: 'POST', path: '/v1/commands', body: {}, schema: z.object({ ok: z.boolean() }) })).rejects.toBeInstanceOf(ApiError);
    expect(failing).toHaveBeenCalledTimes(1);

    const keys: string[] = []; let commandCalls = 0;
    const fetcher = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/v1/auth/refresh')) return response(200, { accessToken: 'access-new', refreshToken: 'refresh-token-after-rotation-1234567890' });
      commandCalls += 1; keys.push((init?.headers as Record<string, string>)['idempotency-key']);
      return commandCalls === 1 ? response(401, { error: { code: 'INVALID_SESSION', message: 'expired', requestId: '50000000-0000-4000-8000-000000000098' } }) : response(200, { ok: true });
    }) as typeof fetch;
    const client = new HttpClient({ baseUrl: 'https://api.example.test', platform: 'native', uuid: uuidFactory, fetcher, tokenStore: tokenStore() });
    client.setAccessToken('access-old');
    await expect(client.request({ method: 'POST', path: '/v1/commands', body: {}, schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('scopes every query key by organization and property', () => {
    const a = { organizationId: 'org-a', propertyId: 'property-a' };
    const b = { organizationId: 'org-a', propertyId: 'property-b' };
    expect(queryKeys.rooms(a)).not.toEqual(queryKeys.rooms(b));
    expect(queryKeys.reservations(a).slice(0, 4)).toEqual(['organization', 'org-a', 'property', 'property-a']);
  });
});
