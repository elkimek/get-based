import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { configureExportImportRuntimeDeps, refreshImportRuntimeShell } from '../js/export-runtime.js';

const legacyFixture: { sha256: string; source: string } = JSON.parse(fs.readFileSync(new URL('./fixtures/restored-thread-list-original.json', import.meta.url), 'utf8'));
const legacy = legacyFixture.source;
// Erase types from the pinned original canonical procedure with Node, then run
// that unchanged procedure as the DOM/read-order comparison oracle.
import { stripTypeScriptTypes } from 'node:module';
expect(createHash('sha256').update(legacy).digest('hex')).toBe('e1da1c11bba946bb71274e935365ace02f2749f972180ced6df8f57664d26711');
const legacyJS = stripTypeScriptTypes(legacy, { mode: 'strip' });
let previous: ReturnType<typeof configureExportImportRuntimeDeps>;
let previousThreads: typeof state.chatThreads;
let previousId: typeof state.currentThreadId;
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><body><div id="chat-thread-list"></div></body>');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  previousThreads = state.chatThreads; previousId = state.currentThreadId;
  previous = configureExportImportRuntimeDeps({ loadChatThreads: () => true, ensureActiveThread: () => {},
    renderThreadList: null, refreshChatPersonalities: null, buildSidebar: null, updateHeaderDates: null,
    renderProfileButton: null, navigate: null });
  document.body.innerHTML = '<div id="chat-thread-list"></div>';
});
afterEach(() => {
  state.chatThreads = previousThreads; state.currentThreadId = previousId;
  configureExportImportRuntimeDeps(previous); vi.useRealTimers(); dom.window.close(); vi.unstubAllGlobals();
});
function tree(node: Node): unknown {
  if (node.nodeType === 8 || node.nodeType === 3 && !node.textContent) return undefined;
  if (node.nodeType === 3) return node.textContent;
  const el = node as Element;
  return { tag: el.tagName, attrs: [...el.attributes].map(a => [a.name, a.value]),
    children: [...node.childNodes].map(tree).filter(x => x !== undefined) };
}
const sparse: unknown[] = []; sparse[2] = { id: 'sparse', name: 'Sparse row', messageCount: 1 };
const fixtures: unknown[][] = [
  sparse,
  [{ id: 'one', name: 'One', updatedAt: '2026-10-14T11:59:00Z', messageCount: 1 }],
  [{ id: 'old', updatedAt: 'bad date', messageCount: -2 }, { id: 'new', name: '<img src=x onerror=boom>', personalityIcon: '<svg>', personalityName: '"<&', updatedAt: '2026-10-14T11:30:00Z', messageCount: 2.5 }],
  [null, undefined, {}, { id: 0, name: 0, personalityIcon: false, personalityName: '', messageCount: Infinity }],
  [{ id: 'symbols', name: Symbol('name'), personalityIcon: Symbol('icon'), personalityName: Symbol('title'), updatedAt: '2026-10-12T12:00:00Z', messageCount: '3' }],
  [{ id: 'empty-title', name: 'Empty', personalityName: { toString: () => '' }, updatedAt: '2026-10-14T12:01:00Z', messageCount: 'not a number' }],
];
for (const [index, threads] of fixtures.entries()) it(`preserves complete restored row DOM and metadata for fixture ${index}`, async () => {
  (state as { chatThreads: unknown[] }).chatThreads = threads;
  state.currentThreadId = index === 1 ? 'one' : 'new';
  const expected = document.createElement('div');
  vm.runInNewContext(legacyJS + '\nrenderThreadListFallback();', { state, Date, document: { getElementById: () => expected } });
  await refreshImportRuntimeShell({ chat: true });
  const actual = document.getElementById('chat-thread-list')!;
  expect([...actual.childNodes].map(tree).filter(x => x !== undefined)).toEqual([...expected.childNodes].map(tree).filter(x => x !== undefined));
  expect(actual.querySelector('img, svg, script')).toBeNull();
  expect([...actual.querySelectorAll<HTMLButtonElement>('button')].map(button => button.type)).toEqual(threads.filter(() => true).map(() => 'button'));
});
it('keeps empty recovery accessible and uses existing scoped Tailwind empty styling', async () => {
  state.chatThreads = []; await refreshImportRuntimeShell({ chat: true });
  const empty = document.querySelector('#chat-thread-list > [data-chat-thread-navigation-view]')!;
  expect(empty.textContent).toBe('No conversations yet');
  expect(empty.className).toContain('gb:thread-nav:text-xs');
  expect(empty.hasAttribute('style')).toBe(false);
});
it('retains failure before replacing the list when a restored count cannot be coerced', async () => {
  (state as { chatThreads: unknown[] }).chatThreads = [{ id: 'broken', messageCount: Symbol('count') }];
  document.getElementById('chat-thread-list')!.textContent = 'previous';
  await expect(refreshImportRuntimeShell({ chat: true })).rejects.toThrow(TypeError);
  expect(document.getElementById('chat-thread-list')!.textContent).toBe('previous');
});

it('preserves getter and coercion order and every interrupted render before replacing existing content', async () => {
  function fixture(trace: string[], failAt: number): unknown {
    function read(label: string): void {
      trace.push(label);
      if (trace.length === failAt) throw new Error(`fault:${label}`);
    }
    const text = (label: string, value: string) => ({
      [Symbol.toPrimitive]() { read(`coerce:${label}`); return value; },
    });
    const values: Record<string, unknown> = { id: text('id', 'probe'), name: text('name', '<literal>'),
      personalityIcon: text('icon', '&'), personalityName: text('title', '"title'), updatedAt: 'bad-date',
      messageCount: { [Symbol.toPrimitive]() { read('coerce:count'); return 1; } } };
    return new Proxy(values, { get(target, key) { read(`get:${String(key)}`); return target[String(key)]; } });
  }
  const successfulTrace: string[] = [];
  const nativeHost = document.createElement('div');
  const nativeState = { chatThreads: [fixture(successfulTrace, Infinity)], currentThreadId: null };
  vm.runInNewContext(legacyJS + '\nrenderThreadListFallback();', { state: nativeState, Date,
    document: { getElementById: () => nativeHost } });
  for (let failAt = 1; failAt <= successfulTrace.length + 1; failAt++) {
    const beforeTrace: string[] = [], currentTrace: string[] = [];
    const expected = document.createElement('div'); expected.textContent = 'previous';
    let beforeError: string | null = null, currentError: string | null = null;
    try { vm.runInNewContext(legacyJS + '\nrenderThreadListFallback();', {
      state: { chatThreads: [fixture(beforeTrace, failAt)], currentThreadId: null }, Date,
      document: { getElementById: () => expected },
    }); } catch (error) { beforeError = String(error); }
    (state as { chatThreads: unknown[] }).chatThreads = [fixture(currentTrace, failAt)];
    state.currentThreadId = null;
    const actual = document.getElementById('chat-thread-list')!; actual.textContent = 'previous';
    try { await refreshImportRuntimeShell({ chat: true }); } catch (error) { currentError = String(error); }
    expect(currentTrace).toEqual(beforeTrace);
    expect(currentError).toBe(beforeError);
    expect([...actual.childNodes].map(tree).filter(x => x !== undefined)).toEqual([...expected.childNodes].map(tree).filter(x => x !== undefined));
  }
});
