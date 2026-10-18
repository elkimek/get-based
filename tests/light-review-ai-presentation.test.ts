// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AIVerdictStatus } from '../js/ai-verdict-engine.js';
import type { ReviewAIKind } from '../js/light-review-ai-presentation.js';
const fixture = vi.hoisted(() => ({ provider: true, status: 'idle' as AIVerdictStatus }));
vi.mock('../js/ai-feature-routing.js', async original => ({
  ...await original<typeof import('../js/ai-feature-routing.js')>(), hasAssistantFeatureProvider: () => fixture.provider,
}));
vi.mock('../js/ai-verdict-engine-runtime.js', async original => ({
  ...await original<typeof import('../js/ai-verdict-engine-runtime.js')>(), hasAIVerdictRuntime: () => false,
}));
vi.mock('../js/ai-verdict-engine.js', async original => {
  const actual = await original<typeof import('../js/ai-verdict-engine.js')>();
  return { ...actual, createAIVerdict: <T>(config: import('../js/ai-verdict-engine.js').AIVerdictConfig<T>) => ({
    ...actual.createAIVerdict(config), getStatus: () => fixture.status,
  }) };
});
import { createDashboardWidgetRenderers } from '../js/dashboard-widget-renderers.js';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { renderLightTodayHero, renderLightTodayDashboardChip, getDayFingerprint } from '../js/light-today-ai.js';
import { renderChannelMixVerdict, getChannelMixFingerprint } from '../js/light-channels-ai-analysis.js';
import { renderBurdenInterp, getBurdenFingerprint } from '../js/light-burden-ai-analysis.js';
import { renderSuggestion } from '../js/light-channel-view.js';
import { projectReviewAI } from '../js/light-review-ai-presentation.js';
import { renderHTML } from '../js/components/LightReviewAI.svelte.html.js';
import { aiActionOwner } from '../js/ai-action-delegates.js';
import type { SunSessionRecord } from '../js/sun-sessions-store.js';
interface Case {
  kind: ReviewAIKind; status: AIVerdictStatus; provider: boolean;
  analysis: Record<string, unknown> | null; stale: boolean; hasData: boolean;
  trends: string[]; fallbackHTML: string; heuristic: string; html: string;
}
const original = JSON.parse(readFileSync('tests/fixtures/light-review-ai-original.json', 'utf8')) as {
  dashboardFallbackHTML: string; cases: Case[]; summaryCases: { sunSessions: { endedAt: number }[]; deviceSessions: { endedAt: number }[]; html: string }[];
};
function semantic(html: string) {
  const host = document.createElement('div'); host.innerHTML = html;
  const tree = (element: Element): unknown => ({
    tag: element.tagName, classes: [...element.classList].filter(value => !value.startsWith('gb:')).sort(),
    attrs: Object.fromEntries(['data-dashboard-widget-action', 'data-dashboard-widget-route', 'data-ai-action', 'data-ai-target', 'data-ai-stop-propagation', 'data-light-page-action', 'role', 'title', 'aria-hidden', 'aria-label']
      .filter(key => element.hasAttribute(key)).map(key => [key, element.getAttribute(key)])),
    text: [...element.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(),
    children: [...element.children].map(tree),
  });
  return [...host.children].map(tree);
}
// The original packet omits a capture clock. Select a fixed instant inside its source-defined 7/14-day eligibility intervals; all original five summaries remain unchanged.
const originalSummaryClock=Math.max(...original.summaryCases.flatMap(c=>[...c.sunSessions,...c.deviceSessions].map(s=>s.endedAt)))+86400000;
beforeEach(() => { vi.useFakeTimers();vi.setSystemTime(originalSummaryClock); state.currentProfile = 'review-fixture'; state.importedData = createDefaultProfileData(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function install(sample: Case) {
  fixture.provider = sample.provider; fixture.status = sample.status;
  const data = state.importedData;
  if (sample.hasData) {
    data.sunSessions = [{ id: 'recent', startedAt: Date.now() - 120000, endedAt: Date.now() - 60000, durationMin: 1, doses: {} } as SunSessionRecord];
    data.lightEnvironment = { rooms: [{ id: 'room', name: 'Bedroom', primarySource: 'led-warm' }], screens: [] };
  }
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fingerprint = sample.stale ? 'original-stale' : sample.kind === 'weekly' ? getChannelMixFingerprint()
    : sample.kind === 'burden' ? getBurdenFingerprint() : getDayFingerprint({ date: today });
  const analysis = sample.analysis ? { ...sample.analysis, fingerprint } : null;
  data.lightDailyVerdicts = analysis ? { [key]: analysis } : {};
  data.channelMixAI = analysis;
  data.lightEnvironment ||= { rooms: [], screens: [] };
  data.lightEnvironment.burdenAI = analysis;
}
for (const [index, sample] of original.cases.entries()) it(`retains original review ${index}: ${sample.kind}/${sample.status}/provider=${sample.provider}/stale=${sample.stale}/history=${sample.hasData}`, () => {
  install(sample);
  let html: string;
  if (sample.kind === 'today' && sample.trends.length && sample.html) {
    // The original renderer's independently injected trend strings test escaping,
    // truncation and green suppression without replacing the real trend service.
    html = renderHTML({ view: projectReviewAI({ ...sample, variant: sample.status,
      actionOwner: aiActionOwner(),
    }) });
  } else html = sample.kind === 'today' ? renderLightTodayHero() : sample.kind === 'dashboard' ? renderLightTodayDashboardChip()
    : sample.kind === 'weekly' ? String(renderChannelMixVerdict(sample.fallbackHTML)) : renderBurdenInterp({ interp: sample.heuristic });
  expect(semantic(html)).toEqual(semantic(sample.html));
  const host = document.createElement('div'); host.innerHTML = html;
  for (const button of host.querySelectorAll('[data-ai-action]')) {
    expect((button as HTMLButtonElement).type).toBe('button'); expect(button.getAttribute('data-ai-owner')).toBe(aiActionOwner());
    expect(button.hasAttribute('data-ai-target')).toBe(false);
  }
});
for (const [index, sample] of original.summaryCases.entries()) it(`retains original deterministic weekly summary ${index}`, () => {
  expect(semantic(renderSuggestion({}, {}, sample.sunSessions, sample.deviceSessions))).toEqual(semantic(sample.html));
});
it('escapes stored results and errors and restricts severity classes on every authored review surface', () => {
  const literal = '<img src=x onerror="bad()"><script>bad()</script>';
  for (const kind of ['today', 'dashboard', 'weekly', 'burden'] as const) for (const variant of ['ok', 'error'] as const) {
    const html = renderHTML({ view: projectReviewAI({ kind, variant, status: variant, actionOwner: aiActionOwner(),
      analysis: { dot: 'green" onclick="bad()', tip: literal, detail: literal, errorMessage: literal }, heuristic: literal,
    }) });
    const host = document.createElement('div'); host.innerHTML = html;
    expect(host.querySelector('img,script,[onclick],[onerror]')).toBeNull();
    if (variant === 'ok' || kind !== 'burden') expect(host.textContent).toContain(literal);
  }
});
it('preserves the providerless weekly fallback value and does not stringify an existing caller contract', () => {
  fixture.provider = false; const fallback = { source: 'existing caller' };
  expect(renderChannelMixVerdict(fallback)).toBe(fallback);
});

it('retains the original providerless dashboard Light fallback and delegated navigation', () => {
  const facade = createDashboardWidgetRenderers({isLightSunUILoaded: () => true, renderLightTodayHero: () => ''});
  const html = String(facade.renderDashboardLightTodayWidget());
  expect(html).toBe(renderHTML({view: {kind: 'dashboard-fallback'}}));
  expect(semantic(html)).toEqual(semantic(original.dashboardFallbackHTML));
  const host=document.createElement('div');host.innerHTML=html;
  const button=host.querySelector('button')!;
  expect(button.dataset.dashboardWidgetAction).toBe('navigate');expect(button.dataset.dashboardWidgetRoute).toBe('light');
});
