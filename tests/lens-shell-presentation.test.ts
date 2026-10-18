// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, expect, it} from 'vitest';
import {evaluateLegacyLensShell} from './helpers/lens-shell-legacy.js';
const {configureLensPageShell,renderLensHeader,renderLensWidget,renderLensPageWidgets}=await evaluateLegacyLensShell();
import {state} from '../js/state.js';
import {profileStorageKey} from '../js/profile.js';
type Sample = {name: string; available: string[]; hidden: string[]; order: string[]; html: string} & (
  | {method: 'header'; args: Parameters<typeof renderLensHeader>}
  | {method: 'widget'; args: Parameters<typeof renderLensWidget>}
  | {method: 'grid'; args: Parameters<typeof renderLensPageWidgets>});
const fixture = JSON.parse(readFileSync('tests/fixtures/lens-shell-original.json', 'utf8')) as {samples: Sample[]};
interface Structure {tag: string; text: string; attributes: Record<string, string>; children: Structure[]}
function structure(node: Element): Structure {
  return {tag: node.tagName,
    text: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(),
    attributes: Object.fromEntries([...node.attributes].filter(attr => !['class','data-lens-shell-view'].includes(attr.name)).map(attr => [attr.name, attr.value])),
    children: [...node.children].map(structure)};
}
function host(html: string) {const node = document.createElement('div'); node.innerHTML = html; return node;}
let restore: ReturnType<typeof configureLensPageShell>;
beforeEach(() => {localStorage.clear(); state.currentProfile = 'lens-shell-fixture'; restore = configureLensPageShell();});
afterEach(() => {configureLensPageShell(restore); localStorage.clear();});
for (const sample of fixture.samples) it(`preserves frozen shared ${sample.method}/${sample.name}`, () => {
  const before = structuredClone(sample);
  configureLensPageShell({getAvailableDashboardFixedWidgetIds: () => sample.available, getDashboardWidgetPrefs: () => ({hidden: sample.hidden})});
  if (sample.order.length) localStorage.setItem(profileStorageKey('lens-shell-fixture', 'lensPageOrder-biology-scores-baseline-v1'), JSON.stringify(sample.order));
  const html = sample.method === 'header' ? renderLensHeader(...sample.args)
    : sample.method === 'widget' ? renderLensWidget(...sample.args) : renderLensPageWidgets(...sample.args);
  const actual = host(html); expect(structure(actual)).toEqual(structure(host(sample.html)));
  expect(sample).toEqual(before);
  expect(actual.querySelector('script,[onclick],[onmouseover]')).toBeNull();
});
it('removes native shared chrome templates and ordinary raw HTML boundaries', () => {
  const source = readFileSync('js/lens-page-shell.ts', 'utf8');
  expect(source).not.toMatch(/`<(?:div|section|button)/);
  expect(source).not.toContain('function renderLensPageMoveControls');
  expect(readFileSync('js/components/LensPageHeader.svelte', 'utf8')).not.toContain('{@html');
  const widget = readFileSync('js/components/LensPageWidget.svelte', 'utf8');
  expect(widget).not.toContain('{@html');
  expect(widget).toContain('<LensWidgetBody');
  expect(widget).toContain('<LensWidgetFrame');
  expect(widget).not.toContain('{@html view.title}');
  const frame = readFileSync('js/components/LensWidgetFrame.svelte', 'utf8');
  expect(frame).not.toContain('{@html');
  expect(frame).toContain('{@render body()}');
});
