// @vitest-environment jsdom
import fs from 'node:fs';
import {afterAll, afterEach, beforeAll, beforeEach, expect, it} from 'vitest';
import {CURRENT_RELEASE} from '../js/changelog-current.js';
import {closeChangelog, loadChangelogModule, openChangelog} from '../js/changelog.js';

// Real public modules, renderer/sanitizer, release reference and parser; no mocks.
// Native browser layout/input and facade loader timing remain separate coverage.
const nativePage = fs.readFileSync('index.html', 'utf8');
const oldBody = document.body.innerHTML;
const oldVersion = Object.getOwnPropertyDescriptor(window, 'APP_VERSION');
const oldSeen = localStorage.getItem('labcharts-changelog-seen');
const originalRelease = Object.getOwnPropertyDescriptors(CURRENT_RELEASE);
let implementation: Awaited<ReturnType<typeof loadChangelogModule>>;

function restoreRelease(): void {
  for (const key of Reflect.ownKeys(CURRENT_RELEASE)) Reflect.deleteProperty(CURRENT_RELEASE, key);
  Object.defineProperties(CURRENT_RELEASE, originalRelease);
  expect(Object.getOwnPropertyDescriptors(CURRENT_RELEASE)).toEqual(originalRelease);
}
async function withRelease(descriptors: PropertyDescriptorMap, action: () => void | Promise<void>): Promise<void> {
  try {Object.defineProperties(CURRENT_RELEASE, descriptors); await action();}
  finally {restoreRelease();}
}
const data = (value: unknown): PropertyDescriptor => ({value, enumerable: true, configurable: true, writable: true});
const modal = (): HTMLElement => {
  const host = document.getElementById('changelog-modal');
  if (!host) throw new Error('Actual index.html Changelog host required');
  return host;
};
const first = (selector: string): Element => {
  const node = modal().querySelector(selector);
  if (!node) throw new Error('Original Changelog node required: ' + selector);
  return node;
};
beforeAll(async () => {
  Object.defineProperty(window, 'APP_VERSION', {value: CURRENT_RELEASE.version, configurable: true, writable: true});
  implementation = await loadChangelogModule();
});
beforeEach(() => {
  // Actual source hosts parsed without bootstrap or script/resource execution.
  document.body.innerHTML = new DOMParser().parseFromString(nativePage, 'text/html').body.innerHTML;
  localStorage.removeItem('labcharts-changelog-seen');
});
afterEach(async () => {
  try {restoreRelease(); closeChangelog();}
  finally {
    // Keep the real document alive for original 30ms opening callbacks. No fake clock.
    await new Promise(resolve => setTimeout(resolve, 60));
    document.body.replaceChildren();
  }
});
afterAll(() => {
  restoreRelease();
  if (oldVersion) Object.defineProperty(window, 'APP_VERSION', oldVersion);
  else Reflect.deleteProperty(window, 'APP_VERSION');
  if (oldSeen === null) localStorage.removeItem('labcharts-changelog-seen');
  else localStorage.setItem('labcharts-changelog-seen', oldSeen);
  document.body.innerHTML = oldBody;
});

// Exact expected native text comes from original metadata-literals receipt.
it.each([
  ['null', null, 'v — ', ''],
  ['undefined', undefined, 'v — ', ''],
  ['false', false, 'vfalse — false', 'false'],
  ['zero', 0, 'v0 — 0', '0'],
  ['escaped', '<b> & " \'', 'v<b> & " \' — <b> & " \'', '<b> & " \''],
  ['native-controls', 'a\r\nb\u0000c', 'va\nbc — a\nbc', 'a\nbc'],
] as const)('preserves original parsed metadata for %s', async (_label, value, versionText, dateText) => {
  await withRelease({version: data(value), title: data(value), date: data(value)}, async () => {
    await openChangelog(false);
    expect(first('.changelog-version').textContent).toBe(versionText);
    expect(first('.changelog-date').textContent).toBe(dateText);
    expect(first('.changelog-header').querySelectorAll('b,script,img')).toHaveLength(0);
    expect(modal().querySelectorAll('.changelog-entry')).toHaveLength(3);
    const close = first('.modal-close') as HTMLButtonElement;
    expect(close.getAttribute('type')).toBe('button');
    expect(close.type).toBe('button');
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(close.getAttribute('data-changelog-action')).toBe('close');
  });
});

it('retains allowed emphasis and safe anchors while displaying hostile items as literals', async () => {
  await withRelease({items: data([
    '<b>bold</b><i>italic</i><em>em</em><strong>strong</strong><code>code</code>',
    '<a href="https://getbased.health/path?a=1&b=2">https & text</a>',
    '<a href="http://getbased.health/">http</a>', '<a href="mailto:test@example.invalid">mail</a>',
    '<a href="javascript:alert(1)">unsafe-js</a>', '<a href="data:text/html,test">unsafe-data</a>',
    '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
    '<b class="foreign">not allowed attrs</b>', '&lt;b&gt;entity literal&lt;/b&gt;',
    'quote " \' & < >', null, undefined, false, 0,
  ])}, async () => {
    await openChangelog(false);
    const items = first('.changelog-items');
    const rows = Array.from(items.querySelectorAll('li'));
    expect(rows.map(row => row.textContent)).toEqual([
      'bolditalicemstrongcode', 'https & text', 'http', 'mail', 'unsafe-js', 'unsafe-data',
      '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
      '<b class="foreign">not allowed attrs', '&lt;b&gt;entity literal&lt;/b&gt;',
      'quote " \' & < >', '', '', 'false', '0',
    ]);
    expect(Array.from(rows[0]!.children, node => node.tagName)).toEqual(['B', 'I', 'EM', 'STRONG', 'CODE']);
    expect(Array.from(items.querySelectorAll('a'), node => Array.from(node.attributes, attr => [attr.name, attr.value])))
      .toEqual([
        [['href', 'https://getbased.health/path?a=1&b=2'], ['target', '_blank'], ['rel', 'noopener noreferrer']],
        [['href', 'http://getbased.health/'], ['target', '_blank'], ['rel', 'noopener noreferrer']],
        [['href', 'mailto:test@example.invalid']],
      ]);
    expect(items.querySelectorAll('script,img,[onerror],.foreign')).toHaveLength(0);
  });
});

const fullTrace = ['get:version', 'string:version', 'get:title', 'string:title', 'get:date', 'string:date',
  'get:items', 'get:item-0', 'string:item-0', 'get:item-1', 'string:item-1'];
it.each([null, 'version', 'title', 'date', 'items', 'item-0', 'item-1'] as const)
  ('retains original property/coercion order and atomic markup at %s', async failure => {
    await openChangelog(false); // Genuine established prior markup, not a helper-rendered oracle.
    const host = modal(), prior = host.innerHTML, trace: string[] = [];
    const descriptors: PropertyDescriptorMap = {};
    const value = (key: string): object => ({toString() {
      trace.push('string:' + key);
      if (failure === key) throw new Error('sentinel:' + key);
      return key + ' <&>';
    }});
    for (const key of ['version', 'title', 'date']) descriptors[key] = {
      configurable: true, enumerable: true, get() {trace.push('get:' + key); return value(key);},
    };
    const items: unknown[] = [];
    for (let i = 0; i < 2; i++) Object.defineProperty(items, String(i), {
      configurable: true, enumerable: true, get() {trace.push('get:item-' + i); return value('item-' + i);},
    });
    descriptors.items = {configurable: true, enumerable: true, get() {
      trace.push('get:items');
      if (failure === 'items') throw new Error('sentinel:items');
      return items;
    }};
    await withRelease(descriptors, () => {
      // The actual publicly loaded implementation preserves the exception boundary;
      // the facade deliberately catches renderer exceptions and reports a toast.
      if (failure === null) {
        expect(() => implementation.openChangelog(false)).not.toThrow();
        expect(host.innerHTML).not.toBe(prior);
        expect(trace).toEqual(fullTrace);
      } else {
        expect(() => implementation.openChangelog(false)).toThrow('sentinel:' + failure);
        expect(host.innerHTML).toBe(prior);
        const terminal = (failure === 'items' ? 'get:' : 'string:') + failure;
        expect(trace).toEqual(fullTrace.slice(0, fullTrace.indexOf(terminal) + 1));
      }
      expect(host.className).toBe('modal changelog-modal gb-history-modal gb:changelog-panel:changelog-panel-block');
    });
  });
