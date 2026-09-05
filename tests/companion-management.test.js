// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCompanionManagement, isAllowedCompanionManagementParent } from '../lib/companion-management.js';
import { findExistingCompanion } from '../lib/companion-existing.js';

const origin = 'http://127.0.0.1:8324';
const navigation = { Host: '127.0.0.1:8324', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
const local = { Host: '127.0.0.1:8324', Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' };
async function session(handle) {
  const response = await handle(new Request(origin + '/manage', { headers: navigation }));
  const html = await response.text();
  return { response, html, token: html.match(/const credential="([^"]+)"/)[1] };
}

describe('local Companion management', () => {
  it('allows only exact getbased management parents, never arbitrary chat origins', () => {
    for (const origin of ['https://app.getbased.health', 'http://127.0.0.1:8000', 'http://localhost:8000']) {
      expect(isAllowedCompanionManagementParent(origin)).toBe(true);
    }
    for (const origin of ['http://127.0.0.1:9999', 'http://localhost:8080', 'https://custom-chat.example', 'https://app.getbased.health:8443', 'https://app.getbased.health.attacker.example', 'null', '']) {
      expect(isAllowedCompanionManagementParent(origin)).toBe(false);
    }
  });
  it('uses an isolated navigation-only page, not discovery or the persistent token', async () => {
    const control = vi.fn(async () => Response.json({ ok: true }));
    const handle = createCompanionManagement({ status: () => ({ runtimeMode: 'installed' }), control });
    const { response, html, token } = await session(handle);
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(html).toContain('Automatic startup');
    const result = await handle(new Request(origin + '/manage/control', { method: 'POST', headers: { ...local, Authorization: `Bearer ${token}` }, body: '{"action":"pause"}' }));
    expect(result.status).toBe(200);
    expect(result.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(control).toHaveBeenCalledOnce();
    for (const headers of [
      { ...local, Origin: 'https://app.getbased.health', 'Sec-Fetch-Site': 'cross-site' },
      { ...local, Host: 'attacker.example:8324' },
      { ...local, Authorization: 'Bearer discovery-token' },
    ]) {
      const denied = await handle(new Request(origin + '/manage/control', { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers }, body: '{}' }));
      expect(denied.status).toBe(403);
    }
    expect(control).toHaveBeenCalledOnce();
  });
  it('embeds only for an approved exact parent origin and keeps control credentials local', async () => {
    const parent = 'https://app.getbased.health';
    const control = vi.fn(async () => Response.json({ ok: true }));
    const handle = createCompanionManagement({ status: () => ({}), control, allowParentOrigin: value => value === parent });
    const embed = (value, headers = {}) => handle(new Request(`${origin}/manage/embed?parentOrigin=${encodeURIComponent(value)}`, {
      headers: { ...navigation, 'Sec-Fetch-Dest': 'iframe', ...headers },
    }));
    expect((await embed('https://attacker.example')).status).toBe(403);
    expect((await embed(parent + '/path')).status).toBe(403);
    expect((await embed(parent, { 'Sec-Fetch-Dest': 'document' })).status).toBe(403);
    expect((await embed(parent, { Host: 'attacker.example:8324' })).status).toBe(403);
    const response = await embed(parent);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain(`frame-ancestors ${parent};`);
    expect(response.headers.has('X-Frame-Options')).toBe(false);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const html = await response.text();
    const token = html.match(/const credential="([^"]+)"/)[1];
    const request = headers => handle(new Request(origin + '/manage/control', {
      method: 'POST', headers: { ...local, Authorization: `Bearer ${token}`, ...headers }, body: '{"action":"pause"}',
    }));
    expect((await request({ Origin: parent, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect(control).not.toHaveBeenCalled();
    expect((await request({})).status).toBe(200);
    expect(control).toHaveBeenCalledOnce();
  });
  it('refuses iframe, fetch, DNS aliases, expired and evicted sessions', async () => {
    let time = 0;
    const handle = createCompanionManagement({ status: () => ({}), control: vi.fn(), now: () => time });
    for (const headers of [{}, { ...navigation, 'Sec-Fetch-Dest': 'iframe' }, { ...navigation, 'Sec-Fetch-Mode': 'cors' }, { ...navigation, Host: 'localhost:8324' }]) {
      expect((await handle(new Request(origin + '/manage', { headers }))).status).toBe(403);
    }
    const first = await session(handle);
    for (let index = 0; index < 8; index++) await session(handle);
    const status = token => handle(new Request(origin + '/manage/status', { headers: { ...local, Authorization: `Bearer ${token}` } }));
    expect((await status(first.token)).status).toBe(403);
    const current = await session(handle);
    expect((await status(current.token)).status).toBe(200);
    time = 15 * 60_000;
    expect((await status(current.token)).status).toBe(403);
  });
});

describe('temporary bootstrap detection', () => {
  it('finds an existing instance without following redirects or sending credentials', async () => {
    const fetchImpl = vi.fn(async url => Response.json(url.includes(':8325/') ? { ok: true, service: 'getbased-agent-host' } : { ok: true, service: 'unrelated' }));
    expect(await findExistingCompanion({ env: {}, fetchImpl })).toEqual({ endpoint: 'http://127.0.0.1:8325' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(fetchImpl.mock.calls[0][1].headers).toBeUndefined();
  });
  it('honors explicit ports and bounds untrusted responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(4097)));
    expect(await findExistingCompanion({ env: { GETBASED_AGENT_HOST_PORT: '8330' }, fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await findExistingCompanion({ env: { GETBASED_AGENT_HOST_PORT: 'invalid' }, fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
