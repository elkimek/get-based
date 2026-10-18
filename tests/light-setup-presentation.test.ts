import{nativeOnboardingView}from'./helpers/light-genuine-child-native-receipts.js';
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderHTML } from '../js/components/LightSetupPresentation.svelte.html.js';
import { projectLightSetup, projectSetupLocation } from '../js/light-setup-presentation.js';
import { FITZPATRICK_ROMAN, PHOTOSENSITIVE_OPTIONS, HOME_LIGHT_OPTIONS, EYEWEAR_OPTIONS, OTT_QUESTIONS, ottScoreToLabel } from '../js/sun-defaults-model.js';
const input = { defaults: null, savedFitzpatrick: null, legacySkin: null, complete: false, coords: null, profileLocation: null };
it('retains required confirmation, all option catalogs, educational questions and accessible labels', () => {
  const host = document.createElement('div'); host.innerHTML = renderHTML({ surface: 'editor', view: projectLightSetup(input) });
  const range = host.querySelector<HTMLInputElement>('#setup-skin-range')!;
  expect(range.dataset.set).toBe('0'); expect(range.value).toBe('2'); expect(range.getAttribute('aria-labelledby')).toBe('setup-skin-label-id');
  expect(host.querySelector('#setup-skin-label')).toHaveProperty('textContent', 'Tap a face or drag the slider');
  expect([...host.querySelectorAll('[role="radio"]')].map(node => node.getAttribute('data-roman'))).toEqual([...FITZPATRICK_ROMAN]);
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
  for (const [id, options] of [['setup-photosensitive', PHOTOSENSITIVE_OPTIONS], ['setup-homelight', HOME_LIGHT_OPTIONS], ['setup-eyewear', EYEWEAR_OPTIONS]] as const) {
    expect([...host.querySelectorAll(`[data-choice-group="${id}"]`)].map(node => node.getAttribute('data-value'))).toEqual(options.map(option => option.key));
  }
  expect([...host.querySelectorAll('[data-ott]')].map(node => node.getAttribute('data-ott'))).toEqual(OTT_QUESTIONS.map(question => question.key));
  for (const question of OTT_QUESTIONS) expect(host.textContent).toContain(question.why);
  expect(host.querySelector('[role="tabpanel"][data-setup-pane="score"]')?.hasAttribute('hidden')).toBe(true);
  expect(host.querySelector('[data-setup-tab="score"]')?.getAttribute('tabindex')).toBe('-1');
});
it('preserves legacy skin fallback, skipped and unknown answers without mutating stored values', () => {
  const defaults = { homeLight: 'halogen', eyewear: 'custom <label>', skipped: true, photosensitiveMeds: true };
  const before = structuredClone(defaults);
  const view = projectLightSetup({ ...input, defaults, legacySkin: 'IV — olive' });
  expect(view.initialFitzpatrick).toBe('IV'); expect(view.skinIndex).toBe(3); expect(view.filledCount).toBe(3);
  expect(view.chips[1]?.value).toBe('halogen'); expect(view.chips[3]?.value).toBe('Skipped'); expect(view.photoWarning).toBe('Known photosensitivity warning recorded');
  expect(defaults).toEqual(before);
});
for (let score = 0; score <= 10; score++) it(`preserves pattern meter and summary at ${score}/10`, () => {
  const defaults = { ott: Object.fromEntries(OTT_QUESTIONS.map((q, index) => [q.key, index < score])), ottScore: score };
  const view = projectLightSetup({ ...input, defaults });
  const host = document.createElement('div'); host.innerHTML = renderHTML({ surface: 'editor', view });
  expect(host.querySelectorAll('[data-ott]:checked')).toHaveLength(score); expect(host.querySelector('#ott-running-label')?.textContent).toBe(ottScoreToLabel(score).label);
  expect(host.querySelector('#ott-score-fill')?.getAttribute('style')).toBe(`width:${score * 10}%`);
  expect(view.chips[3]?.sub).toBe(`${score}/10 selected`);
});
it('escapes stored and runtime text, retaining only the existing AI owner slot', () => {
  const literal = '<img src=x onerror=alert(1)> & "';
  const view = projectLightSetup({ ...input, complete: true, defaults: { homeLight: literal, eyewear: literal }, profileLocation: { country: literal }, coords: { lat: 50, lon: 14, source: 'country-band' }, ai:nativeOnboardingView() });
  const host = document.createElement('div'); host.innerHTML = renderHTML({ surface: 'card', view });
  expect(host.querySelector('img,script,[onerror]')).toBeNull(); expect([...host.querySelectorAll('[title]')].map(node => node.getAttribute('title'))).toContain(literal); expect(host.querySelector('[data-light-onboarding-ai]')?.textContent).toContain('Existing analysis');
  host.innerHTML = renderHTML({ surface: 'location', view }); expect(host.querySelector('img,script,[onerror]')).toBeNull(); expect(host.textContent).toContain(literal);
});
for (const source of ['current-device','profile-precise','home-postal','country-band','unknown']) it(`preserves ${source} location privacy and action rules`, () => {
  const status = projectSetupLocation({ lat: -9.876, lon: 15, source }, { country: 'Czechia' });
  const host = document.createElement('div'); host.innerHTML = renderHTML({ surface: 'location', view: { ...projectLightSetup(input), location: status } });
  expect(host.querySelectorAll('[data-light-setup-action="clear-current-location"]')).toHaveLength(source === 'current-device' ? 1 : 0);
  expect(status.tone).toBe(['current-device','profile-precise'].includes(source) ? 'precise' : source === 'unknown' ? 'missing' : 'estimate');
  if (source === 'current-device') { expect(status.value).toContain('9.88°S'); expect(status.detail).toContain('not saved to your profile'); }
});
