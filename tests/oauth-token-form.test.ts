import { describe, expect, it } from 'vitest';
import { createOAuthTokenForm } from '../lib/oauth-token-form.js';
import type { OAuthGrant, OAuthTokenFields, OAuthTokenFormSpec } from '../lib/oauth-token-form.js';

const input = { code: 'code&value', redirect_uri: 'http://localhost/callback', client_id: 'client', refresh_token: 'refresh value' };
const spec: OAuthTokenFormSpec = { provider: 'oura', secret: 'server secret' };

const wireCases: { grant: OAuthGrant; config: OAuthTokenFormSpec; expected: string }[] = [
  { grant: 'exchange', config: spec, expected: 'grant_type=authorization_code&code=code%26value&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&client_id=client&client_secret=server+secret' },
  { grant: 'refresh', config: spec, expected: 'grant_type=refresh_token&refresh_token=refresh+value&client_id=client&client_secret=server+secret' },
  { grant: 'exchange', config: { ...spec, provider: 'withings', action: 'requesttoken', exchangeFields: ['action', 'grant_type', 'client_id', 'client_secret', 'code', 'redirect_uri'] }, expected: 'action=requesttoken&grant_type=authorization_code&client_id=client&client_secret=server+secret&code=code%26value&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback' },
  { grant: 'refresh', config: { ...spec, provider: 'withings', action: 'requesttoken', refreshFields: ['action', 'grant_type', 'client_id', 'client_secret', 'refresh_token'] }, expected: 'action=requesttoken&grant_type=refresh_token&client_id=client&client_secret=server+secret&refresh_token=refresh+value' },
  { grant: 'exchange', config: { ...spec, provider: 'polar', exchangeFields: ['grant_type', 'code', 'redirect_uri'] }, expected: 'grant_type=authorization_code&code=code%26value&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback' },
  { grant: 'refresh', config: { ...spec, provider: 'polar', refreshFields: ['grant_type', 'refresh_token'] }, expected: 'grant_type=refresh_token&refresh_token=refresh+value' },
  { grant: 'refresh', config: { ...spec, provider: 'whoop', scope: 'offline', refreshFields: ['grant_type', 'refresh_token', 'client_id', 'client_secret', 'scope'] }, expected: 'grant_type=refresh_token&refresh_token=refresh+value&client_id=client&client_secret=server+secret&scope=offline' },
];

describe('shared OAuth wire contract', () => {
  it.each(wireCases)('preserves $config.provider $grant form bytes', ({ grant, config, expected }) => {
    const result = createOAuthTokenForm(input, grant, config);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.form.toString()).toBe(expected);
    expect(result.clientId).toBe('client');
  });

  for (const grant of ['exchange', 'refresh'] as const) {
    const required: (keyof OAuthTokenFields)[] = grant === 'exchange' ? ['code', 'redirect_uri', 'client_id'] : ['refresh_token', 'client_id'];
    it.each(required)('rejects a missing '+grant+' %s before coercion', field => {
      const poisonousCode = { toString() { throw new Error('must not coerce an invalid grant'); } };
      for (const value of [undefined, null, false, 0, '']) {
        const result = createOAuthTokenForm({ ...input, code: poisonousCode, [field]: value }, grant, spec);
        expect(result).toEqual({ ok: false, error: `oura_token_${grant} requires ${required.join(', ')}` });
      }
    });
  }

  it('rejects a configured client mismatch before converting the grant', () => {
    const result = createOAuthTokenForm({ ...input, code: { toString() { throw new Error('must not convert'); } } }, 'exchange', {
      ...spec, provider: 'whoop', clientId: 'deployment-client', clientMismatch: 'Client mismatch',
    });
    expect(result).toEqual({ ok: false, error: 'Client mismatch' });
  });

  it('retains property-read order and native coercion of truthy raw fields', () => {
    const trace: string[] = [];
    const raw = new Proxy({
      code: { toString() { trace.push('convert:code'); return 'raw code'; } },
      redirect_uri: ['https://example.com', 'callback'], client_id: 123,
    }, { get(target, key, receiver) { trace.push(String(key)); return Reflect.get(target, key, receiver); } });
    const result = createOAuthTokenForm(raw, 'exchange', spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.form.toString()).toBe('grant_type=authorization_code&code=raw+code&redirect_uri=https%3A%2F%2Fexample.com%2Ccallback&client_id=123&client_secret=server+secret');
    expect(trace).toEqual(['code', 'redirect_uri', 'client_id', 'convert:code']);
    expect(result.clientId).toBe(123);
  });
});
