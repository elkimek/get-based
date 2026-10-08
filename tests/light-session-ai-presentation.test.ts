// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SunSessionRecord } from '../js/sun-sessions-store.js';
import type { DeviceSessionRecord } from '../js/light-devices-store.js';
import type { AIVerdictStatus } from '../js/ai-verdict-engine.js';
const fixture = vi.hoisted(() => ({ provider: true, status: 'idle' as AIVerdictStatus }));
vi.mock('../js/ai-feature-routing.js', async original => ({ ...await original<typeof import('../js/ai-feature-routing.js')>(), hasAssistantFeatureProvider: () => fixture.provider }));
vi.mock('../js/ai-verdict-engine-runtime.js', async original => ({ ...await original<typeof import('../js/ai-verdict-engine-runtime.js')>(), hasAIVerdictRuntime: () => false }));
vi.mock('../js/ai-verdict-engine.js', async original => {
  const actual = await original<typeof import('../js/ai-verdict-engine.js')>();
  return { ...actual, createAIVerdict: <T>(cfg: import('../js/ai-verdict-engine.js').AIVerdictConfig<T>) => ({ ...actual.createAIVerdict(cfg), getStatus: () => fixture.status }) };
});
import { renderSessionAIInline, renderSessionAIDetail } from '../js/sun-ai-analysis.js';
import { renderDeviceSessionAIInline, renderDeviceSessionAIDetail } from '../js/light-device-ai-analysis.js';
import { aiActionOwner } from '../js/ai-action-delegates.js';
interface Case { feature: 'sun' | 'device'; mode: 'inline' | 'detail'; status: AIVerdictStatus; provider: boolean; analysis: Record<string, unknown>; html: string }
export function semanticAIHTML(html: string): unknown {
  const host = document.createElement('div'); host.innerHTML = html;
  const node = (element: Element): unknown => ({ tag: element.tagName,
    classes: [...element.classList].filter(value => !value.startsWith('gb:')).sort(),
    attrs: Object.fromEntries(['data-ai-action','data-ai-target','data-ai-stop-propagation','title','aria-hidden','aria-label'].filter(key => element.hasAttribute(key)).map(key => [key,element.getAttribute(key)])),
    text: [...element.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').replace(/\s+/g,' ').trim(), children: [...element.children].map(node),
  });
  return [...host.children].map(node);
}
const renderers = { sun: { inline: renderSessionAIInline, detail: renderSessionAIDetail }, device: { inline: renderDeviceSessionAIInline, detail: renderDeviceSessionAIDetail } };
const cases = (JSON.parse(readFileSync('tests/fixtures/light-session-ai-original.json', 'utf8')) as { cases: Case[] }).cases;
for (const [index, sample] of cases.entries()) it(`retains original semantic tree ${index}: ${sample.feature}/${sample.mode}/${sample.status}/provider=${sample.provider}`, () => {
  fixture.provider = sample.provider; fixture.status = sample.status;
  const session = { id: 'session-1', endedAt: 1, doses: {}, safety: {}, aiAnalysis: sample.analysis } as unknown as SunSessionRecord & DeviceSessionRecord;
  const html = renderers[sample.feature][sample.mode](session);
  expect(semanticAIHTML(html)).toEqual(semanticAIHTML(sample.html));
  const host = document.createElement('div'); host.innerHTML = html;
  for (const button of host.querySelectorAll('button')) { expect(button.type).toBe('button'); expect(button.dataset.aiOwner).toBe(aiActionOwner()); }
});
it('escapes imported text and owner/target attributes while restricting dot classes', () => {
  fixture.provider = true; fixture.status = 'ok';
  const value = '<img src=x onerror="danger()"><script>bad()</script>';
  const session = { id: value, endedAt: 1, doses: {}, safety: {}, aiAnalysis: { status: 'ok', dot: 'green" onclick="danger()', tip: value, detail: value } } as unknown as SunSessionRecord;
  const host = document.createElement('div'); host.innerHTML = renderSessionAIDetail(session);
  expect(host.querySelector('img,script,[onclick],[onerror]')).toBeNull();
  expect(host.querySelector('.sun-detail-ai-gray')).not.toBeNull(); expect(host.querySelector('.sun-detail-ai-tip')!.textContent).toBe(value);
  expect(host.querySelector('button')!.dataset.aiTarget).toBe(value); expect(host.querySelector('.sun-detail-ai-body')!.textContent).toBe(value);
});
it('retains null, incomplete and uncomputed-session gates in the actual adapters', () => {
  fixture.provider = true; fixture.status = 'ok';
  for (const render of [renderSessionAIInline,renderSessionAIDetail]) {
    expect(render(null)).toBe(''); expect(render({ id: 'empty', startedAt: 1 })).toBe('');
    expect(render({ id: 'pending', startedAt: 1, endedAt: 2, doses: {}, safety: {}, calculationStatus: 'pending' })).toBe('');
  }
  expect(renderDeviceSessionAIDetail(null)).toBe(''); expect(renderDeviceSessionAIInline({ id: 'empty', startedAt: 1 })).toBe('');
});
