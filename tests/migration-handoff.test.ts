import {describe, expect, it} from 'vitest';
import {
  buildHandoffTargetUrl,
  generateEphemeralTransferPassword,
  generateHandoffNonce,
  isAllowedHandoffSourceOrigin,
  normalizeDestinationOrigin,
  parseHandoffFragment,
} from '../js/migration-handoff.js';

describe('automated migration handoff validation', () => {
  it('normalizes user-entered self-hosted URLs and rejects unsafe or official destinations', () => {
    expect(normalizeDestinationOrigin('my-getbased.vercel.app', 'https://app.getbased.health')).toBe('https://my-getbased.vercel.app');
    expect(normalizeDestinationOrigin('https://my-getbased.pages.dev/app?foo=1', 'https://app.getbased.health')).toBe('https://my-getbased.pages.dev');
    expect(normalizeDestinationOrigin('http://localhost:8000/app', 'http://127.0.0.1:8000')).toBe('http://localhost:8000');

    expect(() => normalizeDestinationOrigin('https://app.getbased.health', 'https://app.getbased.health')).toThrow(/not this current URL/);
    expect(() => normalizeDestinationOrigin('https://getbased-demo.vercel.app', 'https://app.getbased.health')).toThrow(/official hosted or demo/);
    expect(() => normalizeDestinationOrigin('https://app.getbased.health', 'https://my-fork.vercel.app')).toThrow(/official hosted or demo/);
    expect(() => normalizeDestinationOrigin('http://example.com', 'https://app.getbased.health')).toThrow(/https:\/\//);
  });

  it('restricts incoming handoff source origins to official hosted origins and loopback', () => {
    expect(isAllowedHandoffSourceOrigin('https://app.getbased.health')).toBe(true);
    expect(isAllowedHandoffSourceOrigin('https://get-based.vercel.app')).toBe(true);
    expect(isAllowedHandoffSourceOrigin('http://127.0.0.1:8000')).toBe(true);
    expect(isAllowedHandoffSourceOrigin('http://localhost:8000')).toBe(true);
    expect(isAllowedHandoffSourceOrigin('https://evil.example')).toBe(false);
    expect(isAllowedHandoffSourceOrigin('https://app.getbased.health.evil.example')).toBe(false);
  });

  it('generates strong ephemeral passwords and strict hex nonces', () => {
    const pw = generateEphemeralTransferPassword();
    expect(pw.length).toBeGreaterThanOrEqual(32);
    const nonce = generateHandoffNonce();
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    const url = buildHandoffTargetUrl('https://my-getbased.vercel.app', nonce, 'https://app.getbased.health');
    const parsed = parseHandoffFragment(new URL(url).hash);
    expect(parsed).toEqual({nonce, sourceOrigin: 'https://app.getbased.health'});
    expect(parseHandoffFragment('#handoff=short&source=https://app.getbased.health')).toBeNull();
    expect(parseHandoffFragment(`#handoff=${nonce}&source=https://evil.example`)).toBeNull();
  });
});
