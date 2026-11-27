import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {isPublicDemoOrigin} from '../shared/hosted-transition.js';
import {isPublicDemoMode, isPublicDemoSeeding, withPublicDemoSeeding} from '../js/public-demo-mode.js';
import {resetLegacyPublicDemoStateIfNeeded} from '../js/public-demo-bootstrap.js';
import {PUBLIC_DEMO_APP_CSP, buildPublicDemoAppDeploy} from '../scripts/build-public-demo-deploy.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public demo mode detection', () => {
  it('recognizes official public demo origins and excludes hosted and self-hosted origins', () => {
    expect(isPublicDemoOrigin('https://getbased-demo.vercel.app')).toBe(true);
    expect(isPublicDemoOrigin('https://demo.getbased.health')).toBe(true);
    expect(isPublicDemoOrigin('https://GETBASED-DEMO.VERCEL.APP:443')).toBe(true);
    expect(isPublicDemoOrigin('https://app.getbased.health')).toBe(false);
    expect(isPublicDemoOrigin('https://my-fork.vercel.app')).toBe(false);
    expect(isPublicDemoOrigin('http://127.0.0.1:8000')).toBe(false);
  });

  it('activates on public demo hosts and only via query flag on loopback', () => {
    expect(isPublicDemoMode({origin: 'https://getbased-demo.vercel.app', hostname: 'getbased-demo.vercel.app', search: ''})).toBe(true);
    expect(isPublicDemoMode({origin: 'http://127.0.0.1:8000', hostname: '127.0.0.1', search: '?public-demo=1'})).toBe(true);
    expect(isPublicDemoMode({origin: 'http://127.0.0.1:8000', hostname: '127.0.0.1', search: ''})).toBe(false);
    expect(isPublicDemoMode({origin: 'https://app.getbased.health', hostname: 'app.getbased.health', search: '?public-demo=1'})).toBe(false);
    expect(isPublicDemoMode({origin: 'https://my-fork.vercel.app', hostname: 'my-fork.vercel.app', search: '?public-demo=1'})).toBe(false);
  });

  it('tracks seeding depth cleanly even on error', async () => {
    expect(isPublicDemoSeeding()).toBe(false);
    const value = await withPublicDemoSeeding(async () => {
      expect(isPublicDemoSeeding()).toBe(true);
      return 'seeded';
    });
    expect(value).toBe('seeded');
    expect(isPublicDemoSeeding()).toBe(false);
    await expect(withPublicDemoSeeding(async () => {
      expect(isPublicDemoSeeding()).toBe(true);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(isPublicDemoSeeding()).toBe(false);
  });

  it('restricts legacy demo storage cleanup to dedicated public demo origins and never wipes loopback data', () => {
    const makeStorage = (initial: Record<string, string>) => {
      const data = new Map(Object.entries(initial));
      return {
        get length() { return data.size; },
        key: (index: number) => [...data.keys()][index] ?? null,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value); },
        removeItem: (key: string) => { data.delete(key); },
      };
    };

    const loopbackStorage = makeStorage({'labcharts-profiles': '[{"id":"personal"}]'});
    vi.stubGlobal('location', {origin: 'http://127.0.0.1:8000', hostname: '127.0.0.1', search: '?public-demo=1'});
    vi.stubGlobal('localStorage', loopbackStorage);
    resetLegacyPublicDemoStateIfNeeded();
    expect(loopbackStorage.getItem('labcharts-profiles')).toBe('[{"id":"personal"}]');

    const demoStorage = makeStorage({'labcharts-profiles': '[{"id":"stale"}]', 'unrelated': 'keep'});
    vi.stubGlobal('location', {origin: 'https://getbased-demo.vercel.app', hostname: 'getbased-demo.vercel.app', search: ''});
    vi.stubGlobal('localStorage', demoStorage);
    resetLegacyPublicDemoStateIfNeeded();
    expect(demoStorage.getItem('labcharts-profiles')).toBeNull();
    expect(demoStorage.getItem('unrelated')).toBe('keep');
    expect(demoStorage.getItem('getbased-public-demo-v')).toBe('2');
  });

  it('builds the public demo deploy bundle with strict self-only connect CSP and preserves .vercel metadata', async () => {
    expect(PUBLIC_DEMO_APP_CSP).toContain("connect-src 'self'");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-public-demo-'));
    try {
      const sourceDir = path.join(tempRoot, 'dist');
      const outputDir = path.join(tempRoot, 'out');
      await fs.mkdir(sourceDir, {recursive: true});
      await fs.writeFile(path.join(sourceDir, 'index.html'), '<!doctype html><title>demo</title>');
      await fs.mkdir(path.join(outputDir, '.vercel'), {recursive: true});
      await fs.writeFile(path.join(outputDir, '.vercel', 'project.json'), '{"projectId":"keep"}');
      await fs.writeFile(path.join(outputDir, 'stale.txt'), 'remove-me');

      const result = await buildPublicDemoAppDeploy(sourceDir, outputDir);
      expect(result.csp).toBe(PUBLIC_DEMO_APP_CSP);
      expect(await fs.readFile(path.join(outputDir, 'index.html'), 'utf8')).toContain('<title>demo</title>');
      expect(await fs.readFile(path.join(outputDir, '.vercel', 'project.json'), 'utf8')).toBe('{"projectId":"keep"}');
      await expect(fs.stat(path.join(outputDir, 'stale.txt'))).rejects.toThrow();

      const vercelConfig = JSON.parse(await fs.readFile(path.join(outputDir, 'vercel.json'), 'utf8')) as {
        routes: Array<{src: string; headers?: Record<string, string>}>;
      };
      const catchAll = vercelConfig.routes.find(route => route.src === '/(.*)');
      expect(catchAll?.headers?.['Content-Security-Policy']).toBe(PUBLIC_DEMO_APP_CSP);
      const migration = vercelConfig.routes.find(route => route.src === '^/app/migration\\.html$');
      expect(migration?.headers?.['Cross-Origin-Opener-Policy']).toBe('unsafe-none');
    } finally {
      await fs.rm(tempRoot, {recursive: true, force: true});
    }
  });
});
