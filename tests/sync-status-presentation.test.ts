// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHTML as nativeIndicator } from '../js/components/SyncIndicatorPresentation.svelte.html.js';
import { renderHTML as nativePopover } from '../js/components/SyncPopoverPresentation.svelte.html.js';
import type { SyncIndicatorView } from '../js/sync-status-rendering.js';
import { expectedSyncIndicator, expectedSyncPopover, literalSyncView, requireExactSyncGraph,
  type OriginalSyncPopoverView } from './helpers/sync-status-exact-ssr-expectations.js';

interface OriginalPopover {
  name: string; trace: string[]; error: { name: string; message: string } | null;
  rawAssignedHTML: string | null; parsedTree: unknown[] | null; appended: boolean;
}
interface Fixture {
  popovers: Array<{ original: OriginalPopover; capturedViewWitness: OriginalSyncPopoverView | null }>;
  indicators: Array<{ original: { name: string; trace: string[]; html: string | null; tree: unknown[] | null;
    afterHTML: string | null; nativeType: string | null; nativeDisabled: boolean | null;
    retainedButton: boolean | null; retainedDot: boolean | null; assignments: string[] } }>;
  hostileIndicator: { title: string; html: string; tree: unknown[] };
}
const fixture = JSON.parse(readFileSync('tests/fixtures/sync-status-original.json', 'utf8')) as Fixture;
let indicatorMutation: ((html: string) => string) | null = null;
let popoverMutation: ((html: string) => string) | null = null;
beforeEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
  indicatorMutation = null; popoverMutation = null;
  vi.doMock('../js/components/SyncIndicatorPresentation.svelte.html.js', () => ({ renderHTML: (props: Parameters<typeof nativeIndicator>[0]) => {
    const html = nativeIndicator(props); return indicatorMutation ? indicatorMutation(html) : html;
  } }));
  vi.doMock('../js/components/SyncPopoverPresentation.svelte.html.js', () => ({ renderHTML: (props: Parameters<typeof nativePopover>[0]) => {
    const html = nativePopover(props); return popoverMutation ? popoverMutation(html) : html;
  } }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers();
  for (const module of ['../js/components/SyncIndicatorPresentation.svelte.html.js', '../js/components/SyncPopoverPresentation.svelte.html.js',
    '../js/utils.js', '../js/sync-environment.js', '../js/sync-relay-health.js', '../js/settings-runtime-bridge.js']) vi.doUnmock(module);
  vi.resetModules(); document.body.innerHTML = '';
});
function parsed(html: string, indicator = false): unknown[] {
  const host = document.createElement('div'); host.innerHTML = html;
  function tree(node: Node): unknown {
    if (!(node instanceof Element)) return { type: node.nodeType, value: node.nodeValue };
    return { type: 1, name: node.tagName, attrs: Array.from(node.attributes, a => [a.name, a.value]),
      children: Array.from(node.childNodes, tree), ...(node instanceof HTMLButtonElement
        ? { nativeType: node.type, disabled: node.disabled, ...(indicator ? { value: node.value } : {}) } : {}) };
  }
  return Array.from(host.childNodes, tree);
}
function renderedFixture(name: string): { original: OriginalPopover; capturedViewWitness: OriginalSyncPopoverView } {
  const row = fixture.popovers.find(row => row.original.name === name);
  expect(row).toBeDefined(); expect(row?.capturedViewWitness).not.toBeNull();
  if (!row?.capturedViewWitness) throw new Error('Retained rendered fixture missing');
  return { original: row.original, capturedViewWitness: row.capturedViewWitness };
}

describe('Sync presentation against retained original parser contracts', () => {
  it('retains the closed original fixture inventory', () => {
    expect(fixture.popovers).toHaveLength(31); expect(fixture.indicators).toHaveLength(8);
    expect(new Set(fixture.popovers.map(row => row.original.name)).size).toBe(31);
    expect(fixture.popovers.filter(row => row.capturedViewWitness !== null)).toHaveLength(24);
  });
  it.each(fixture.popovers.filter(row => row.capturedViewWitness !== null))('preserves original native contract and exact genuine graph: $original.name', async row => {
    const { renderSyncPopoverView } = await import('../js/sync-status-rendering.js');
    const old = row.capturedViewWitness!;
    // Anchor the independently authored oracle to every immutable original byte/tree.
    const nativeExpected = expectedSyncPopover(old, 'native');
    expect(nativeExpected).toBe(row.original.rawAssignedHTML);
    // The detached-host case recorded the pre-parser assignment but had no appended host.
    expect(parsed(nativeExpected)).toEqual(row.original.parsedTree ?? parsed(row.original.rawAssignedHTML!));
    const expected = expectedSyncPopover(old, 'genuine');
    const html = renderSyncPopoverView(literalSyncView(old));
    expect(html).toBe(expected); expect(parsed(html)).toEqual(parsed(expected));
    const host = document.createElement('div'); host.innerHTML = html;
    expect([...host.querySelectorAll('div[style="margin-bottom:3px"] > span:first-child')].map(node => node.textContent))
      .toEqual(old.events.map(event => event.kindHTML));
    expect(host.querySelectorAll('script,textarea,style,[data-native-kind],[data-native-breakout]')).toHaveLength(0);
  });
  it('escapes the retained hostile direct indicator title without creating nodes', async () => {
    const { renderSyncIndicatorView } = await import('../js/sync-status-rendering.js');
    const html = renderSyncIndicatorView({ state: 'offline', title: fixture.hostileIndicator.title });
    expect(html).toBe(expectedSyncIndicator(fixture.hostileIndicator.html));
    expect(parsed(html, true)).toEqual([{ type: 8, value: '[' }, ...fixture.hostileIndicator.tree, { type: 8, value: ']' }]);
    const host = document.createElement('div'); host.innerHTML = html;
    expect(host.childNodes).toHaveLength(3); expect(host.children).toHaveLength(1);
    expect(host.querySelector('[data-probe]')).toBeNull();
    expect(host.querySelector('button')!.getAttribute('title')).toBe(fixture.hostileIndicator.title);
  });
  it('owns literal DTO fields without interpreting event, relay or error data as HTML', async () => {
    const { renderSyncPopoverView } = await import('../js/sync-status-rendering.js');
    const text = '<b data-probe>literal & "quoted"</b><!--[0--><!--getbased-sync-kind-slot-0-->';
    const view = literalSyncView(renderedFixture('debug-events').capturedViewWitness);
    view.relay = 'relay:' + text; view.error = { type: 'error:' + text, age: 'age:' + text };
    view.events = [{ color: 'var(--accent)', kind: 'kind:' + text, age: 'event-age:' + text, text: 'text:' + text }];
    const host = document.createElement('div'); host.innerHTML = renderSyncPopoverView(view);
    expect(host.querySelector('div[style*="word-break:break-all"]')!.textContent).toBe('relay:' + text);
    expect(host.querySelector('div[style="font-size:11px;color:var(--text-muted);margin-top:6px"]')!.textContent)
      .toBe('error:' + text + ' age:' + text);
    const event = host.querySelector('div[style="margin-bottom:3px"]')!;
    expect(event.firstElementChild!.textContent).toBe('kind:' + text);
    expect(event.lastElementChild!.textContent).toBe('text:' + text);
    expect(event.textContent).toBe('kind:' + text + ' · event-age:' + text + ' · text:' + text);
    expect(host.querySelectorAll('b,script,textarea,style,[data-probe]')).toHaveLength(0);
    expect([...host.querySelectorAll('[data-sync-ui-action]')].map(node => node.getAttribute('data-sync-ui-action')))
      .toEqual(['copy-events', 'sync-now', 'open-settings', 'show-diagnose', 'force-resend', 'clean-storage', 'test-relay']);
  });
  it.each([
    ['unknown comment', (html: string) => '<!-- not-owned -->' + html],
    ['missing root', (html: string) => html.replace('<!--[-->', '')],
    ['duplicate owned empty comment', (html: string) => html.replace('<!---->', '<!----><!---->')],
    ['changed branch', (html: string) => html.replace('<!--[0-->', '<!--[1-->')],
    ['wrong action', (html: string) => html.replace('data-sync-ui-action="sync-now"', 'data-sync-ui-action="wrong"')],
    ['wrong style', (html: string) => html.replace('font-size:12px', 'font-size:99px')],
    ['changed button default', (html: string) => html.replace('<button', '<button disabled')],
    ['changed event label', (html: string) => html.replace('Recent activity', 'Wrong activity')],
    ['added node', (html: string) => html + '<i>Unexpected</i>'],
  ] as const)('detects actual compiled popover corruption with the exact graph oracle: %s', async (_name, mutate) => {
    const { renderSyncPopoverView } = await import('../js/sync-status-rendering.js');
    const row = renderedFixture('raw-kind-markup');
    const expected = expectedSyncPopover(row.capturedViewWitness, 'genuine');
    expect(renderSyncPopoverView(literalSyncView(row.capturedViewWitness))).toBe(expected);
    expect(() => requireExactSyncGraph(expected, expected)).not.toThrow();
    popoverMutation = html => { const altered = mutate(html); expect(altered).not.toBe(html); return altered; };
    expect(() => requireExactSyncGraph(renderSyncPopoverView(literalSyncView(row.capturedViewWitness)), expected))
      .toThrow('Changed genuine Sync SSR graph');
  });
  it.each([
    ['missing opening root', (html: string) => html.slice(8)],
    ['changed opening root', (html: string) => html.replace('<!--[-->', '<!--[1-->')],
    ['missing closing root', (html: string) => html.slice(0, -8)],
    ['changed closing root', (html: string) => html.replace('<!--]-->', '<!--foreign-->')],
    ['unknown inner comment', (html: string) => html.replace('<button', '<!--foreign--><button')],
    ['duplicate root', (html: string) => '<!--[-->' + html],
  ] as const)('detects actual compiled indicator corruption with the exact graph oracle: %s', async (_name, mutate) => {
    const { renderSyncIndicatorView } = await import('../js/sync-status-rendering.js');
    const view: SyncIndicatorView = { state: 'synced', title: 'Synced' };
    const expected = expectedSyncIndicator(fixture.indicators.find(row => row.original.name === 'synced')!.original.html)!;
    expect(renderSyncIndicatorView(view)).toBe(expected);
    expect(() => requireExactSyncGraph(expected, expected)).not.toThrow();
    indicatorMutation = html => { const altered = mutate(html); expect(altered).not.toBe(html); return altered; };
    expect(() => requireExactSyncGraph(renderSyncIndicatorView(view), expected)).toThrow('Changed genuine Sync SSR graph');
  });
});

// Declared service ports are unit seams only; actual controller and status service remain imported.
async function controller(debug: boolean[] = [false, false], trace: string[] = [], relay: () => unknown = () => 'wss://synthetic.invalid/<relay>&"', quota: () => unknown = () => null) {
  let debugReads = 0;
  vi.doMock('../js/utils.js', async () => {
    const actual = await vi.importActual<typeof import('../js/utils.js')>('../js/utils.js');
    return { escapeHTML: actual.escapeHTML, escapeAttr: actual.escapeAttr,
      showNotification: () => { throw new Error('Unexpected notification'); },
      isDebugMode: () => { trace.push('debug:' + debugReads); return debug[Math.min(debugReads++, debug.length - 1)]; } };
  });
  vi.doMock('../js/sync-environment.js', () => ({ getSyncRelay: () => { trace.push('relay'); return relay(); } }));
  vi.doMock('../js/sync-relay-health.js', () => ({ getRelayQuotaEstimate: () => { trace.push('quota'); return quota(); } }));
  vi.doMock('../js/settings-runtime-bridge.js', () => ({ getSettingsModuleFunction: () => { throw new Error('Unexpected Settings'); } }));
  return { ui: await import('../js/sync-ui.js'), status: await import('../js/sync-state.js') };
}
describe('public Sync indicator lifetime and original no-render boundaries', () => {
  it.each(fixture.indicators)('retains original public indicator case: $original.name', async ({ original }) => {
    if (original.name !== 'missing-host') document.body.innerHTML = '<div id="sync-indicator-slot"></div>';
    const { ui, status } = await controller();
    const trace: string[] = []; let reads = 0;
    const enabled = original.name === 'disabled' ? [false] : original.name === 'second-read-disabled' ? [true, false] : [true, true];
    ui.configureSyncUI({ isSyncEnabled: () => { trace.push('enabled:' + reads);
      if (original.name === 'getter-throws-disabled') throw new Error('Synthetic enabled getter');
      return enabled[Math.min(reads++, enabled.length - 1)]!;
    } });
    if (original.name === 'synced') status.updateSyncStatus({ relay: 'connected' });
    if (original.name === 'offline') status.updateSyncStatus({ relay: 'unreachable' });
    if (original.name === 'error') status.updateSyncStatus({ push: 'error', lastError: { type: 'Synthetic', at: 0 } });
    const assignments: string[] = [];
    const setter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
    vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (this: Element, value: string) {
      if (this.id === 'sync-indicator-slot') assignments.push(value); setter.call(this, value);
    });
    ui.renderSyncIndicator();
    const slot = document.getElementById('sync-indicator-slot'); const button = slot?.querySelector('button'); const dot = button?.firstElementChild;
    expect(slot?.innerHTML ?? null).toBe(expectedSyncIndicator(original.html));
    const expectedTree = original.html ? [{ type: 8, value: '[' }, ...original.tree!, { type: 8, value: ']' }] : original.tree;
    expect(slot ? parsed(slot.innerHTML, true) : null).toEqual(expectedTree);
    if (button && dot) { ui.updateSyncIndicator(); expect(slot!.querySelector('button')).toBe(button); expect(button.firstElementChild).toBe(dot); }
    expect(trace).toEqual(original.trace); expect(assignments).toEqual(original.assignments.map(html => expectedSyncIndicator(html)));
    expect(slot?.innerHTML ?? null).toBe(expectedSyncIndicator(original.afterHTML)); expect(button?.type ?? null).toBe(original.nativeType);
    expect(button?.disabled ?? null).toBe(original.nativeDisabled);
  });
  it.each(['raw-kind-symbol', 'raw-kind-throwing', 'event-text-throws', 'quota-pct-throws', 'relay-throws-late'])('preserves original atomic throw and read order: %s', async name => {
    document.body.innerHTML = '<div id="sync-indicator-slot"></div>';
    const trace: string[] = [];
    const quota = () => name !== 'quota-pct-throws' && name !== 'relay-throws-late' ? null : {
      get bytes() { trace.push('quota.bytes'); return 1024 * 1024; }, get cap() { trace.push('quota.cap'); return 2 * 1024 * 1024; },
      get level() { trace.push('quota.level'); return 'green'; }, get pct() { trace.push('quota.pct'); if (name === 'quota-pct-throws') throw new Error('synthetic quota failure'); return 50; },
    };
    const relay = () => name === 'relay-throws-late' ? { [Symbol.toPrimitive](hint: string) { trace.push('relay-coerce:' + hint); throw new Error('synthetic relay failure'); } } : 'wss://synthetic.invalid/<relay>&"';
    const { ui, status } = await controller([true, true], trace, relay, quota);
    ui.configureSyncUI({ isSyncEnabled: () => true }); ui.renderSyncIndicator();
    const kind: unknown = name === 'raw-kind-symbol' ? Symbol('kind') : name === 'raw-kind-throwing'
      ? { [Symbol.toPrimitive](hint: string) { trace.push('kind-coerce:' + hint); throw new Error('synthetic kind failure'); } } : 'push';
    const text: unknown = name === 'event-text-throws' ? { [Symbol.toPrimitive](hint: string) { trace.push('text-coerce:' + hint); throw new Error('synthetic text failure'); } } : '<i data-native-text>escaped & "quoted"</i>';
    // Deliberately hostile runtime values reproduce the public original fixture; no private state mutation.
    for (let i = 0; i < 7; i++) status.logSyncEvent((i === 6 ? kind : 'skip') as string, (i === 6 ? text : 'older-' + i) as string);
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => { trace.push('create:' + tag); return create(tag, options); });
    let error: { name: string; message: string } | null = null;
    try { ui.toggleSyncDetail(); } catch (caught) { error = { name: (caught as Error).name, message: (caught as Error).message }; }
    const expected = fixture.popovers.find(row => row.original.name === name)!.original;
    expect(error).toEqual(expected.error); expect(trace).toEqual(expected.trace);
    expect(document.getElementById('sync-popover')).toBeNull();
  });
  it('preserves the original two ordered raw kind coercions before native parsing', async () => {
    // Unit-only clock fixture; native capture receipts use untouched real clocks.
    vi.useFakeTimers(); vi.setSystemTime(10_000);
    document.body.innerHTML = '<div id="sync-indicator-slot"></div>';
    const trace: string[] = []; const { ui, status } = await controller([true, true], trace);
    ui.configureSyncUI({ isSyncEnabled: () => true }); ui.renderSyncIndicator();
    let reads = 0;
    const kind = { [Symbol.toPrimitive](hint: string) { trace.push('kind-coerce:' + hint + ':' + (++reads)); return reads === 1 ? 'push' : '<b>coerced</b>'; } };
    for (let i = 0; i < 7; i++) status.logSyncEvent((i === 6 ? kind : 'skip') as string, i === 6 ? '<i data-native-text>escaped & "quoted"</i>' : 'older-' + i);
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => { trace.push('create:' + tag); return create(tag, options); });
    const setter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
    let assigned: string | null = null;
    vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (this: Element, value: string) {
      if (this.id === 'sync-popover') assigned = value; setter.call(this, value);
    });
    ui.toggleSyncDetail();
    const row = renderedFixture('raw-kind-object');
    const expected = expectedSyncPopover(row.capturedViewWitness, 'genuine');
    expect(trace).toEqual(row.original.trace); expect(reads).toBe(2); expect(assigned).toBe(expected);
    expect(parsed(document.getElementById('sync-popover')!.innerHTML)).toEqual(parsed(expected));
    expect(document.querySelector('div[style="margin-bottom:3px"] > span')!.textContent).toBe('<b>coerced</b>');
    expect(document.querySelector('#sync-popover b')).toBeNull();
  });
  it.each(['host-missing', 'host-existing'])('retains original early-return host boundary: %s', async name => {
    const trace: string[] = []; const { ui } = await controller([true, true], trace);
    if (name === 'host-existing') document.body.innerHTML = '<div id="sync-popover">old</div>';
    ui.toggleSyncDetail();
    const expected = fixture.popovers.find(row => row.original.name === name)!.original;
    expect(trace).toEqual(expected.trace); expect(document.getElementById('sync-popover')).toBeNull();
  });
});
