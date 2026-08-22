import { describe, expect, it } from 'vitest';

import { getProfileShareApiUrl } from '../js/profile-share.js';

const VPS_ID = `vps1_${'a'.repeat(24)}`;
const LEGACY_ID = 'abcdefghijklmnopqrstuvwx';

describe('profile-share endpoint routing', () => {
  it('routes only exact operated hosts to the isolated VPS service', () => {
    for (const hostname of [
      'getbased.health',
      'www.getbased.health',
      'app.getbased.health',
      'beta.getbased.health',
      'get-based.vercel.app',
    ]) {
      expect(getProfileShareApiUrl({ hostname }, VPS_ID)).toBe('https://shares.getbased.health/api/share');
      expect(getProfileShareApiUrl({ hostname }, LEGACY_ID)).toBe('/api/share');
    }
    expect(getProfileShareApiUrl({ hostname: 'getbased.health.evil.example' }, VPS_ID)).toBe('/api/share');
    expect(getProfileShareApiUrl({ hostname: 'preview.example' }, VPS_ID)).toBe('/api/share');
    expect(getProfileShareApiUrl(null, VPS_ID)).toBe('/api/share');
  });
});
