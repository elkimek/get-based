import { expect, it } from 'vitest';
import { activeElapsedMs, formatElapsed, plainStopSummary, _renderUVIPreflightBanner, _buildStartSessionToast } from '../js/sun-active-session-format.js';
it.each([[0, '0:00'], [-1, '0:00'], [61000, '1:01'], [3661000, '1:01:01']])('formats elapsed %s', (input, expected) => expect(formatElapsed(input)).toBe(expected));
it('elapsed duration excludes completed and current pauses', () => {
  expect(activeElapsedMs({ startedAt: 100, accumulatedPausedMs: 200, paused: true, pausedAt: 800 }, 1000)).toBe(500);
  expect(activeElapsedMs({ startedAt: 1000 }, 500)).toBe(0);
});
it.each([null, NaN, 0, 4])('does not invent a preflight warning for unavailable/low UVI %s', uvi => {
  expect(_renderUVIPreflightBanner(uvi, 'III', 'none', false, () => 1)).toBe('');
});
it.each([[5, 'I', 'elevated'], [8, 'III', 'Very high'], [11, 'III', 'Extreme']])('keeps UVI %s guidance explicitly modeled', (uvi, skin, label) => {
  const html = _renderUVIPreflightBanner(uvi, skin, 'none', false, () => 1);
  expect(html).toContain(label); expect(html).toContain('not a safe exposure time');
});
it('preflight shows skin assumptions and medication uncertainty', () => {
  const html = _renderUVIPreflightBanner(6, 'I', 'severe', true, () => null);
  expect(html).toContain('Type I assumption'); expect(html).toContain('drug-specific burn threshold cannot be inferred');
});
it('preflight escapes injected skin labels', () => {
  expect(_renderUVIPreflightBanner(12, '<img src=x>', 'none', false, () => 1)).not.toContain('<img');
});
it.each([[1, 3, 'none', 'closed-eyes', '1 region exposed'], [2, 8, 'unknown', 'direct', 'sunlight warnings not reviewed'], [2, 11, 'severe', 'direct', 'extreme UV']])('start toast consolidates %s regions and UVI %s', (regionCount, uvi, psmTier, eyeMode, expected) => {
  expect(_buildStartSessionToast({ regionCount, uvi, psmTier, eyeMode }, x => x)).toContain(expected);
});
it('stop summary does not turn missing data into a dose claim', () => {
  expect(plainStopSummary(null, 2)).toBe('Session saved — 2 min');
  expect(plainStopSummary({}, 2)).not.toContain('IU-equivalent');
});
it.each([[0.3, 'model only'], [0.7, 'close to'], [1, 'stop UV exposure']])('stop summary preserves modeled burn warning at %s', (medFraction, text) => {
  expect(plainStopSummary({ safety: { medFraction } }, 10)).toContain(text);
});
it('dose summary uses the body-aware conversion and labels the wide estimated range', () => {
  const text = plainStopSummary({ doses: { vitamin_d: 5 }, bodyExposure: { fraction: 0.2 } }, 10, { vitaminDIU: () => 0, vitaminDIUPerSession: () => 1000 });
  expect(text).toContain('~250–2000 IU-equivalent');
});
it('low UV and behind-glass summaries avoid numeric vitamin D claims', () => {
  expect(plainStopSummary({ bodyExposure: { glassBetween: true } }, 10)).toContain('generic glass model');
  expect(plainStopSummary({ atmosphere: { uvIndex: 0 } }, 10)).toContain('UVI 0.0');
});
