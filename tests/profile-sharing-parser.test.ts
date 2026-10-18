import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, it} from 'vitest';
import {JSDOM, VirtualConsole} from 'jsdom';
import {
  renderActiveShare, renderCreateShare, renderResultShare, renderLoadShare, renderShareShell,
  projectActiveShare, projectCreateShare, projectResultShare, type ShareBodyView,
} from '../js/profile-share-presentation.js';
import type {ShareResultReader} from '../types/profile-share.js';

type NativeNode = {
  type: number; value: string | null; tag?: string; namespace?: string | null;
  attrs?: [string, string][]; controls?: Record<string, unknown> | null; children?: NativeNode[];
};
type Anchor = {path: number[]; value: string; parentChildren: {type: number; tag?: string; value: string | null}[]};
type Input = {
  label: string; kind: 'active' | 'create' | 'result' | 'load' | 'shell'; id: unknown;
  name: unknown; secret: unknown; records: {id: string; expiresAt: string; shareUrl: string}[];
  shellBody?: 'create' | 'result' | 'load'; width?: number;
};
type Fixture = {
  fixture: Input; original: string; candidate: string; anchors: Anchor[];
  activeExpiryLabels: [string, string][]; resultExpiryLabel: string | null; guards: string[];
};
type Chronology = {
  throwing: string | null; trace: string[]; error: {name: string; message: string} | null;
  candidateHTML: string | null; resultExpiryLabel: string | null;
};
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/profile-sharing-parser-original.json', import.meta.url), 'utf8')) as {
  schemaVersion: number; cases: Fixture[]; chronology: Chronology[];
};
const hostile = '<img src=x onerror=alert(1)>"&\'☃ <!--literal-->';

// These are frozen original formatter results supplied through the real facade's
// public callback seam. This suite does not reimplement the controller formatter.
function render(fixture: Fixture): string {
  const input = fixture.fixture;
  const active = () => projectActiveShare(input.records, value => {
    const labels = fixture.activeExpiryLabels.filter(([expiry]) => expiry === value);
    assert.equal(labels.length, 1);
    return labels[0]![1];
  }, () => input.id || '');
  const result: ShareResultReader = {
    profileName: input.name, shareUrl: hostile, password: input.secret,
    expiresAt: '2099-01-01T00:00:00Z', profileId: input.id,
  };
  const body = (kind: Exclude<Input['kind'], 'shell'>) => {
    switch (kind) {
      case 'active': return renderActiveShare(input.records, value => {
        const labels = fixture.activeExpiryLabels.filter(([expiry]) => expiry === value);
        assert.equal(labels.length, 1); return labels[0]![1];
      }, () => input.id || '');
      case 'create': return renderCreateShare(() => input.name, () => input.id || '', input.secret, active);
      case 'result': return renderResultShare(result, value => {
        assert.equal(value, '2099-01-01T00:00:00Z');
        assert.equal(typeof fixture.resultExpiryLabel, 'string');
        return fixture.resultExpiryLabel!;
      }, active);
      case 'load': return renderLoadShare(input.id);
    }
  };
  if (input.kind !== 'shell') return body(input.kind);
  assert.ok(input.shellBody);
  const shellBody = (): ShareBodyView => {
    switch (input.shellBody) {
      case 'create': return {kind: 'create', view: projectCreateShare(() => input.name, () => input.id || '', input.secret, active)};
      case 'result': return {kind: 'result', view: projectResultShare(result, value => {
        assert.equal(value, '2099-01-01T00:00:00Z');
        assert.equal(typeof fixture.resultExpiryLabel, 'string');
        return fixture.resultExpiryLabel!;
      }, active)};
      case 'load': return {kind: 'load', view: {id: input.id === null || input.id === undefined ? '' : String(input.id)}};
      default: return assert.fail('Missing recorded shell body kind');
    }
  };
  return renderShareShell(input.name, 'Encrypted Link', shellBody());
}

// Expected-only compiler grammar: append the finite genuine child boundaries to
// immutable prior receipt bytes. Never strip or normalize the current output.
function expectedGenuineHTML(fixture: Fixture): string {
  const input = fixture.fixture;
  const kind = input.kind === 'shell' ? input.shellBody! : input.kind;
  let html = fixture.candidate;
  const once = (needle: string, replacement: string) => {
    assert.equal(html.split(needle).length, 2, 'Closed expected grammar target');
    html = html.replace(needle, replacement);
  };
  if (kind === 'create' || kind === 'result') {
    once('\n      \n    <section class="profile-share-active"', '\n      <!---->\n    <section class="profile-share-active"');
    once('</section>\n  ', '</section>\n  <!---->');
  }
  if (input.kind === 'shell') {
    const branch = kind === 'create' ? '1' : kind === 'result' ? '2' : '-1';
    once('\n        \n    <div class="gb-form-body', `\n        <!--[${branch}--><!---->\n    <div class="gb-form-body`);
    once('\n  \n      </div>\n    </div>', '\n  <!--]--><!---->\n      </div>\n    </div>');
    return '<!--[-->' + html + '<!--]-->';
  }
  return '<!--[--><!---->' + html + '<!--]-->';
}

// The same native fragment seam as the captured controller: template.innerHTML.
// Record ordered native attributes, namespaces, every text node and form defaults.
function nativeTree(html: string): NativeNode {
  const errors: string[] = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(String(error)));
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {virtualConsole: console});
  const template = dom.window.document.createElement('template');
  template.innerHTML = html;
  const tree = (node: Node): NativeNode => {
    const value: NativeNode = {type: node.nodeType, value: node.nodeValue};
    if (node.nodeType === 1) {
      const element = node as Element;
      value.tag = element.tagName;
      value.namespace = element.namespaceURI;
      value.attrs = [...element.attributes].map(attribute => [attribute.name, attribute.value]);
      value.controls = element instanceof dom.window.HTMLInputElement ? {
        type: element.type, value: element.value, defaultValue: element.defaultValue,
        checked: element.checked, defaultChecked: element.defaultChecked, disabled: element.disabled,
        readOnly: element.readOnly, required: element.required, form: element.form?.id ?? null,
        valid: element.validity.valid, valueMissing: element.validity.valueMissing,
        selectionStart: element.selectionStart, selectionEnd: element.selectionEnd, selectionDirection: element.selectionDirection,
      } : element instanceof dom.window.HTMLSelectElement ? {
        value: element.value, selectedIndex: element.selectedIndex, disabled: element.disabled,
        required: element.required, form: element.form?.id ?? null, valid: element.validity.valid,
      } : element instanceof dom.window.HTMLOptionElement ? {
        value: element.value, selected: element.selected, defaultSelected: element.defaultSelected, disabled: element.disabled,
      } : element instanceof dom.window.HTMLButtonElement ? {
        type: element.type, value: element.value, disabled: element.disabled, form: element.form?.id ?? null,
      } : null;
    }
    if (node.childNodes.length) value.children = [...node.childNodes].map(tree);
    return value;
  };
  const result = tree(template.content);
  assert.deepEqual(errors, []);
  dom.window.close();
  return result;
}

function anchors(root: NativeNode): Anchor[] {
  const result: Anchor[] = [];
  const walk = (parent: NativeNode, path: number[]) => {
    for (const [index, child] of (parent.children ?? []).entries()) {
      if (child.type === 8) {
        assert.equal(typeof child.value, 'string');
        result.push({path: [...path, index], value: child.value!, parentChildren:
          (parent.children ?? []).map(node => ({type: node.type, ...(node.tag ? {tag: node.tag} : {}), value: node.value}))});
      }
      walk(child, [...path, index]);
    }
  };
  walk(root, []);
  return result;
}
function originalCorrespondence(raw: NativeNode, fixed: Anchor[]): NativeNode {
  // Every comment must match this fixture's literal observed paths AND complete
  // parent adjacency before removal. Unknown, moved or duplicate anchors fail.
  assert.deepEqual(anchors(raw), fixed);
  const result = structuredClone(raw);
  for (const anchor of [...fixed].sort((a, b) => b.path.length - a.path.length ||
    b.path.join('.').localeCompare(a.path.join('.'), undefined, {numeric: true}))) {
    let parent = result;
    for (const index of anchor.path.slice(0, -1)) {
      assert.ok(parent.children?.[index]);
      parent = parent.children[index]!;
    }
    const index = anchor.path.at(-1)!;
    assert.equal(parent.children?.[index]?.type, 8);
    assert.equal(parent.children?.[index]?.value, anchor.value);
    parent.children!.splice(index, 1);
    if (!parent.children!.length) delete parent.children;
  }
  return result;
}
function find(root: NativeNode, predicate: (node: NativeNode) => boolean): NativeNode {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    try {return find(child, predicate);} catch (error) {assert.ok(error instanceof assert.AssertionError);}
  }
  assert.fail('Missing fixture mutation target');
}
function mutations(tree: NativeNode): {label: string; tree: NativeNode}[] {
  const result: {label: string; tree: NativeNode}[] = [];
  const add = (label: string, change: (raw: NativeNode) => void) => {
    const raw = structuredClone(tree); change(raw); result.push({label, tree: raw});
  };
  const element = (raw: NativeNode) => find(raw, node => node.type === 1);
  add('attribute-addition', raw => {element(raw).attrs!.push(['data-unknown', 'changed']);});
  add('attribute-order', raw => {find(raw, node => (node.attrs?.length ?? 0) > 1).attrs!.reverse();});
  add('namespace', raw => {element(raw).namespace = 'urn:wrong';});
  add('text', raw => {find(raw, node => node.type === 3 && !!node.value).value += ' changed';});
  add('unknown-comment', raw => {(raw.children ??= []).push({type: 8, value: 'unexpected'});});
  add('extra-known-comment', raw => {(raw.children ??= []).push({type: 8, value: '['});});
  const has = (predicate: (node: NativeNode) => boolean) => {
    try {find(tree, predicate); return true;} catch (error) {assert.ok(error instanceof assert.AssertionError); return false;}
  };
  if (has(node => node.controls !== null && node.controls !== undefined)) {
    add('native-control-default', raw => {find(raw, node => node.controls !== null && node.controls !== undefined).controls!.disabled = true;});
  }
  if (has(node => !!node.attrs?.some(([name]) => name === 'data-profile-share-action'))) {
    add('action', raw => {
      const node = find(raw, candidate => !!candidate.attrs?.some(([name]) => name === 'data-profile-share-action'));
      node.attrs = node.attrs!.map(([name, value]) => [name, name === 'data-profile-share-action' ? 'unknown' : value]);
    });
  }
  return result;
}

describe('Sharing captured original native parser contracts', () => {
  it('covers fourteen actual fixtures and the exact 110 captured corruption targets', () => {
    assert.equal(fixtures.schemaVersion, 1);
    assert.equal(fixtures.cases.length, 14);
    assert.equal(fixtures.cases.reduce((sum, row) => sum + row.guards.length, 0), 110);
  });
  for (const fixture of fixtures.cases) {
    it(fixture.fixture.label, () => {
      const html = render(fixture);
      const expectedHTML = expectedGenuineHTML(fixture);
      assert.equal(html, expectedHTML, 'Exact expected genuine facade bytes before native parsing');
      const actualTree = nativeTree(html), expectedTree = nativeTree(expectedHTML);
      assert.deepEqual(actualTree, expectedTree);
      const currentNegatives = mutations(actualTree);
      assert.deepEqual(currentNegatives.map(row => row.label), fixture.guards);
      for (const negative of currentNegatives) {
        assert.throws(() => assert.deepEqual(negative.tree, expectedTree), assert.AssertionError, negative.label);
      }
      // Preserve every original native correspondence and corruption assertion,
      // in addition to current exact bytes, exact nodes and current corruption.
      const original = nativeTree(fixture.original), current = nativeTree(fixture.candidate);
      assert.deepEqual(originalCorrespondence(current, fixture.anchors), original);
      const negatives = mutations(current);
      assert.deepEqual(negatives.map(row => row.label), fixture.guards);
      for (const negative of negatives) {
        assert.throws(() => assert.deepEqual(originalCorrespondence(negative.tree, fixture.anchors), original), assert.AssertionError, negative.label);
      }
    });
  }
  it('preserves all six captured getter/coercion/error chronologies', () => {
    assert.equal(fixtures.chronology.length, 6);
    for (const expected of fixtures.chronology) {
      const trace: string[] = [];
      const read = (name: string, value: unknown): unknown => {
        trace.push('read:' + name);
        if (expected.throwing === name) throw new Error(name + ' failed');
        return value;
      };
      const value = (name: string) => ({[Symbol.toPrimitive](hint: string) {trace.push(name + ':' + hint); return name;}});
      const result: ShareResultReader = {
        get profileName() {return read('name', value('name'));},
        get shareUrl() {return read('url', value('url'));},
        get password() {return read('password', value('password'));},
        get expiresAt() {return read('expiry', '2099-01-01T00:00:00Z') as string;},
        get profileId() {return read('profile', 'p');},
      };
      let error: {name: string; message: string} | null = null;
      let html: string | null = null;
      try {
        html = renderResultShare(result, expiry => {
          assert.equal(expiry, '2099-01-01T00:00:00Z');
          assert.equal(typeof expected.resultExpiryLabel, 'string');
          return expected.resultExpiryLabel!;
        }, () => projectActiveShare([], () => '', () => result.profileId || ''));
      } catch (caught) {
        assert.ok(caught instanceof Error);
        error = {name: caught.name, message: caught.message};
      }
      assert.deepEqual(trace, expected.trace);
      assert.deepEqual(error, expected.error);
      if (expected.candidateHTML === null) assert.equal(html, null);
      else {
        const receipt = fixtures.cases.find(row => row.fixture.kind === 'result')!;
        assert.equal(html, expectedGenuineHTML({...receipt, candidate: expected.candidateHTML}));
      }
    }
  });
});
