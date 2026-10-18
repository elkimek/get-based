// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi } from 'vitest';
import { escapeHTML } from '../js/utils.js';
import { renderFooterCommitLink } from '../js/footer-commit-link-presentation.js';
import * as component from '../js/components/FooterCommitLink.svelte.html.js';

const original = fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/commit-hash-original.js.txt'), 'utf8');
function parsed(document: Document, html: string) {
  const host = document.createElement('div'); host.innerHTML = html;
  const walk = (node: Node): unknown => ({
    type: node.nodeType, value: node.nodeValue,
    tag: node instanceof document.defaultView!.Element ? node.tagName : null,
    attrs: node instanceof document.defaultView!.Element ? Array.from(node.attributes, attr => [attr.name, attr.value]) : null,
    children: Array.from(node.childNodes, walk),
  });
  return Array.from(host.childNodes, walk);
}
type CommitAssignment = {phase: 'first' | 'second'; value: string; before: string; after: string};
/** Per-realm observation, scoped to the real commit target. Every assignment
 * passes through the unchanged native setter exactly once; getter is native. */
function observeCommitAssignments(document: Document) {
  const prototype = document.defaultView!.Element.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'innerHTML');
  if (!descriptor?.get || !descriptor.set) throw new Error('Native innerHTML accessors required');
  const nativeGet = descriptor.get, nativeSet = descriptor.set;
  const assignments: CommitAssignment[] = [];
  const events: Array<{phase: 'first' | 'second'; step: 'before-native' | 'after-native'; value: string}> = [];
  let phase: 'first' | 'second' = 'first';
  Object.defineProperty(prototype, 'innerHTML', {
    ...descriptor,
    set(this: Element, value: string) {
      if (this.ownerDocument !== document || this.id !== 'app-commit-hash') {
        nativeSet.call(this, value); return;
      }
      expect(typeof value).toBe('string');
      const before: string = nativeGet.call(this);
      // Save the exact assignment argument BEFORE the genuine native parse.
      const assignment = {phase, value, before, after: ''};
      assignments.push(assignment); events.push({phase, step: 'before-native', value});
      nativeSet.call(this, value);
      assignment.after = nativeGet.call(this);
      events.push({phase, step: 'after-native', value: assignment.after});
    },
  });
  expect(Object.getOwnPropertyDescriptor(prototype, 'innerHTML')!.get).toBe(nativeGet);
  return {
    assignments, events,
    secondPhase() { phase = 'second'; },
    restore() {
      Object.defineProperty(prototype, 'innerHTML', descriptor);
      expect(Object.getOwnPropertyDescriptor(prototype, 'innerHTML')).toEqual(descriptor);
    },
  };
}
/** Whole original public loader, with its actual cache and promise chain. */
async function run(candidate: boolean, sha: unknown, scenario: 'success' | 'failure' | 'missing' = 'success') {
  const browser = new JSDOM('<!doctype html><body><span id="app-version-text"></span><span id="app-commit-hash">pending</span></body>');
  const observation = observeCommitAssignments(browser.window.document);
  try {
    const document = browser.window.document, trace: string[] = [];
    if (scenario === 'missing') document.getElementById('app-commit-hash')!.remove();
    const source = candidate ? fs.readFileSync(path.join(process.cwd(), 'js/commit-hash.js'), 'utf8') : original;
    const context = vm.createContext({ document, escapeHTML, renderFooterCommitLink,
      getAppVersionRuntime() { trace.push('version'); return 'v-fixture'; },
      fetch(url: unknown) {
        trace.push('fetch:' + String(url));
        return Promise.resolve({ ok: scenario !== 'failure', json() { trace.push('json'); return Promise.resolve({ sha }); } });
      },
    });
    vm.runInContext(source.replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '') + '\nglobalThis.api = { loadCommitHash };', context);
    const api = context.api as { loadCommitHash(): void };
    api.loadCommitHash(); for (let i = 0; i < 8; i++) await Promise.resolve();
    const first = document.getElementById('app-commit-hash')?.innerHTML ?? null;
    const version = document.getElementById('app-version-text')!.textContent;
    const firstTrace = [...trace];
    observation.secondPhase();
    document.body.innerHTML = '<span id="app-version-text">retained-version</span><span id="app-commit-hash">pending</span>';
    api.loadCommitHash(); for (let i = 0; i < 8; i++) await Promise.resolve();
    const second = document.getElementById('app-commit-hash')!.innerHTML;
    const firstAssignments = observation.assignments.filter(assignment => assignment.phase === 'first');
    const secondAssignments = observation.assignments.filter(assignment => assignment.phase === 'second');
    expect(firstAssignments).toHaveLength(first === null || first === 'pending' ? 0 : 1);
    expect(secondAssignments).toHaveLength(second === 'pending' ? 0 : 1);
    expect(observation.events).toEqual(observation.assignments.flatMap(assignment => [
      {phase: assignment.phase, step: 'before-native', value: assignment.value},
      {phase: assignment.phase, step: 'after-native', value: assignment.after},
    ]));
    for (const assignment of observation.assignments) {
      expect(assignment.before).toBe('pending');
      expect(parsed(document, assignment.value)).toEqual(parsed(document, assignment.after));
    }
    return { raw: { first: firstAssignments[0]?.value ?? null, second: secondAssignments[0]?.value ?? null,
      assignments: observation.assignments, setterEvents: observation.events },
      observed: { firstParsed: first === null ? null : parsed(document, first), secondParsed: parsed(document, second),
      version, retainedVersion: document.getElementById('app-version-text')!.textContent, firstTrace, trace } };
  } finally { try { observation.restore(); } finally { browser.window.close(); } }
}

describe('footer commit Svelte link and original public loader', () => {
  it('captures real assignment strings before parsing, ignores other nodes and restores the native descriptor', () => {
    const browser = new JSDOM('<span id="app-commit-hash">pending</span><span id="other">other</span>');
    const document = browser.window.document, prototype = browser.window.Element.prototype;
    const before = Object.getOwnPropertyDescriptor(prototype, 'innerHTML');
    const observation = observeCommitAssignments(document);
    try {
      const target = document.getElementById('app-commit-hash')!;
      const value = '<a href="/exact?x=&quot;y&quot;">A&#10;B &amp; C</a>';
      target.innerHTML = value;
      document.getElementById('other')!.innerHTML = '<b>ignored</b>';
      expect(observation.assignments).toHaveLength(1);
      expect(observation.assignments[0]!.value).toBe(value);
      expect(observation.assignments[0]!.after).toBe(target.innerHTML);
      expect(target.innerHTML).not.toBe(value);
      expect(target.textContent).toBe('A\nB & C');
      expect(observation.events.map(event => event.step)).toEqual(['before-native', 'after-native']);
      expect(Object.getOwnPropertyDescriptor(prototype, 'innerHTML')!.get).toBe(before!.get);
    } finally {
      try { observation.restore(); expect(Object.getOwnPropertyDescriptor(prototype, 'innerHTML')).toEqual(before); }
      finally { browser.window.close(); }
    }
  });

  it.each(['abcdef123456789', '  abcdef123456789  ', 'abcdef1"><img src=x onerror=alert(1)>', '<>&"\'abc', 'αβγδεζηθ', '<!--[--><!--]-->', '', '   ', null, false, 0])('preserves original complete native tree/cache/version for %j', async sha => {
    const legacy = await run(false, sha), current = await run(true, sha);
    expect(current.observed).toEqual(legacy.observed);
    if (process.env['FOOTER_COMMIT_QUALIFICATION_OUTPUT']) {
      const output = process.env['FOOTER_COMMIT_QUALIFICATION_OUTPUT'];
      fs.writeFileSync(output + '/fixture-' + Buffer.from(JSON.stringify(sha)).toString('hex') + '.json', JSON.stringify({ original: legacy, candidate: current }, null, 2));
    }
    if (current.observed.firstParsed && String(sha || '').trim()) {
      const browser = new JSDOM(); try {
        const host = browser.window.document.createElement('div'); host.innerHTML = current.raw.first!;
        expect(host.childNodes.length).toBe(1); expect(host.querySelectorAll('a').length).toBe(1);
        expect(host.querySelector('img,script,[onclick],[onerror]')).toBeNull();
        expect(host.firstElementChild!.getAttribute('href')).toBe('https://github.com/elkimek/get-based/commit/' + String(sha || '').trim());
        expect(host.textContent).toBe(String(sha || '').trim().slice(0, 7));
      } finally { browser.window.close(); }
    }
  });
  it.each(['failure', 'missing'] as const)('retains original %s fetch/version/unchanged-placeholder contract', async scenario => {
    expect(await run(true, 'abcdef123', scenario)).toEqual(await run(false, 'abcdef123', scenario));
  });
  it('preserves exactly the original coercion calls and thrown-coercion recovery', async () => {
    for (const throws of [false, true]) {
      const outputs = [];
      for (const candidate of [false, true]) {
        const trace: string[] = [];
        const sha = { [Symbol.toPrimitive](hint: string) { trace.push(hint); if (throws) throw Error('sha coercion'); return ' abcdef123 '; } };
        outputs.push({ result: await run(candidate, sha), coercions: trace });
      }
      expect(outputs[1]).toEqual(outputs[0]);
      expect(outputs[0]!.coercions).toEqual(throws ? ['string', 'string'] : ['string']);
    }
  });
  it.each(['prefix', 'suffix', 'foreign-inner', 'extra-root', 'wrong-link'] as const)('rejects foreign SSR envelope %s', kind => {
    const real = component.renderHTML;
    const spy = vi.spyOn(component, 'renderHTML').mockImplementation(props => {
      const raw = real(props);
      if (kind === 'prefix') return 'foreign' + raw;
      if (kind === 'suffix') return raw + 'foreign';
      if (kind === 'foreign-inner') return raw.replace('</a>', '<!--foreign--></a>');
      if (kind === 'extra-root') return raw + raw;
      return raw.replace('https://github.com/elkimek/get-based/commit/', 'https://foreign.invalid/');
    });
    try { expect(() => renderFooterCommitLink('abcdef123', 'abcdef1')).toThrow(); }
    finally { spy.mockRestore(); }
  });
});
