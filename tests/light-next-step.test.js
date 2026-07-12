import { describe, expect, it } from 'vitest';
import { buildBestNextStep, renderBestNextStep } from '../js/light-next-step.js';

const at = hour => new Date(2026, 5, 11, hour, 15, 0);
const ready = {
  hasCoords: true,
  hasSkinType: true,
  sessions: [],
  deviceSessions: [],
  medToday: 0,
  medYesterday: 0,
  photosensitiveMedTier: 'none',
  hasRooms: false,
};

describe('Light best next step', () => {
  it('prioritizes active sessions over every other suggestion', () => {
    const step = buildBestNextStep({ ...ready, now: at(12), activeSun: { id: 'active' }, medToday: 1.2 });
    expect(step.tone).toBe('active');
    expect(step.action).toEqual({ type: 'quick-log-sun', label: 'Stop sun session' });
  });

  it('asks for location before skin sensitivity', () => {
    const missingLocation = buildBestNextStep({ ...ready, now: at(10), hasCoords: false, hasSkinType: false });
    const missingSkin = buildBestNextStep({ ...ready, now: at(10), hasSkinType: false });
    expect(missingLocation.action.type).toBe('request-precise-location');
    expect(missingSkin.action.type).toBe('open-light-setup');
  });

  it('respects deferred setup without treating a default skin type as confirmed', () => {
    const step = buildBestNextStep({ ...ready, now: at(10), hasSkinType: false, setupDeferred: true });
    expect(step.title).toContain('when you’re ready');
    expect(step.action.type).toBe('open-light-setup');
  });

  it('blocks exposure-seeking guidance at a high modeled burn dose', () => {
    const step = buildBestNextStep({ ...ready, now: at(12), medToday: 0.82, atmosphere: { uvIndex: 4 } });
    expect(step.title).toContain('shade');
    expect(step.action.type).toBe('scroll-conditions');
    expect(step.body).toContain('More is not needed');
  });

  it('keeps a recorded high burn dose ahead of missing setup prompts', () => {
    const step = buildBestNextStep({ ...ready, now: at(12), hasCoords: false, hasSkinType: false, medToday: 1.1 });
    expect(step.tone).toBe('danger');
    expect(step.title).toContain('Avoid more UV');
  });

  it('uses a protected-outdoor message at very high UVI', () => {
    const step = buildBestNextStep({ ...ready, now: at(12), atmosphere: { uvIndex: 9.2 } });
    expect(step.tone).toBe('caution');
    expect(step.title).toContain('shade');
    expect(step.body).toContain('without deliberately exposing skin');
  });

  it('offers one ordinary outdoor log during a lower-UV day', () => {
    const step = buildBestNextStep({ ...ready, now: at(9), atmosphere: { uvIndex: 2.1 } });
    expect(step.tone).toBe('daylight');
    expect(step.action.type).toBe('quick-log-sun');
    expect(step.body).toContain('never look at the sun');
  });

  it('does not suggest another outdoor log after one is already recorded', () => {
    const step = buildBestNextStep({
      ...ready,
      now: at(11),
      atmosphere: { uvIndex: 2.1 },
      sessions: [{ startedAt: at(9).getTime(), endedAt: at(9).getTime() + 20 * 60 * 1000 }],
    });
    expect(step.title).toContain('optional');
    expect(step.action.type).toBe('scroll-conditions');
  });

  it('switches to a dim-evening action at night', () => {
    const step = buildBestNextStep({ ...ready, now: at(22), atmosphere: { uvIndex: 0 } });
    expect(step.tone).toBe('evening');
    expect(step.action.type).toBe('open-light-environment');
    expect(step.title).toContain('dimmer');
  });

  it('uses local sunrise and sunset instead of a fixed daytime clock', () => {
    const beforeSunrise = buildBestNextStep({
      ...ready,
      now: at(7),
      atmosphere: { uvIndex: 0, daily: { sunrise: '2026-06-11T08:00', sunset: '2026-06-11T16:00' }, hourly: { utcOffsetSeconds: 7200 } },
    });
    const afterSunset = buildBestNextStep({
      ...ready,
      now: at(17),
      atmosphere: { uvIndex: 0, daily: { sunrise: '2026-06-11T08:00', sunset: '2026-06-11T16:00' }, hourly: { utcOffsetSeconds: 7200 } },
    });
    expect(beforeSunrise.title).toContain('Wait');
    expect(beforeSunrise.action.type).toBe('scroll-conditions');
    expect(afterSunset.tone).toBe('evening');
  });

  it('does not recommend more exposure when a medication-sensitivity flag is active', () => {
    const step = buildBestNextStep({
      ...ready,
      now: at(12),
      photosensitiveMedTier: 'moderate',
      atmosphere: { uvIndex: 2 },
    });
    expect(step.title).toContain('sun-sensitivity');
    expect(step.action.type).toBe('scroll-conditions');
  });

  it('escapes all rendered copy and exposes one delegated action', () => {
    const html = renderBestNextStep({
      tone: 'setup',
      eyebrow: '<b>setup</b>',
      title: '<img src=x>',
      body: '<script>bad()</script>',
      reason: 'safe',
      action: { type: 'open-light-setup', label: 'Start' },
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('data-light-page-action="open-light-setup"');
  });
});
