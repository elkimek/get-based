// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/LightToolPresentation.svelte.html.js';
import { projectAuditPauseRows, projectGoldenHourLog, projectLightTools, type WalkthroughStatus } from '../js/light-tools-presentation.js';
import { classifyDayWindow } from '../js/light-tools-solar-time.js';
// Original receipts were captured in Europe/Prague; keep their exact local-time inputs on every host.
beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Prague');
  expect(new Date('2026-08-07T12:00:00Z').getHours()).toBe(14);
});
afterEach(() => vi.unstubAllEnvs());
interface LauncherSample { name: string; now: number; data: { lightMeasurements: { capturedAt?: unknown }[]; lightEnvironment: { rooms?: unknown } }; html: string }
interface GoldenSample { name: string; now: number; coords: { lat: number; lon: number } | null; html: string }
const original = JSON.parse(readFileSync('tests/fixtures/light-tools-original.json', 'utf8')) as {
  launchers: LauncherSample[]; golden: GoldenSample[]; walkthrough: string; walkthroughStates: {kind: WalkthroughStatus | 'rows'; html: string}[];
};
const host = (html: string) => { const element = document.createElement('div'); element.innerHTML = html; return element; };
const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map(text);
function actions(root: Element) {
  return [...root.querySelectorAll('button')].map(node => ({id: node.id, action: node.getAttribute('data-light-tools-action'), tool: node.getAttribute('data-light-tool-id'), title: node.getAttribute('title'), aria: node.getAttribute('aria-label'), text: text(node)}));
}
function launcher(root: Element) {
  return {title: texts(root, 'h3'), hint: texts(root, '.light-section-hint'), status: texts(root, '.light-tools-status span'), statusLabel: root.querySelector('.light-tools-status')?.getAttribute('aria-label'),
    recommended: texts(root, '.light-tools-recommended-head span'), actions: actions(root), icons: [...root.querySelectorAll('.light-tool-action-icon')].map(node => ({text: text(node), hidden: node.getAttribute('aria-hidden')})),
    groups: [...root.querySelectorAll('details')].map(node => ({open: node.open, title: text(node.querySelector('summary span')), time: text(node.querySelector('.light-tools-group-time')), tools: [...node.querySelectorAll('[data-light-tool-id]')].map(button => button.getAttribute('data-light-tool-id'))}))};
}
function golden(root: Element) {
  const input = root.querySelector<HTMLInputElement>('#sunrise-duration')!;
  return {role: root.querySelector('[role]')?.getAttribute('role'), label: root.querySelector('[role]')?.getAttribute('aria-label'), header: texts(root, 'h3'), hint: texts(root, '.modal-body-hint'), emphasis: texts(root, '.modal-body-hint strong'),
    subtitle: text(root.querySelector('.modal-body > p:not(.modal-body-hint)')), labelText: text(root.querySelector('label')), input: {type: input.type, min: input.min, max: input.max, value: input.value}, actions: actions(root)};
}
afterEach(() => { vi.useRealTimers(); document.querySelectorAll('.modal-overlay').forEach(node => node.remove()); });
for (const sample of original.launchers) it(`retains launcher content, grouping and actions: ${sample.name}`, () => {
  const before = structuredClone(sample.data);
  const current = host(renderHTML({kind: 'launcher', view: projectLightTools(sample.data.lightMeasurements, sample.data.lightEnvironment, sample.now)}));
  expect(launcher(current)).toEqual(launcher(host(sample.html)));
  expect(sample.data).toEqual(before);
  expect([...current.querySelectorAll('button')].every(button => button.type === 'button')).toBe(true);
});
for (const sample of original.golden) it(`retains solar logger fields and window copy: ${sample.name}`, () => {
  const window = classifyDayWindow(sample.coords, new Date(sample.now), date => date.getHours() >= 6 && date.getHours() < 18 ? 70 : 110);
  const current = host(renderHTML({kind: 'golden', view: projectGoldenHourLog(window)}));
  expect(golden(current)).toEqual(golden(host(sample.html)));
  expect([...current.querySelectorAll('button')].every(button => button.type === 'button')).toBe(true);
});
it('retains the actual walkthrough shell, shared guide and native close actions', async () => {
  const tools = await import('../js/light-tools.js');
  await tools.openEyeLevelAudit();
  try {
    const current = document.querySelector('[aria-label="Home audit"]')!, reference = host(original.walkthrough);
    expect(text(current.querySelector('h3'))).toBe(text(reference.querySelector('h3')));
    expect(texts(current, '.modal-body-hint')).toEqual(texts(reference, '.modal-body-hint'));
    expect(text(current.querySelector('.tool-aiming-guide'))).toBe(text(reference.querySelector('.tool-aiming-guide')));
    expect(texts(current, '.tool-aiming-guide-body b')).toEqual(texts(reference, '.tool-aiming-guide-body b'));
    expect(current.querySelector('[data-aiming-guide-action]')?.getAttribute('data-tool')).toBe('audit');
    expect(actions(current)).toEqual(actions(reference));
    expect(current.querySelector('#audit-status')?.getAttribute('aria-live')).toBe('polite');
    expect(current.querySelector('#audit-status')?.getAttribute('aria-atomic')).toBe('true');
    expect(text(current.querySelector('#audit-status'))).toBe('Press Start when ready.');
  } finally { tools.closeEyeLevelAudit(); }
});
for (const sample of original.walkthroughStates.filter(sample => sample.kind !== 'rows')) it(`retains camera status copy: ${sample.kind}`, () => {
  const current = host(renderHTML({kind: 'audit-status', state: sample.kind as WalkthroughStatus})), reference = host(sample.html);
  expect(text(current)).toBe(text(reference));
  expect(texts(current, 'span')).toEqual(texts(reference, 'span'));
  expect(current.querySelectorAll('br').length).toBe(reference.querySelectorAll('br').length);
});
function rows(root: Element) {
  return [...root.querySelectorAll('li')].map(node => {
    const input = node.querySelector('input')!;
    return {reading: text(node.querySelector('span')), type: input.type, aria: input.getAttribute('aria-label'), index: input.dataset.idx, value: input.value, placeholder: input.placeholder, list: input.getAttribute('list'), options: [...node.querySelectorAll('option')].map(option => option.value)};
  });
}
it('retains pause rows, labels, datalists and literal escaping', () => {
  const pauses = [{lux: null, levelLabel: 'Medium', label: 'Bedroom "quoted" < &'}, {lux: null, levelLabel: 'Brighter', label: ''}];
  const before = structuredClone(pauses), current = host(renderHTML({kind: 'audit-rows', rows: projectAuditPauseRows(pauses)}));
  expect(rows(current)).toEqual(rows(host(original.walkthroughStates.find(sample => sample.kind === 'rows')!.html)));
  expect(pauses).toEqual(before);
  const literal = host(renderHTML({kind: 'audit-rows', rows: projectAuditPauseRows([{lux: null, levelLabel: '<img src=x onerror=alert(1)>', label: '"><script>bad</script>'}])}));
  expect(literal.querySelector('script,img,[onerror]')).toBeNull();
  expect(literal.querySelector('input')?.value).toBe('"><script>bad</script>');
  expect(projectAuditPauseRows([{lux: 12.6, levelLabel: 'ignored', label: ''}])[0]?.reading).toBe('~13 lux');
});
it('keeps facade and shared guide fully authored without raw slots', () => {
  const facade = readFileSync('js/light-tools.ts', 'utf8');
  expect(facade).not.toMatch(/innerHTML\s*=\s*`|return\s*`</);
  expect(facade).toContain("from './components/LightToolPresentation.svelte.html.js'");
  expect(readFileSync('js/components/LightAuditWalkthrough.svelte', 'utf8')).not.toContain('{@html');
  expect(readFileSync('js/components/LightAimingGuide.svelte', 'utf8')).not.toContain('{@html');
  expect(readFileSync('css/light-tools.base.css', 'utf8')).not.toMatch(/\.light-tools-section|\.light-tool-action\s*\{|\.audit-status\s*\{/);
});
