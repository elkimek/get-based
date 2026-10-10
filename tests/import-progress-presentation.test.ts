// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { projectImportProgress, projectImportBatchCounter } from '../js/import-progress-presentation.js';
import { renderImportProgress, renderImportBatchCounter, renderDropZoneReset } from '../js/import-progress-rendering.js';
import { importProgressClasses, type ImportProgressReceiver } from '../js/import-progress-classes.js';

interface Sample { key: string; step: number; pct: number; fileName: string; html: string; authority: string }
interface Fixture {
  schemaVersion: number;
  provenance: { originalOwnerSha256: string; sourceManifestSha256: string; runtimeManifestSha256: string;
    acceptedOriginalContexts: number; acceptedOriginalGeometry: number; receipts: Array<{ label: string; sha256: string }> };
  steps: string[]; starts: number[]; specialFileName: string; samples: Sample[];
  batch: { step: number; current: number; total: number; fileName: string; html: string };
  resetHTML: string;
  sourceFilenameCases: { emptyHTML: string; boxedEmptyHTML: string; literalHTML: string };
  coercion: { projectorOrder: string[]; batchOrder: string[] };
}
interface Receiver { receiver: ImportProgressReceiver; appendedTokens: string[] }
interface Comment { path: number[]; value: string | null }
const fixtureBytes = readFileSync('tests/fixtures/import-progress/original-contract.json');
const fixture = JSON.parse(fixtureBytes.toString()) as Fixture;
const receivers = (JSON.parse(readFileSync('tests/fixtures/import-progress/reviewed-receivers.json', 'utf8')) as {
  receivers: Receiver[];
}).receivers;
const commentPolicy = JSON.parse(readFileSync('tests/fixtures/import-progress/compiler-comments.json', 'utf8')) as {
  status: string; byKey: Record<string, Comment[]> | null;
};
const fixtureHash = 'f505074c63471b1ed9a4c0c0ee469ebff328069bf3b599d8346578b1ef1741ab';
const receiverHash = '3ab323780a1a27261360e5f2464c4f5540b406eea7ff8ec476b8fcd1d32d6a0e';

function host(html: string): HTMLDivElement {
  const element = document.createElement('div'); element.innerHTML = html; return element;
}
function pinnedComments(root: Element, key: string): void {
  const expected = commentPolicy.byKey?.[key];
  if (commentPolicy.status !== 'reviewed-actual-compiled-comments' || !expected) {
    throw new Error('Pending independent actual compiler comment review for ' + key);
  }
  const actual: Comment[] = [], nodes: Node[] = [];
  const walk = (parent: Node, path: number[]): void => [...parent.childNodes].forEach((node, index) => {
    const childPath = [...path, index];
    if (node.nodeType === Node.COMMENT_NODE) { actual.push({ path: childPath, value: node.nodeValue }); nodes.push(node); }
    walk(node, childPath);
  });
  walk(root, []); expect(actual).toEqual(expected);
  for (const node of nodes) node.parentNode!.removeChild(node);
}
const receiverSelectors: Record<ImportProgressReceiver, string> = {
  progress: '.import-progress', step: '.progress-step', icon: '.progress-step .step-icon',
  spinner: '.progress-spinner', bar: '.import-progress-bar', fill: '.import-progress-bar-fill',
  percentage: '.import-progress-pct', stage: '.import-progress-stage', filename: '.import-progress-filename',
  batch: '.batch-progress-counter',
};
function restoreReviewedClasses(actual: Element, original: Element): void {
  for (const receiver of receivers) {
    const selector = receiverSelectors[receiver.receiver];
    const targets = [...actual.querySelectorAll(selector)], sources = [...original.querySelectorAll(selector)];
    expect(targets.length, receiver.receiver).toBe(sources.length);
    for (let index = 0; index < sources.length; index++) {
      const target = targets[index]!, source = sources[index]!, nativeClass = source.getAttribute('class');
      expect(nativeClass).not.toBeNull();
      expect(target.getAttribute('class'), receiver.receiver).toBe(nativeClass + ' ' + receiver.appendedTokens.join(' '));
      target.setAttribute('class', nativeClass!);
    }
  }
}
interface Parsed { tag?: string; attrs?: Record<string, string>; children?: Parsed[]; text?: string | null }
function parsed(node: Node): Parsed {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    return { tag: element.tagName, attrs: Object.fromEntries([...element.attributes].map(a => [a.name, a.value])),
      children: [...element.childNodes].map(parsed) };
  }
  expect(node.nodeType).toBe(Node.TEXT_NODE); return { text: node.nodeValue };
}
function parity(html: string, originalHTML: string, key: string): HTMLDivElement {
  const actual = host(html), original = host(originalHTML);
  pinnedComments(actual, key); restoreReviewedClasses(actual, original);
  // Exact literal nodes/attributes; no trimming, text coalescing, prefix filtering or style rewriting.
  expect([...actual.childNodes].map(parsed)).toEqual([...original.childNodes].map(parsed));
  expect(actual.querySelectorAll('script,img,iframe,[onclick],[onerror],[autofocus]')).toHaveLength(0);
  return actual;
}
function progressKey(step: number, filename: boolean): string { return `step${step}:${filename ? 'filename' : 'empty'}`; }
function throwsSame(action: () => unknown, failure: Error): void {
  let caught: unknown; try { action(); } catch (error) { caught = error; }
  expect(caught).toBe(failure);
}

it('pins small accepted ORIGINAL contracts and the literal reviewed 60-token/61-declaration receiver table', () => {
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(fixtureHash);
  expect(createHash('sha256').update(readFileSync('tests/fixtures/import-progress/reviewed-receivers.json')).digest('hex')).toBe(receiverHash);
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.provenance.originalOwnerSha256).toBe('10c667ac4814eed0d5b8917b591a1c192146a371a616fa9bee18bed4cfbb8a6e');
  expect(fixture.provenance.sourceManifestSha256).toBe('09d9a87a5f67347afba8781e38bef8c86b0cccc5a3d35f86b434b9f89e738066');
  expect(fixture.provenance.runtimeManifestSha256).toBe('495131e964681752a0d46ed060c93c5ba49388db1be6bec7b5ac340f0b3ffcb5');
  expect(fixture.provenance.acceptedOriginalContexts).toBe(10); expect(fixture.provenance.acceptedOriginalGeometry).toBe(47);
  expect(fixture.samples.map(sample => sample.step)).toEqual([0,1,2,3,4,-1,5]);
  expect(receivers).toHaveLength(10); expect(receivers.flatMap(receiver => receiver.appendedTokens)).toHaveLength(60);
  for (const receiver of receivers) {
    const native = receiver.receiver === 'step' ? 'progress-step ' : receiverSelectors[receiver.receiver].split(' ').at(-1)!.slice(1);
    expect(importProgressClasses(native, receiver.receiver)).toBe(native + ' ' + receiver.appendedTokens.join(' '));
  }
});

it.each(fixture.samples)('keeps native step $step semantics, ARIA, filename and adjacent DOM exactly', sample => {
  const view = projectImportProgress(sample.step, sample.pct, sample.fileName);
  expect(view.pct).toBe(sample.pct); expect(view.kind).toBe('progress'); expect(view.steps).toHaveLength(5);
  const actual = parity(renderImportProgress(sample.step, sample.pct, sample.fileName), sample.html,
    progressKey(sample.step, Boolean(sample.fileName)));
  const bar = actual.querySelector('.import-progress-bar')!, fill = actual.querySelector<HTMLElement>('.import-progress-bar-fill')!;
  expect(Object.fromEntries([...bar.attributes].map(a => [a.name, a.value]))).toEqual({
    class: 'import-progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-valuenow': String(sample.pct), 'aria-label': 'Import progress',
  });
  expect(fill.getAttribute('style')).toBe('width:' + sample.pct + '%'); expect(fill.style.width).toBe(sample.pct + '%');
  expect(actual.querySelector('.import-progress-pct')!.textContent).toBe(sample.pct + '%');
  expect(actual.querySelector('.import-progress-stage')!.childNodes).toHaveLength(0);
  expect([...actual.children].map(element => element.className)).toEqual(['import-progress-bar','import-progress-pct','import-progress-stage','import-progress']);
});

it('keeps batch prefix as the first sibling and the exact literal count before the body', () => {
  const sample = fixture.batch;
  expect(projectImportBatchCounter(sample.current, sample.total)).toEqual({ kind: 'batch-counter', text: 'Processing file 2 of 5' });
  const html = renderImportBatchCounter(sample.current, sample.total) + renderImportProgress(sample.step, 15, sample.fileName);
  const actual = parity(html, sample.html, 'batch3:filename');
  expect(actual.children[0]!.className).toBe('batch-progress-counter');
  expect(actual.children[0]!.textContent).toBe('Processing file 2 of 5'); expect(actual.children[1]!.className).toBe('import-progress-bar');
});

it('preserves exact reset sibling whitespace/copy and shared native class ownership', () => {
  const actual = parity(renderDropZoneReset(), fixture.resetHTML, 'reset');
  expect([...actual.children].map(element => element.className)).toEqual(['drop-zone-icon','drop-zone-text','drop-zone-hint']);
  expect(actual.childNodes).toHaveLength(5);
});

it('escapes literal filename text and preserves empty versus truthy boxed-empty presence', () => {
  expect(projectImportProgress(2,12,'').fileName).toBeNull();
  parity(renderImportProgress(2,12,''), fixture.sourceFilenameCases.emptyHTML, 'step2:empty');
  const boxed = new String('') as unknown as string;
  expect(projectImportProgress(2,12,boxed).fileName).toBe('');
  const empty = parity(renderImportProgress(2,12,boxed), fixture.sourceFilenameCases.boxedEmptyHTML, 'step2:filename');
  expect(empty.querySelectorAll('.import-progress-filename')).toHaveLength(1);
  const literal = '<img src=x onerror=alert(1)> & "quote" \'apostrophe\'\u00a0';
  const actual = parity(renderImportProgress(2,12,literal), fixture.sourceFilenameCases.literalHTML, 'step2:filename');
  expect(actual.querySelector('.import-progress-filename')!.textContent).toBe(literal);
  expect(actual.querySelector('.import-progress-filename')!.children).toHaveLength(0);
});

it('preserves native per-row numeric coercion followed by one filename conversion, including throw order', () => {
  const calls: string[] = [];
  const step = { [Symbol.toPrimitive](hint: string) { calls.push('step:' + hint); return 2; } } as unknown as number;
  const name = { [Symbol.toPrimitive](hint: string) { calls.push('filename:' + hint); return 'literal'; } } as unknown as string;
  const view = projectImportProgress(step,12,name);
  expect(calls).toEqual(fixture.coercion.projectorOrder); expect(view.fileName).toBe('literal');
  // === compares original object identity without coercing; numeric-equivalent object has no active row.
  expect(view.steps.map(row => row.state)).toEqual(['done','done','','','']);
  calls.length = 0; const failure = new Error('native step conversion failure');
  const badStep = { [Symbol.toPrimitive]() { calls.push('step'); throw failure; } } as unknown as number;
  throwsSame(() => projectImportProgress(badStep,12,name),failure); expect(calls).toEqual(['step']);
  calls.length = 0; const badName = { toString() { calls.push('filename'); throw failure; } } as unknown as string;
  throwsSame(() => projectImportProgress(2,12,badName),failure); expect(calls).toEqual(['filename']);
});

it('preserves batch current then total template conversions and short-circuit failure', () => {
  const calls: string[] = [];
  const current = { [Symbol.toPrimitive](hint: string) { calls.push('current:' + hint); return 2; } } as unknown as number;
  const total = { [Symbol.toPrimitive](hint: string) { calls.push('total:' + hint); return 5; } } as unknown as number;
  expect(projectImportBatchCounter(current,total).text).toBe('Processing file 2 of 5'); expect(calls).toEqual(fixture.coercion.batchOrder);
  calls.length = 0; const failure = new Error('native batch conversion failure');
  const bad = { [Symbol.toPrimitive]() { calls.push('current'); throw failure; } } as unknown as number;
  throwsSame(() => projectImportBatchCounter(bad,total),failure); expect(calls).toEqual(['current']);
});

it('rejects extra utilities, native attribute changes, whitespace/text changes and injected siblings', () => {
  const sample = fixture.samples.find(item => item.step === 2)!;
  const original = renderImportProgress(2,12,sample.fileName), key = 'step2:filename';
  parity(original,sample.html,key); // Negative guards require a passing baseline, never a pending-policy failure.
  for (const mutate of [
    (root: Element) => root.querySelector('.progress-step')!.setAttribute('class', root.querySelector('.progress-step')!.getAttribute('class') + ' gb:unreviewed'),
    (root: Element) => root.querySelector('.import-progress-bar')!.setAttribute('aria-valuenow','13'),
    (root: Element) => root.querySelector('.import-progress-bar-fill')!.setAttribute('style','width:12%;height:99px'),
    (root: Element) => root.querySelector('.import-progress-pct')!.append(' '),
    (root: Element) => root.append(document.createElement('span')),
    (root: Element) => root.append(document.createComment('unreviewed')),
  ]) { const changed = host(original); mutate(changed); expect(() => parity(changed.innerHTML,sample.html,key)).toThrow(); }
});
