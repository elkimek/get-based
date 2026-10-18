// Original native private protocol regression oracle; genuine current Marker behavior is verified separately.
// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {parse as parseSvelte} from 'svelte/compiler';
import original from './fixtures/marker-detail-results-original.json' with {type: 'json'};
import {renderMarkerDetailHistory, renderMarkerDetailRange, renderMarkerDetailEditor,
  type MarkerDetailHistoryView, type MarkerDetailRangeView, type MarkerDetailEditorView} from './fixtures/archived-native-ui/marker-detail-results-presentation.js';

const ports = vi.hoisted(() => ({alter: (_owner: string, html: string) => html}));
vi.mock('./fixtures/archived-native-ui/components/MarkerDetailHistory.svelte.html.js', async load => {
  const real = await load<typeof import('./fixtures/archived-native-ui/components/MarkerDetailHistory.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof real.renderHTML>[0]) => ports.alter('history', real.renderHTML(props))};
});
vi.mock('./fixtures/archived-native-ui/components/MarkerDetailRange.svelte.html.js', async load => {
  const real = await load<typeof import('./fixtures/archived-native-ui/components/MarkerDetailRange.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof real.renderHTML>[0]) => ports.alter('range', real.renderHTML(props))};
});
vi.mock('./fixtures/archived-native-ui/components/MarkerReferenceEditor.svelte.html.js', async load => {
  const real = await load<typeof import('./fixtures/archived-native-ui/components/MarkerReferenceEditor.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof real.renderHTML>[0]) => ports.alter('editor', real.renderHTML(props))};
});
function tree(html: string): unknown {
  const host = document.createElement('div'); host.innerHTML = html;
  function walk(node: Node): unknown {
    const element = node instanceof Element ? node : null;
    return {type: node.nodeType, value: node.nodeValue, name: node.nodeName,
      attrs: element ? [...element.attributes].map(a => [a.name, a.value]) : [],
      defaults: element ? Object.fromEntries(['type', 'value', 'defaultValue', 'disabled', 'tabIndex']
        .filter(key => key in element).map(key => [key, Reflect.get(element, key)])) : null,
      children: [...node.childNodes].map(walk)};
  }
  return [...host.childNodes].map(walk);
}
const rangeKinds = new Set(['band', 'low-zone', 'high-zone', 'optimal-zone', 'edited-badge', 'edit-control', 'suggestion']);
function render(kind: string, props: Record<string, string>): string {
  const view = {kind, ...props};
  if (kind === 'reference') return renderMarkerDetailEditor(view as MarkerDetailEditorView);
  if (rangeKinds.has(kind)) return renderMarkerDetailRange(view as MarkerDetailRangeView);
  return renderMarkerDetailHistory(view as MarkerDetailHistoryView);
}
afterEach(() => {ports.alter = (_owner, html) => html;});
describe('Marker Detail complete result/range/reference presentation', () => {
  for (const fixture of original) it('preserves original raw/native controls ' + fixture.kind + '/' + fixture.sample, () => {
    // Full markup is retained before any parser/assertion gate; private marker-like inserted data is never rescanned.
    const html = render(fixture.kind, fixture.props);
    const raw = process.env['GETBASED_MARKER_DETAIL_RAW'];
    if (raw) fs.writeFileSync(raw + '/' + fixture.kind + '-' + fixture.sample + '.json', JSON.stringify({originalHTML: fixture.originalHTML, currentHTML: html}, null, 2), {flag: 'wx'});
    expect(html === fixture.originalHTML, 'complete original pre-parser markup').toBe(true);
    expect(isDeepStrictEqual(tree(html), fixture.originalTree), 'complete native tree/attributes/control defaults').toBe(true);
  });
  it.each([
    ['unknown compiler comment', (html: string) => html.replace('<!--[-->', '<!--foreign-->')],
    ['missing compiler comment', (html: string) => html.replace('<!--]-->', '')],
    ['extra compiler comment', (html: string) => html + '<!---->'],
    ['missing owned token', (html: string) => html.replace('getbased-marker-detail-owned-slot-0-end', 'foreign')],
    ['duplicated owned token', (html: string) => html.replace('getbased-marker-detail-owned-slot-0-end', 'getbased-marker-detail-owned-slot-0-end getbased-marker-detail-owned-slot-0-end')],
    ['moved compiler boundary', (html: string) => html.replace('<!--[-->', '') + '<!--[-->'],
    ['changed fixed attribute', (html: string) => html.replace('Remove this value', 'foreign')],
    ['foreign action attribute', (html: string) => html.replace('data-marker-detail-owned-actions=', 'data-foreign-action=')],
  ])('rejects %s before data insertion', (_name, corrupt) => {
    ports.alter = (_owner, html) => corrupt(html);
    expect(() => renderMarkerDetailHistory({kind: 'delete-value', actions: 'data-marker-detail-action="delete-marker-value"'})).toThrow(/Unqualified/);
  });
  it('preserves all original fixtures with reordered plain-object fields', () => {
    for (const fixture of original) {
      expect(render(fixture.kind, Object.fromEntries(Object.entries(fixture.props).reverse()))).toBe(fixture.originalHTML);
    }
  });
  it.each([['missing', {}], ['extra', {actions: 'controlled', foreign: 'controlled'}], ['non-string', {actions: 1}]])('rejects %s projected fields', (_name, props) => {
    expect(() => render('delete-value', props as Record<string, string>)).toThrow(/Unqualified/);
  });
  it('contains no authored raw HTML, event directives, event attributes or attribute spreads', () => {
    for (const name of ['MarkerDetailHistory', 'MarkerDetailRange', 'MarkerReferenceEditor']) {
      const ast = parseSvelte(fs.readFileSync(new URL('../js/components/' + name + '.svelte', import.meta.url), 'utf8'), {modern: true});
      function visit(value: unknown): void {
        if (!value || typeof value !== 'object') return;
        const node = value as Record<string, unknown>;
        expect(['HtmlTag', 'EventDirective', 'SpreadAttribute']).not.toContain(node.type);
        if (node.type === 'Attribute') expect(String(node.name)).not.toMatch(/^on(?::|[a-z])/i);
        for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else visit(child);
      }
      visit(ast);
    }
  });
});
