import {afterEach, describe, expect, it, vi} from 'vitest';
import {isPublicDemoOrigin} from '../shared/hosted-transition.js';
import {isPublicDemoMode, isPublicDemoSeeding, withPublicDemoSeeding} from '../js/public-demo-mode.js';

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
});
