import{nativeEnvironmentView,expectedGenuineLightChildren,genuineLightChildReceipts}from'./helpers/light-genuine-child-native-receipts.js';
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { describeAuditComparison } from './helpers/light-audit-comparison-contract.js';
import { auditActionValue } from '../js/light-audit-presentation.js';
interface Sample {
  name: string; data: unknown; expanded: string | null; all: boolean;
  compare: boolean; callbacks: boolean; provider: boolean; open: boolean;
  html: string; calls: string[];
}
const original = JSON.parse(readFileSync('tests/fixtures/light-audit-original.json', 'utf8')) as { cases: Sample[] };
const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
function describe(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const attrs = (element: Element) => Object.fromEntries([...element.attributes]
    .filter(attr => !['class', 'style', 'type', 'role', 'tabindex'].includes(attr.name))
    .map(attr => [attr.name, attr.value]));
  return {
    open: host.querySelector('details')?.hasAttribute('open') ?? (host.querySelector('[data-light-env-action="toggle-audits-block"]')?.getAttribute('aria-expanded') === 'true'),
    cards: [...host.querySelectorAll('.light-audit-card')].map(card => {
      const disclosure = card.querySelector('[data-light-env-action="toggle-audit"]')!;
      return {
        id: card.getAttribute('data-id'), expanded: card.classList.contains('expanded'),
        disclosure: attrs(disclosure),
        copy: [...card.querySelectorAll('.light-audit-date,.light-audit-label,.light-audit-meta,.light-audit-room-name,.light-audit-room-status,.light-audit-channel-label,.light-audit-channel-value,.light-audit-room-empty,.light-audit-empty')].map(node => clean(node.textContent)),
        fields: [...card.querySelectorAll('input')].map(attrs),
        actions: [...card.querySelectorAll('[data-light-env-action]')].filter(node => node !== disclosure).map(node => ({attrs: attrs(node), text: node.tagName === 'BUTTON' ? clean(node.textContent) : undefined})),
        severity: [...card.querySelectorAll('.light-env-sev-dot')].map(node => ({classes: [...node.classList].filter(name => /^light-env-sev-/.test(name)), title: node.getAttribute('title'), text: clean(node.textContent)})),
      };
    }),
    trusted: genuineLightChildReceipts(host),
    history: clean(host.querySelector('[data-light-env-action="toggle-audit-history"]')?.textContent),
    hint: clean(host.querySelector('.light-audit-hint')?.textContent),
    comparison: describeAuditComparison(host),
  };
}
async function setup(sample: Sample) {
  vi.resetModules();
  const { state } = await import('../js/state.js');
  const api = await import('../js/light-env-audits.js');
  const { computeRoomSeverityForRoom } = await import('../js/light-env-model.js');
  (state as {importedData: unknown}).importedData = structuredClone(sample.data);
  const calls: string[] = [];
  api.configureLightEnvAudits({
    computeRoomSeverity: (...args: Parameters<typeof computeRoomSeverityForRoom>) => {
      calls.push(`severity:${args[0]?.id}`); return computeRoomSeverityForRoom(...args);
    },
    refreshLightEnvironmentUI: () => {}, hasAIProvider: () => sample.provider,
    getAuditDotView: (audit: {id: string}) => { calls.push(`dot:${audit.id}`); return sample.callbacks ? nativeEnvironmentView('audit-dot') : null; },
    getAuditAIView: (audit: {id: string}) => { calls.push(`ai:${audit.id}`); return sample.callbacks ? nativeEnvironmentView('audit') : null; },
  });
  if (sample.all) api.toggleLightAuditHistory();
  if (sample.expanded !== null) api.toggleLightAudit(sample.expanded);
  if (sample.compare) api.toggleLightAuditCompare();
  if (sample.open) api.setLightAuditsBlockOpen(true);
  return {api, state, calls};
}
for (const sample of original.cases) it(`preserves frozen audit behavior: ${sample.name}`, async () => {
  const {api, state, calls} = await setup(sample);
  const before = JSON.stringify(state.importedData);
  const html = api.renderLightAuditsBlock();
  expect(describe(html)).toEqual(describe(expectedGenuineLightChildren(sample.html)));
  expect(calls).toEqual(sample.calls);
  expect(JSON.stringify(state.importedData)).toBe(before);
  const host = document.createElement('div'); host.innerHTML = html;
  expect(host.querySelector('img,script,[onerror]')).toBeNull();
  expect(host.querySelector('.light-audit-card button button,.light-audit-card [role="button"] button')).toBeNull();
  for (const disclosure of host.querySelectorAll('[data-light-env-action="toggle-audit"]')) {
    expect(disclosure.tagName).toBe('BUTTON');
    expect((disclosure as HTMLButtonElement).tabIndex).toBe(0);
    expect(disclosure.querySelector('button,input,a')).toBeNull();
  }
});
it('keeps configured AI failures isolated and expanded detail lazy', async () => {
  const {api} = await setup(original.cases.find(sample => sample.name === 'collapsed')!);
  const detail = vi.fn(() => {throw new Error('AI unavailable');});
  api.configureLightEnvAudits({getAuditDotView: () => {throw new Error('AI unavailable');}, getAuditAIView: detail});
  expect(() => api.renderLightAuditsBlock()).not.toThrow();
  expect(detail).not.toHaveBeenCalled();
  api.toggleLightAudit('a');
  expect(api.renderLightAuditsBlock()).toContain('Audit label');
  expect(detail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id: 'a'}));
});
it('preserves action omission while retaining zero identifiers', () => {
  expect([undefined, null, false, '', 0, 'a'].map(auditActionValue)).toEqual([undefined, undefined, undefined, undefined, '0', 'a']);
});
