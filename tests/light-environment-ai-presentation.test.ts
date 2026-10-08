// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AIVerdictStatus } from '../js/ai-verdict-engine.js';
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
import { renderMeasurementAIInline, type AILightMeasurement } from '../js/light-tools-ai-analysis.js';
import { renderRoomAIBlock, type AIRoom } from '../js/light-env-ai-analysis.js';
import { renderScreenAIBlock, type AIScreen } from '../js/light-screen-ai-analysis.js';
import { renderAuditAIBlock, renderAuditAIDot, type AILightAudit } from '../js/light-audit-ai-analysis.js';
import { aiActionOwner } from '../js/ai-action-delegates.js';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import type { EnvironmentAIKind } from '../js/light-environment-ai-presentation.js';
interface Case {
  kind: EnvironmentAIKind;
  status: AIVerdictStatus;
  provider: boolean;
  analysis: Record<string, unknown> | null;
  html: string;
}
type Target = AILightMeasurement & AIRoom & AIScreen & AILightAudit;
const renderers = { measurement: renderMeasurementAIInline, room: renderRoomAIBlock,
  screen: renderScreenAIBlock, audit: renderAuditAIBlock, 'audit-dot': renderAuditAIDot };
const cases = (JSON.parse(readFileSync('tests/fixtures/light-environment-ai-original.json', 'utf8')) as { cases: Case[] }).cases;
function semantic(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const tree = (element: Element): unknown => ({
    tag: element.tagName,
    classes: [...element.classList].filter(value => !value.startsWith('gb:')).sort(),
    attrs: Object.fromEntries(['data-ai-action', 'data-ai-target', 'data-ai-stop-propagation', 'title', 'aria-hidden', 'aria-label']
      .filter(key => element.hasAttribute(key)).map(key => [key, element.getAttribute(key)])),
    text: [...element.childNodes].filter(child => child.nodeType === 3)
      .map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(),
    children: [...element.children].map(tree),
  });
  return [...host.children].map(tree);
}
beforeEach(() => {
  vi.useFakeTimers();
  state.currentProfile = 'environment-fixture'; state.importedData = createDefaultProfileData();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
for (const [index, sample] of cases.entries()) it(`retains original environment tree ${index}: ${sample.kind}/${sample.status}/provider=${sample.provider}`, () => {
  fixture.provider = sample.provider; fixture.status = sample.status;
  const target = { id: 'environment-1', tool: 'lux', device: '', aiAnalysis: sample.analysis } as unknown as Target;
  const html = renderers[sample.kind](target);
  expect(semantic(html)).toEqual(semantic(sample.html));
  const host = document.createElement('div'); host.innerHTML = html;
  for (const button of host.querySelectorAll('button')) {
    expect(button.type).toBe('button'); expect(button.dataset.aiOwner).toBe(aiActionOwner());
  }
});
it('retains null, audit-aggregate and providerless dot gates', () => {
  fixture.provider = true; fixture.status = 'idle';
  for (const render of Object.values(renderers)) expect(render(null)).toBe('');
  expect(renderMeasurementAIInline({ id: 'aggregate', tool: 'audit' })).toBe('');
  fixture.provider = false;
  expect(renderAuditAIDot({ aiAnalysis: { status: 'error', dot: 'yellow', tip: 'Stored indicator' } })).toContain('Stored indicator');
});
it('escapes imported result, error and target values and restricts severity classes for every feature', () => {
  const literal = '<img src=x onerror="bad()"><script>bad()</script>';
  fixture.provider = true;
  for (const status of ['ok', 'error'] as const) for (const [kind, render] of Object.entries(renderers)) {
    fixture.status = status;
    const target = { id: literal, tool: 'lux', device: '', aiAnalysis: {
      status, dot: 'green" onclick="bad()', tip: literal, detail: literal, errorMessage: literal,
    } } as unknown as Target;
    const host = document.createElement('div'); host.innerHTML = render(target);
    expect(host.querySelector('img,script,[onclick],[onerror]')).toBeNull();
    expect(host.querySelector('.sun-session-ai-dot-gray')).not.toBeNull();
    for (const button of host.querySelectorAll('button')) expect(button.dataset.aiTarget).toBe(literal);
    if (kind === 'audit-dot') expect(host.querySelector('span')!.getAttribute('title')).toBe(`AI verdict: ${literal}`);
    else if (status === 'ok') expect(host.textContent).toContain(literal);
  }
});
