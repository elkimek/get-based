// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { projectOnboardingAI } from '../js/light-onboarding-ai-presentation.js';
import { renderHTML } from '../js/components/LightOnboardingAI.svelte.html.js';
import type { OnboardingAIDot } from '../js/light-onboarding-ai-presentation.js';
import { expectNativeReview } from './helpers/native-review-dom.js';
const base = { completed: true, provider: true, status: 'idle' as const, analysis: null, prefix: '·' };
function render(input: Parameters<typeof projectOnboardingAI>[0]) {
  const view = projectOnboardingAI(input), host = document.createElement('div');
  host.innerHTML = view ? renderHTML({ view }) : ''; return host;
}
it('keeps incomplete and unconfigured setup hidden while retaining saved offline results', () => {
  expect(projectOnboardingAI({ ...base, completed: false })).toBeNull();
  expect(projectOnboardingAI({ ...base, provider: false })).toBeNull();
  const analysis = { status: 'ok' as const, dot: 'yellow', tip: 'Saved context' };
  expect(render({ ...base, provider: false, status: 'ok', analysis }).textContent).toContain('Saved context');
  expect(projectOnboardingAI({ ...base, provider: false, analysis: { status: 'error', errorMessage: 'Old error' } })).toBeNull();
});
for (const status of ['idle', 'analyzing', 'error'] as const) it(`renders ${status} copy and the original delegated refresh contract`, () => {
  const host = render({ ...base, status });
  expect(host.querySelector('[data-light-onboarding-ai]')?.getAttribute('data-ai-state')).toBe(status);
  expect(host.textContent).toContain(status === 'idle' ? 'Get a contextual read' : status === 'analyzing' ? 'Synthesizing your setup…' : 'Analysis failed.');
  if (status === 'analyzing') expect(host.querySelector('button')).toBeNull();
  else {
    expect(host.querySelector('button')?.getAttribute('data-ai-action')).toBe('refresh-onboarding');
    expect(host.querySelector('button')?.getAttribute('type')).toBe('button');
    expect(host.querySelector('button')?.textContent).toBe(status === 'error' ? 'Try again' : 'Generate context');
  }
});
for (const dot of ['green', 'yellow', 'red', 'gray'] satisfies OnboardingAIDot[]) it(`preserves ${dot} result content, actions and refresh accessibility`, () => {
  const analysis = { status: 'ok' as const, dot, tip: 'Result tip', detail: 'Full context', actions: ['First action', 'Second action'] };
  const before = structuredClone(analysis), host = render({ ...base, status: 'ok', analysis, prefix: '✓' });
  expect(host.querySelector(`.light-setup-ai-block-${dot}`)).not.toBeNull();
  expect(host.querySelector(`.sun-session-ai-dot-${dot}`)?.getAttribute('aria-hidden')).toBe('true');
  expect(host.querySelector('.sun-detail-ai-tip')?.textContent).toBe('✓ Result tip');
  expect(host.querySelector('.sun-detail-ai-body')?.textContent).toBe('Full context');
  expect([...host.querySelectorAll('li')].map(node => node.textContent)).toEqual(analysis.actions);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Re-run');
  expect(host.querySelector('button')?.getAttribute('title')).toBe('Re-run analysis');
  expect(analysis).toEqual(before);
});
it('escapes result, detail, action and error text without an HTML slot', () => {
  const payload = '<img src=x onerror="alert(1)"><script>danger()</script>';
  const host = render({ ...base, status: 'ok', analysis: { status: 'ok', dot: 'green', tip: payload, detail: payload, actions: [payload, null, 12] } });
  expect(host.querySelector('img, script, [onerror]')).toBeNull();
  expect(host.querySelector('.sun-detail-ai-tip')?.textContent).toBe('· ' + payload);
  expect([...host.querySelectorAll('li')].map(node => node.textContent)).toEqual([payload, '', '12']);
  const error = render({ ...base, status: 'error', analysis: { errorMessage: payload } });
  expect(error.querySelector('img, script')).toBeNull(); expect(error.textContent).toContain('Analysis failed — ' + payload);
});
it('normalizes imported dot classes and omits absent detail/non-array actions', () => {
  const host = render({ ...base, status: 'ok', analysis: { status: 'ok', dot: 'green" onclick="danger()', actions: 'Not an array' } });
  expect(host.querySelector('.light-setup-ai-block-gray')).not.toBeNull();
  expect(host.querySelector('[onclick], .sun-detail-ai-body, ul')).toBeNull();
});

const load = createRequire(import.meta.url);
const nativeOnboardingCases = [
  base,
  {...base, status: 'analyzing'},
  {...base, status: 'error', analysis: {status: 'error', errorMessage: 'Synthetic service unavailable'}},
  {...base, provider: false, status: 'ok', analysis: {status: 'ok', dot: 'yellow', tip: 'Saved offline context'}},
  {...base, status: 'ok', analysis: {status: 'ok', dot: 'green', tip: 'Saved context', detail: 'Synthetic detail', actions: ['Synthetic action']}},
] satisfies Parameters<typeof projectOnboardingAI>[0][];

it.each(nativeOnboardingCases)('preserves the delegated native onboarding owner in $status', async sample => {
  const view = projectOnboardingAI({...sample, actionOwner: 'synthetic-onboarding-owner'});
  expect(view).not.toBeNull();
  const native = load('../js/components/LightOnboardingAI.svelte.native.js') as typeof import('../js/components/LightOnboardingAI.svelte.native.js');
  await expectNativeReview(renderHTML({view: view!}), root => {
    const owned = native.mount(native.default, {target: root, props: {view: view!}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    const control = root.querySelector('[data-ai-action="refresh-onboarding"]');
    if (sample.status === 'analyzing') expect(control).toBeNull();
    else expect(control?.getAttribute('data-ai-owner')).toBe('synthetic-onboarding-owner');
    expect(root.querySelector('[data-light-onboarding-ai]')?.getAttribute('data-ai-state')).toBe(sample.status);
  });
});
