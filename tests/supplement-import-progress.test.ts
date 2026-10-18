import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { projectSupplementImportProgress, renderSupplementImportProgress } from '../js/supplement-import-progress-presentation.js';
import { escapeHTML } from '../js/utils.js';

const fixture: { source: string; sha256: string } = JSON.parse(fs.readFileSync(new URL('./fixtures/supplement-import-progress-original.json', import.meta.url), 'utf8'));
expect(createHash('sha256').update(fixture.source).digest('hex')).toBe('18351498476e80c5707382d01cd5c1d545f9bb0f1878279b1e7c09f1edc23912');
const currentSource = fs.readFileSync(new URL('../js/supplement-import-controller.js', import.meta.url), 'utf8');
const currentProcedure = currentSource.slice(currentSource.indexOf('function renderImportProgress('), currentSource.indexOf('function startImportProgress('));
const originalProcedure = stripTypeScriptTypes(fixture.source);
afterEach(() => vi.restoreAllMocks());
function tree(node: Node): unknown {
  if (node.nodeType === 8 || node.nodeType === 3 && !node.textContent) return undefined;
  if (node.nodeType === 3) return node.textContent;
  const element = node as Element;
  return { tag: element.tagName, attributes: [...element.attributes].map(a => [a.name, a.value]), children: [...node.childNodes].map(tree).filter(x => x !== undefined) };
}
function run(source: string, input: {phase: number; label: unknown; startedAt: number; state: string; now: number; missing?: boolean; stale?: boolean; throwLabel?: boolean}) {
  const trace: string[] = [];
  let html = 'previous', hidden: unknown = true, className: unknown = 'previous';
  vi.spyOn(Date, 'now').mockImplementation(() => { trace.push('clock'); return input.now; });
  const area = Object.defineProperties({}, {
    hidden: { set(value: unknown) { trace.push('hidden:' + value); hidden = value; } },
    className: { set(value: unknown) { trace.push('class:' + value); className = value; } },
    innerHTML: { set(value: string) { trace.push('html'); html = value; } },
  });
  const label = input.throwLabel ? { [Symbol.toPrimitive]() { trace.push('label-coercion'); throw new Error('label failed'); } }
    : typeof input.label === 'string' ? { [Symbol.toPrimitive]() { trace.push('label-coercion'); return input.label; } } : input.label;
  const progress = new Proxy({ id: input.stale ? 2 : 1, phase: input.phase, label, startedAt: input.startedAt }, {
    get(target, key, receiver) { trace.push('get:' + String(key)); return Reflect.get(target, key, receiver); },
  });
  let error: string | null = null;
  try { vm.runInNewContext(source + '\nrenderImportProgress(1, currentState);', {
    supplementImportProgress: progress, currentState: input.state, Date, escapeHTML,
    projectSupplementImportProgress, renderSupplementImportProgress,
    document: { getElementById(id: string) { trace.push('find:' + id); return input.missing ? null : area; } },
  }); } catch (failure) { error = String(failure); }
  vi.restoreAllMocks();
  const dom = new JSDOM('<!doctype html><body><div></div></body>');
  const host = dom.window.document.querySelector('div')!; host.innerHTML = html;
  const domTree = [...host.childNodes].map(tree).filter(x => x !== undefined); dom.window.close();
  return { trace, error, hidden, className, domTree };
}
const cases: Array<Parameters<typeof run>[1]> = [
  ...[0,1,2,3,4,-1,NaN,Infinity].map(phase => ({ phase, label: '<img src=x onerror=boom>&"', startedAt: 0, state: 'running', now: 1000 })),
  ...[0,59000,60000,131000,15000].map(now => ({ phase: 3, label: 'Reading tables', startedAt: 0, state: 'running', now })),
  ...['success','error','other'].map(state => ({ phase: 4, label: 'Ready', startedAt: 0, state, now: 17000 })),
  { phase: 1, label: null, startedAt: 0, state: 'running', now: 0 },
  { phase: 1, label: Symbol('label'), startedAt: 0, state: 'running', now: 0 },
  { phase: 1, label: 'Skipped', startedAt: 0, state: 'running', now: 0, missing: true },
  { phase: 1, label: 'Skipped', startedAt: 0, state: 'running', now: 0, stale: true },
  { phase: 1, label: 'Failure', startedAt: 0, state: 'running', now: 0, throwLabel: true },
];
it.each(cases)('retains native progress DOM, timer/read order and interrupted writes %#', input => {
  const current = run(currentProcedure, input), original = run(originalProcedure, input);
  if (Number.isNaN(input.phase) && !input.missing && !input.stale) {
    // Malformed private phase values formerly exposed aria-valuenow="undefined".
    // Preserve all other structure and reads, but omit that invalid ARIA value.
    const track = original.domTree[1] as { attributes: string[][] };
    expect(track.attributes.filter(attribute => attribute[0] === 'aria-valuenow')).toEqual([['aria-valuenow', 'undefined']]);
    track.attributes = track.attributes.filter(attribute => attribute[0] !== 'aria-valuenow');
    expect((current.domTree[1] as { attributes: string[][] }).attributes.some(attribute => attribute[0] === 'aria-valuenow')).toBe(false);
  }
  expect(current).toEqual(original);
});
it('passes literal label text and original percent to the accessible progressbar', () => {
  const html = renderSupplementImportProgress(projectSupplementImportProgress({ label: '<script>literal</script>', phase: 4,
    startedAt: 0, state: 'success', percent: 100, slowHint: '' }));
  const dom = new JSDOM(html); const bar = dom.window.document.querySelector('[role=progressbar]')!;
  expect(bar.getAttribute('aria-valuenow')).toBe('100');
  expect(bar.getAttribute('aria-label')).toBe('Supplement import progress');
  expect(dom.window.document.querySelector('script')).toBeNull();
  expect(dom.window.document.querySelector('strong')?.textContent).toBe('<script>literal</script>'); dom.window.close();
});
