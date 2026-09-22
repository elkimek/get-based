// @vitest-environment node
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleDevApiProxy } from '../lib/dev-api-proxy.js';
import { PROXY_MAX_RESPONSE_BYTES } from '../lib/proxy-policy.js';

afterEach(() => vi.restoreAllMocks());
function incoming(payload, env = {}) {
  const req = new EventEmitter(); req.method = 'POST'; req.destroy = vi.fn();
  const res = { writableEnded: false, writeHead: vi.fn(), end: vi.fn(function(body) { this.body = String(body ?? ''); this.writableEnded = true; }) };
  handleDevApiProxy(req, res, { env, corsHeaders: () => ({ 'Access-Control-Allow-Origin': 'http://localhost' }) });
  req.emit('data', Buffer.from(JSON.stringify(payload))); req.emit('end');
  return res;
}
function transport(method = 'request') {
  let respond;
  const request = new EventEmitter(); request.write = vi.fn(); request.end = vi.fn(); request.setTimeout = vi.fn(); request.destroy = vi.fn();
  const spy = vi.spyOn(https, method).mockImplementation((_url, _options, callback) => { respond = callback; return request; });
  return { request, spy, respond(headers = {}, statusCode = 200) {
    const response = new EventEmitter(); response.headers = headers; response.statusCode = statusCode;
    response.destroy = vi.fn(() => response.emit('close'));
    respond(response); return response;
  } };
}
const providers = ['oura', 'withings', 'polar', 'ultrahuman', 'whoop', 'google_health'];
const configured = provider => ({ [`${provider.toUpperCase()}_CLIENT_SECRET`]: 'server-secret', [`${provider.toUpperCase()}_CLIENT_ID`]: 'client', [`${provider.toUpperCase()}_ENABLED`]: 'true' });
const exchange = { code: 'auth-code', redirect_uri: 'http://localhost/callback', client_id: 'client' };
const refresh = { refresh_token: 'refresh-secret', client_id: 'client' };
const bodyOf = res => JSON.parse(res.body);

describe('development wearable OAuth boundaries', () => {
  for (const provider of providers) {
    for (const [operation, payload] of [['exchange', exchange], ['refresh', refresh]]) {
      it(`${provider} ${operation} sends the expected grant and relays rejection`, () => {
        const upstream = transport();
        const res = incoming({ [`${provider}_token_${operation}`]: payload }, configured(provider));
        expect(upstream.spy).toHaveBeenCalledOnce();
        const form = new URLSearchParams(upstream.request.write.mock.calls[0][0]);
        expect(form.get('grant_type')).toBe(operation === 'exchange' ? 'authorization_code' : 'refresh_token');
        expect(form.get(operation === 'exchange' ? 'code' : 'refresh_token')).toBe(operation === 'exchange' ? 'auth-code' : 'refresh-secret');
        if (provider === 'polar') {
          expect(upstream.spy.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('client:server-secret').toString('base64')}`);
          expect(form.has('client_secret')).toBe(false);
        } else expect(form.get('client_secret')).toBe('server-secret');
        if (provider === 'withings') expect(form.get('action')).toBe('requesttoken');
        if (provider === 'whoop' && operation === 'refresh') expect(form.get('scope')).toBe('offline');
        const response = upstream.respond({ 'content-type': 'application/json' }, 401);
        response.emit('data', Buffer.from('{"error":"invalid_grant"}')); response.emit('end');
        expect(res.writeHead.mock.calls[0][0]).toBe(401);
        expect(bodyOf(res)).toEqual({ error: 'invalid_grant' });
      });
      it(`${provider} ${operation} rejects missing grant fields without networking`, () => {
        const upstream = transport(); const res = incoming({ [`${provider}_token_${operation}`]: {} }, configured(provider));
        expect(res.writeHead.mock.calls[0][0]).toBe(400); expect(upstream.spy).not.toHaveBeenCalled();
      });
    }
    it(`${provider} requires deployment credentials`, () => {
      const upstream = transport(); const res = incoming({ [`${provider}_token_exchange`]: exchange });
      expect(res.writeHead.mock.calls[0][0]).toBe(['oura', 'polar', 'withings'].includes(provider) ? 500 : 503);
      expect(upstream.spy).not.toHaveBeenCalled();
    });
  }
  it.each(['whoop', 'ultrahuman'])('rejects a foreign %s client ID', provider => {
    const upstream = transport(); const res = incoming({ [`${provider}_token_exchange`]: { ...exchange, client_id: 'foreign' } }, configured(provider));
    expect(res.writeHead.mock.calls[0][0]).toBe(400); expect(upstream.spy).not.toHaveBeenCalled();
  });
  it.each(['declared', 'streamed'])('caps %s OAuth response bytes', mode => {
    const upstream = transport(); const res = incoming({ oura_token_exchange: exchange }, configured('oura'));
    const response = upstream.respond(mode === 'declared' ? { 'content-length': String(PROXY_MAX_RESPONSE_BYTES + 1) } : {});
    if (mode === 'streamed') response.emit('data', Buffer.alloc(PROXY_MAX_RESPONSE_BYTES + 1));
    response.emit('end'); response.emit('error', new Error('late failure'));
    expect(bodyOf(res).error).toContain('size cap'); expect(response.destroy).toHaveBeenCalledOnce(); expect(res.end).toHaveBeenCalledOnce();
  });
  it.each(['aborted', 'close', 'error'])('fails an interrupted OAuth response on %s exactly once', event => {
    const upstream = transport(); const res = incoming({ oura_token_refresh: refresh }, configured('oura'));
    const response = upstream.respond(); response.emit('data', Buffer.from('{'));
    response.emit(event, new Error('socket failure')); response.emit('end');
    upstream.request.emit('error', new Error('late request failure'));
    expect(res.writeHead.mock.calls[0][0]).toBe(502); expect(res.end).toHaveBeenCalledOnce();
  });
  it('returns a gateway error when the token endpoint cannot connect', () => {
    const upstream = transport(); const res = incoming({ oura_token_refresh: refresh }, configured('oura'));
    upstream.request.emit('error', new Error('connection refused'));
    expect(res.writeHead.mock.calls[0][0]).toBe(502); expect(bodyOf(res).error).toContain('unreachable');
  });
});

describe('development postal response failures', () => {
  const payload = { meteo: 'postal_geocode', country: 'Czechia', postalCode: '110 00' };
  it.each([
    ['malformed JSON', '{', 502],
    ['no matches', '[]', 404],
    ['object instead of results', '{}', 404],
    ['invalid coordinates', '[{"lat":"bad","lon":"14"}]', 404],
  ])('rejects %s', (_label, body, status) => {
    const upstream = transport('get'); const res = incoming(payload);
    const response = upstream.respond(); response.emit('data', Buffer.from(body)); response.emit('end');
    expect(res.writeHead.mock.calls[0][0]).toBe(status);
  });
  it('preserves lookup unavailability status', () => {
    const upstream = transport('get'); const res = incoming(payload);
    upstream.respond({}, 429).emit('end');
    expect(res.writeHead.mock.calls[0][0]).toBe(429); expect(bodyOf(res).error).toBe('Location lookup unavailable');
  });
  it('caps postal response bytes before parsing', () => {
    const upstream = transport('get'); const res = incoming(payload); const response = upstream.respond();
    response.emit('data', Buffer.alloc(65537)); response.emit('end');
    expect(bodyOf(res).error).toContain('size cap'); expect(res.end).toHaveBeenCalledOnce();
  });
  it('selects the normalized matching postcode and rounds coordinates', () => {
    const upstream = transport('get'); const res = incoming(payload); const response = upstream.respond();
    response.emit('data', Buffer.from(JSON.stringify([{ lat: 1, lon: 2 }, { lat: 50.087, lon: 14.421, address: { postcode: '11000' }, display_name: 'Prague' }])));
    response.emit('end');
    expect(bodyOf(res)).toMatchObject({ latitude: 50.1, longitude: 14.4, label: 'Prague', accuracyKm: 11, source: 'postal-area' });
  });
  it.each(['request', 'response'])('handles a postal %s transport error once', side => {
    const upstream = transport('get'); const res = incoming(payload); const response = upstream.respond();
    (side === 'request' ? upstream.request : response).emit('error', new Error('offline'));
    response.emit('end'); expect(res.writeHead.mock.calls[0][0]).toBe(502); expect(res.end).toHaveBeenCalledOnce();
  });
});

it.each([
  ['OAuth', 'request', { oura_token_refresh: refresh }, configured('oura')],
  ['postal', 'get', { meteo: 'postal_geocode', country: 'Czechia', postalCode: '11000' }, {}],
  ['CAMS', 'request', { meteo: 'cams', latitude: 50, longitude: 14 }, { UVDATA_UPSTREAM: 'https://weather.example' }],
  ['generic', 'request', { url: 'https://api.ouraring.com/v2/usercollection/daily_sleep' }, {}],
])('bounds an idle %s upstream and ignores late request errors', (_name, method, payload, env) => {
  const upstream = transport(method); const res = incoming(payload, env);
  expect(upstream.request.setTimeout).toHaveBeenCalledWith(180000, expect.any(Function));
  upstream.request.setTimeout.mock.calls[0][1]();
  upstream.request.emit('error', new Error('late failure'));
  expect(res.writeHead.mock.calls[0][0]).toBe(504); expect(upstream.request.destroy).toHaveBeenCalledOnce();
  expect(res.end).toHaveBeenCalledOnce();
});
