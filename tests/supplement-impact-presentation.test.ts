import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { escapeHTML } from '../js/utils.js';
import { renderSupplementImpactView } from '../js/supplement-impact-presentation.js';

const fixture: { source: string; sha256: string } = JSON.parse(fs.readFileSync(new URL('./fixtures/supplement-impact-original.json', import.meta.url), 'utf8'));
expect(createHash('sha256').update(fixture.source).digest('hex')).toBe('a8bfce23de59ba9db0cd00e6fc4ee7dd1a8d3086631c03434689f0d56f35f960');
const current = fs.readFileSync(new URL('../js/supplement-impact.js', import.meta.url), 'utf8');
const currentProcedure = current.slice(current.indexOf('export function renderSupplementImpact('), current.indexOf('function scheduleAnalyze(')).replace(/^export /gm, '');
const originalProcedure = stripTypeScriptTypes(fixture.source).replace(/^export /gm, '');
interface Case { ai: boolean; data: 'none' | 'empty' | 'one' | 'before' | 'after' | 'mixed'; impacts: boolean; cached: boolean; stale?: boolean; dot?: string; summary?: unknown; index?: unknown }
function tree(node: Node): unknown {
  if (node.nodeType === 8) return ['', '[', ']', '[0', '[1', '[-1', '[!'].includes(node.nodeValue ?? '') ? undefined : { comment: node.nodeValue };
  if (node.nodeType === 3 && !node.textContent) return undefined;
  if (node.nodeType === 3) return node.textContent;
  const element = node as Element;
  const children: unknown[] = [];
  for (const child of node.childNodes) {
    const next = tree(child); if (next === undefined) continue;
    const last = children.at(-1);
    // Removing known compiler anchors joins adjacent text nodes. Keep every
    // nonempty whitespace character, matching the browser's Node.normalize().
    if (typeof last === 'string' && typeof next === 'string') children[children.length - 1] = last + next;
    else children.push(next);
  }
  return { tag: element.tagName, attrs: [...element.attributes].map(a => [a.name, a.value]),
    defaultType: element.tagName === 'BUTTON' ? (element as HTMLButtonElement).type : null,
    children };
}
function run(source: string, input: Case, failAt = Infinity) {
  const trace: string[] = []; function read(label: string) { trace.push(label); if (trace.length === failAt) throw new Error('fault:' + label); }
  const dates = input.data === 'empty' ? undefined : input.data === 'one' ? ['2024-01-01'] : input.data === 'before'
    ? ['2023-01-01','2023-02-01'] : input.data === 'after' ? ['2025-01-01','2025-02-01'] : ['2023-01-01','2025-01-01'];
  const data = input.data === 'none' ? null : { dates };
  const supplement = { name: 'Probe', startDate: '2024-01-01' };
  const entry = new Proxy({ fp: input.stale ? 'stale' : 'same', dot: input.dot ?? 'green', summary: input.summary ?? 'Literal <img>&" text' }, {
    get(target, key, receiver) { read('cache:' + String(key)); return Reflect.get(target, key, receiver); },
  });
  let html: string | null = null, error: string | null = null;
  try { html = vm.runInNewContext(source + '\nrenderSupplementImpact(supplement, editIndex);', {
    supplement, editIndex: input.index ?? 2, escapeHTML, renderSupplementImpactView,
    hasAssistantFeatureProvider() { read('provider'); return input.ai; },
    getActiveData() { read('data'); return data; },
    computeAllImpacts() { read('impacts'); return input.impacts ? [{ pctChange: 2 }] : []; },
    getSuppFingerprint() { read('fingerprint'); return 'same'; },
    getImpactCache() { read('cache'); return input.cached ? { record: entry } : {}; },
    getSupplementRecordId() { read('record-id'); return 'record'; },
    scheduleAnalyze(s: unknown, index: unknown, d: unknown) { read('schedule'); expect(s).toBe(supplement); expect(index).toBe(input.index ?? 2); expect(d).toBe(data); },
  }) as string; } catch (failure) { error = String(failure); }
  const dom = new JSDOM(html ?? ''); const nodes = [...dom.window.document.body.childNodes].map(tree).filter(x => x !== undefined); dom.window.close();
  return { trace, error, nodes };
}
const cases: Case[] = [
  ...(['none','empty','one','before','after','mixed'] as const).map(data => ({ ai: true, data, impacts: false, cached: false })),
  ...[false,true].flatMap(ai => [false,true].flatMap(cached => [false,true].map(stale => ({ ai, data: 'mixed' as const, impacts: true, cached, stale })))),
  { ai: true, data: 'mixed', impacts: true, cached: true, dot: 'gray', summary: Symbol('summary') },
  { ai: true, data: 'mixed', impacts: true, cached: true, index: Symbol('index') },
];
it.each(cases)('preserves whole native impact DOM, button defaults, cache and queue trace %#', input => {
  expect(run(currentProcedure, input)).toEqual(run(originalProcedure, input));
});
it('retains each interruption before subsequent cache reads and queue scheduling', () => {
  const input: Case = { ai: true, data: 'mixed', impacts: true, cached: true };
  const successful = run(originalProcedure, input);
  for (let point = 1; point <= successful.trace.length + 1; point++) expect(run(currentProcedure, input, point)).toEqual(run(originalProcedure, input, point));
});
it('renders cached class metadata as literal attributes instead of admitting markup breakout', () => {
  const input: Case = { ai: true, data: 'mixed', impacts: true, cached: true, dot: '"><img src=x onerror=boom><span class="' };
  const before = run(originalProcedure, input), after = run(currentProcedure, input);
  expect(after.trace).toEqual(before.trace); expect(after.error).toBeNull();
  expect(JSON.stringify(before.nodes)).toContain('"tag":"IMG"');
  expect(JSON.stringify(after.nodes)).not.toContain('"tag":"IMG"');
  expect(JSON.stringify(after.nodes)).toContain('onerror=boom');
});
