// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  projectPdfDuplicateView, projectPdfModelMismatchView, projectPdfUnsupportedLabView,
  type PdfModelMismatchInput, type PdfPreflightView,
} from '../js/pdf-preflight-presentation.js';
import { renderPdfImageMode, renderPdfPreflight } from '../js/pdf-preflight-rendering.js';
import { pdfPreflightClasses } from '../js/pdf-preflight-classes.js';
import { runPreflightChecks } from '../js/pdf-import-preflight.js';

// Public-controller unit boundary only. Hash/provider/classifier and modal lifecycle
// are stubs; the established original Date/label assembly, bindings and renderer run.
const controller = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  provider: false,
  classification: null as { testType: string; labName: string | null } | null,
}));
vi.mock('../js/state.js', () => ({ state: { get importedData() { return { entries: controller.entries }; } } }));
vi.mock('../js/caught-error.js', () => ({ getErrorMessage: (value: unknown) => String(value) }));
vi.mock('../js/api.js', () => ({
  getAIProvider: () => 'fixture', setAIProvider: vi.fn(), setCustomApiModel: vi.fn(),
  setOllamaMainModel: vi.fn(), setOpenRouterModel: vi.fn(), setPpqModel: vi.fn(),
  setRoutstrModel: vi.fn(), setVeniceModel: vi.fn(),
}));
vi.mock('../js/adapters.js', () => ({ detectProduct: () => null, getAdapterByTestType: () => null }));
vi.mock('../js/utils.js', () => ({ hashString: () => 'fixture-hash', isDebugMode: () => false }));
vi.mock('../js/modal-lifecycle.js', () => ({ closeModalOverlay: vi.fn(), openModalOverlay: vi.fn() }));
vi.mock('../js/pdf-import-ai-utils.js', () => ({ IMPORT_CLASSIFICATION_JSON_SCHEMA: {} }));
vi.mock('../js/ai-feature-routing.js', () => ({
  getAssistantFeatureIdentity: () => ({ modelId: 'fixture-current' }),
  hasAssistantFeatureProvider: () => controller.provider,
  callAssistantFeatureAI: () => Promise.resolve({ text: JSON.stringify(controller.classification) }),
}));
beforeEach(() => {
  document.body.innerHTML = '';
  controller.entries = []; controller.provider = false; controller.classification = null;
});
afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });

type Kind = 'duplicate' | 'model' | 'unsupported' | 'image';
interface ParsedNode {
  type: 'element' | 'text' | 'comment';
  tag?: string;
  attributes?: Array<{ name: string; value: string }>;
  children?: ParsedNode[];
  value?: string | null;
}
interface OriginalButton {
  id: string | null;
  typeAttribute: string | null;
  nativeType: string;
  class: string | null;
  style: string | null;
  textContent: string | null;
  defaultValue: null;
  value: string;
}
interface OriginalSample {
  name: string;
  kind: Kind;
  input: Record<string, unknown>;
  boundary: string;
  rawHTML: string | null;
  snapshot: {
    html: string;
    exactParsedChildNodes: ParsedNode[];
    directElementTags: string[];
    buttons: OriginalButton[];
    links: Array<{ hrefAttribute: string | null; target: string | null; rel: string | null; textContent: string | null }>;
    nativeUnsafeElements: string[];
  } | null;
  failure: { name: string; message: string } | null;
  result: unknown;
  conversionCalls?: string[];
}
interface OriginalFixture {
  schemaVersion: number;
  status: string;
  provenance: {
    originalRuntimeFiles: Array<{ path: string; bytes: number; sha256: string }>;
    originalCanonicalFiles: Array<{ path: string; bytes: number; sha256: string }>;
    originalSourceManifestSha256: string;
    originalPublicManifestSha256: string;
    unchangedBeforeAfter: boolean;
  };
  samples: OriginalSample[];
}
const fixtureBytes = readFileSync('tests/fixtures/pdf-preflight/original-presentation.json');
const fixture = JSON.parse(fixtureBytes.toString()) as OriginalFixture;
const frozenFixtureSha256 = '249fc34932d8cfc5b6f62379c9597352e76a18106222313011bbd1d2f6561a84';

interface CommentReceipt { path: number[]; value: string | null }
// Independently reviewed compiler anchors at exact DOM positions. Every other
// comment, node, attribute and literal whitespace remains an exact contract.
const compiledCommentAuthority: Record<Kind, readonly CommentReceipt[]> = {
  "duplicate": [
    {
      "path": [
        0
      ],
      "value": "["
    },
    {
      "path": [
        1
      ],
      "value": "[0"
    },
    {
      "path": [
        3
      ],
      "value": "]"
    },
    {
      "path": [
        4
      ],
      "value": "]"
    }
  ],
  "model": [
    {
      "path": [
        0
      ],
      "value": "["
    },
    {
      "path": [
        1
      ],
      "value": "[1"
    },
    {
      "path": [
        3
      ],
      "value": "]"
    },
    {
      "path": [
        4
      ],
      "value": "]"
    }
  ],
  "unsupported": [
    {
      "path": [
        0
      ],
      "value": "["
    },
    {
      "path": [
        1
      ],
      "value": "[-1"
    },
    {
      "path": [
        3
      ],
      "value": "]"
    },
    {
      "path": [
        4
      ],
      "value": "]"
    }
  ],
  "image": [
    {
      "path": [
        0
      ],
      "value": "["
    },
    {
      "path": [
        1
      ],
      "value": ""
    },
    {
      "path": [
        8
      ],
      "value": "]"
    }
  ]
};
function assertCompiledComments(root: Element, kind: Kind): void {
  const expected = compiledCommentAuthority[kind];
  if (expected === undefined) throw new Error(`Pending independently reviewed compiled ${kind} comment receipts`);
  const actual: CommentReceipt[] = [];
  const walk = (parent: Node, path: number[]): void => [...parent.childNodes].forEach((child, index) => {
    const childPath = [...path, index];
    if (child.nodeType === Node.COMMENT_NODE) actual.push({ path: childPath, value: child.nodeValue });
    walk(child, childPath);
  });
  walk(root, []); expect(actual).toEqual(expected);
}

// Exact twelve reviewed class receiver groups; never strip by prefix/pattern.
const approvedClasses = {
  modelActions: 'confirm-actions gb:pdf-preflight-inline:[flex-wrap:wrap] gb:pdf-preflight-inline:[gap:8px]',
  warningButton: 'confirm-btn gb:pdf-preflight-inline:[background:var(--yellow)] gb:pdf-preflight-inline:[color:#000]',
  unsupportedDialog: 'confirm-dialog gb:pdf-preflight-inline:[max-width:480px]',
  unsupportedMessage: 'confirm-message gb:pdf-preflight-inline:[margin-bottom:12px]',
  unsupportedCopy: 'gb:pdf-preflight-inline:[font-size:13px] gb:pdf-preflight-inline:[color:var(--text-secondary)] gb:pdf-preflight-inline:[margin-bottom:16px] gb:pdf-preflight-inline:[line-height:1.5]',
  unsupportedHelp: 'gb:pdf-preflight-inline:[margin:10px_0_0_0]',
  unsupportedLink: 'gb:pdf-preflight-inline:[color:var(--accent)]',
  imageHeading: 'gb:pdf-preflight-inline:[font-size:14px] gb:pdf-preflight-inline:[font-weight:600] gb:pdf-preflight-inline:[margin-bottom:8px]',
  imageCopy: 'gb:pdf-preflight-inline:[font-size:13px] gb:pdf-preflight-inline:[color:var(--text-muted)] gb:pdf-preflight-inline:[margin-bottom:16px]',
  imageActions: 'gb:pdf-preflight-inline:[display:flex] gb:pdf-preflight-inline:[gap:8px] gb:pdf-preflight-inline:[justify-content:flex-end]',
  imageNeutralButton: 'btn gb:pdf-preflight-inline:[padding:7px_16px] gb:pdf-preflight-inline:[border-radius:6px] gb:pdf-preflight-inline:[border:1px_solid_var(--border)] gb:pdf-preflight-inline:[background:var(--bg-card)] gb:pdf-preflight-inline:[color:var(--text-primary)] gb:pdf-preflight-inline:[cursor:pointer]',
  imagePrimaryButton: 'btn gb:pdf-preflight-inline:[padding:7px_16px] gb:pdf-preflight-inline:[border-radius:6px] gb:pdf-preflight-inline:[border:none] gb:pdf-preflight-inline:[background:var(--accent-gradient)] gb:pdf-preflight-inline:[color:white] gb:pdf-preflight-inline:[cursor:pointer] gb:pdf-preflight-inline:[font-weight:500]',
} as const;
interface Owner {
  key: keyof typeof approvedClasses;
  selector: string;
  originalClass: string | null;
  originalStyle: string;
  count: number;
}
const owners: Record<Kind, Owner[]> = {
  duplicate: [],
  model: [
    { key: 'modelActions', selector: '.confirm-actions', originalClass: 'confirm-actions', originalStyle: 'flex-wrap:wrap;gap:8px', count: 1 },
    { key: 'warningButton', selector: '#confirm-continue', originalClass: 'confirm-btn', originalStyle: 'background:var(--yellow);color:#000', count: 1 },
  ],
  unsupported: [
    { key: 'unsupportedDialog', selector: ':scope > div', originalClass: 'confirm-dialog', originalStyle: 'max-width:480px', count: 1 },
    { key: 'unsupportedMessage', selector: '.confirm-message', originalClass: 'confirm-message', originalStyle: 'margin-bottom:12px', count: 1 },
    { key: 'unsupportedCopy', selector: ':scope > div > div:not(.confirm-actions)', originalClass: null, originalStyle: 'font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5', count: 1 },
    { key: 'unsupportedHelp', selector: ':scope > div > div:not(.confirm-actions) > p', originalClass: null, originalStyle: 'margin:10px 0 0 0', count: 1 },
    { key: 'unsupportedLink', selector: 'a', originalClass: null, originalStyle: 'color:var(--accent)', count: 1 },
    { key: 'warningButton', selector: '#confirm-ok', originalClass: 'confirm-btn', originalStyle: 'background:var(--yellow);color:#000', count: 1 },
  ],
  image: [
    { key: 'imageHeading', selector: ':scope > div:nth-of-type(1)', originalClass: null, originalStyle: 'font-size:14px;font-weight:600;margin-bottom:8px', count: 1 },
    { key: 'imageCopy', selector: ':scope > div:nth-of-type(2)', originalClass: null, originalStyle: 'font-size:13px;color:var(--text-muted);margin-bottom:16px', count: 1 },
    { key: 'imageActions', selector: ':scope > div:nth-of-type(3)', originalClass: null, originalStyle: 'display:flex;gap:8px;justify-content:flex-end', count: 1 },
    { key: 'imageNeutralButton', selector: ':scope > div:nth-of-type(3) > button:nth-of-type(-n+2)', originalClass: 'btn', originalStyle: 'padding:7px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);cursor:pointer', count: 2 },
    { key: 'imagePrimaryButton', selector: ':scope > div:nth-of-type(3) > button:nth-of-type(3)', originalClass: 'btn', originalStyle: 'padding:7px 16px;border-radius:6px;border:none;background:var(--accent-gradient);color:white;cursor:pointer;font-weight:500', count: 1 },
  ],
};
function host(html: string): HTMLDivElement {
  const root = document.createElement('div'); root.innerHTML = html; return root;
}
function originalHost(sample: OriginalSample): HTMLDivElement {
  if (sample.rawHTML === null) throw new Error('No original markup for ' + sample.name);
  return host(sample.rawHTML);
}
function removePinnedComments(root: Element): void {
  const iterator = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT), comments: Node[] = [];
  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) comments.push(node);
  for (const node of comments) node.parentNode!.removeChild(node);
}
function parsedNode(node: Node): ParsedNode {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    return { type: 'element', tag: element.tagName.toLowerCase(),
      attributes: [...element.attributes].map(attribute => ({ name: attribute.name, value: attribute.value })),
      children: [...element.childNodes].map(parsedNode) };
  }
  if (node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.COMMENT_NODE) throw new Error('Unexpected parsed node type');
  return { type: node.nodeType === Node.TEXT_NODE ? 'text' : 'comment', value: node.nodeValue };
}
function parsedChildren(root: Element): ParsedNode[] { return [...root.childNodes].map(parsedNode); }
function restoreExactOwnedAttributes(actual: Element, original: Element, kind: Kind): void {
  for (const owner of owners[kind]) {
    const targets = [...actual.querySelectorAll(owner.selector)], sources = [...original.querySelectorAll(owner.selector)];
    expect(targets.length, owner.key).toBe(owner.count); expect(sources.length, owner.key).toBe(owner.count);
    for (let index = 0; index < owner.count; index++) {
      const target = targets[index]!, source = sources[index]!;
      expect(source.getAttribute('class'), owner.key).toBe(owner.originalClass);
      expect(source.getAttribute('style'), owner.key).toBe(owner.originalStyle);
      expect(target.getAttribute('class'), owner.key).toBe(approvedClasses[owner.key]);
      expect(target.hasAttribute('style'), owner.key).toBe(false);
      if (owner.originalClass === null) target.removeAttribute('class'); else target.setAttribute('class', owner.originalClass);
      target.setAttribute('style', owner.originalStyle);
    }
  }
}
function assertParity(html: string, sample: OriginalSample): void {
  const expected = sample.snapshot;
  if (!expected) throw new Error('No original parsed snapshot for ' + sample.name);
  const actual = host(html), original = originalHost(sample);
  expect(parsedChildren(original)).toEqual(expected.exactParsedChildNodes);
  assertCompiledComments(actual, sample.kind); removePinnedComments(actual);
  restoreExactOwnedAttributes(actual, original, sample.kind);
  // No trimming, text coalescing, selector rewriting, prefix stripping or attribute dropping.
  expect(parsedChildren(actual)).toEqual(expected.exactParsedChildNodes);
  expect([...actual.children].map(element => element.tagName.toLowerCase())).toEqual(expected.directElementTags);
  expect([...actual.querySelectorAll('button')].map(button => ({
    id: button.getAttribute('id'), typeAttribute: button.getAttribute('type'), nativeType: button.type,
    class: button.getAttribute('class'), style: button.getAttribute('style'), textContent: button.textContent,
    defaultValue: null, value: button.value,
  }))).toEqual(expected.buttons);
  expect([...actual.querySelectorAll('a')].map(link => ({
    hrefAttribute: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel'), textContent: link.textContent,
  }))).toEqual(expected.links);
  expect([...actual.querySelectorAll('script,img,[onerror],[onclick],[onfocus]')].map(element => element.outerHTML)).toEqual(expected.nativeUnsafeElements);
  expect(expected.nativeUnsafeElements).toEqual([]);
}
function sample(name: string): OriginalSample {
  const found = fixture.samples.find(item => item.name === name);
  if (!found) throw new Error('Missing independently frozen case ' + name);
  return found;
}
function preparedInput(item: OriginalSample): Record<string, unknown> {
  const result = { ...item.input };
  for (const key of (item.input.undefinedKeys ?? []) as string[]) result[key] = undefined;
  return result;
}
function preparedView(item: OriginalSample): PdfPreflightView {
  const input = preparedInput(item);
  if (item.kind === 'duplicate') return projectPdfDuplicateView(originalHost(item).querySelector('strong')!.textContent!);
  if (item.kind === 'model') return projectPdfModelMismatchView(input as unknown as PdfModelMismatchInput);
  if (item.kind === 'unsupported') {
    return projectPdfUnsupportedLabView(item.name === 'unsupported-comprehensive-controller-label'
      ? originalHost(item).querySelector('.confirm-message > strong')!.textContent : input.testType);
  }
  throw new Error('Image has a separate no-view renderer');
}

it('pins independent original provenance and all twelve exact replacement groups', () => {
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(frozenFixtureSha256);
  expect(fixture.schemaVersion).toBe(1); expect(fixture.samples).toHaveLength(25);
  expect(fixture.status).toBe('original-serialization-fixtures-only-browser-capture-unverified');
  expect(fixture.provenance.unchangedBeforeAfter).toBe(true);
  expect(fixture.provenance.originalSourceManifestSha256).toBe('f6d742de3f4d700c781ed42d743f145e2a47d1bc6d605d34216e7eb4bbc9314c');
  expect(fixture.provenance.originalPublicManifestSha256).toBe('f3bd4b9443bae201a95a768d5964cf977af779aa6cf9d058c380159776dae0ea');
  expect(fixture.provenance.originalRuntimeFiles.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual([
    { path: 'js/pdf-import-preflight.js', sha256: 'b0afe013ec641089db0490a23a0bd0587e39c54107a79e4e82c9af8914436703' },
    { path: 'js/pdf-import-file-handlers.js', sha256: '55c9351e1ae85bf6deb8f955a6b594b5cec116fc4328648e64ff3c13c9370375' },
    { path: 'js/utils.js', sha256: 'da83d9cc78f705de4afb2b0ea1774889b251a9033d426fb5fed7dad6495c7dc1' },
  ]);
  expect(pdfPreflightClasses).toEqual(approvedClasses);
  expect(new Set(Object.values(owners).flat().map(owner => owner.key)).size).toBe(12);
});

for (const item of fixture.samples.filter(item => item.rawHTML !== null && item.name !== 'model-coercion-order')) {
  it(`preserves original exact parsed presentation and native button defaults: ${item.name}`, () => {
    const inputBefore = structuredClone(item.input);
    assertParity(item.kind === 'image' ? renderPdfImageMode() : renderPdfPreflight(preparedView(item)), item);
    expect(item.input).toEqual(inputBefore);
  });
}

it('preserves the original model getter and previous/current/short conversion order', () => {
  const original = sample('model-coercion-order'), calls: string[] = [];
  const previous = {
    toString() { calls.push('prev.toString'); return 'provider/previous literal'; },
    split(delimiter: string) { calls.push('prev.split:' + delimiter); return ['provider', { toString() { calls.push('short.toString'); return '<short>\u00a0'; } }]; },
  };
  // Deliberately reproduce the original private JavaScript prepared-object boundary;
  // the actual typed public controller only supplies strings for previousModel.
  const input: PdfModelMismatchInput = {
    get prevModel() { calls.push('prev.get'); return previous as unknown as string; },
    get currentModel() { calls.push('current.get'); return { toString() { calls.push('current.toString'); return '<current>\u00a0'; } }; },
  };
  const view = projectPdfModelMismatchView(input);
  expect(calls).toEqual(original.conversionCalls);
  assertParity(renderPdfPreflight(view), original);
  expect(calls).toEqual(original.conversionCalls);
});

it.each(['model-null-prev-rejects', 'model-numeric-prev-rejects'])('retains original rejected private facts before markup: %s', name => {
  const original = sample(name);
  expect(original.failure!.name).toBe('TypeError'); expect(original.rawHTML).toBeNull();
  expect(() => projectPdfModelMismatchView(preparedInput(original) as unknown as PdfModelMismatchInput)).toThrow(TypeError);
});

it('preserves default, undefined and null duplicate labels and escapes a literal custom label', () => {
  const original = sample('duplicate-valid-date');
  const dateLabel = originalHost(original).querySelector('strong')!.textContent!;
  assertParity(renderPdfPreflight(projectPdfDuplicateView(dateLabel)), original);
  assertParity(renderPdfPreflight(projectPdfDuplicateView(dateLabel, undefined)), original);
  const nullLabelView = projectPdfDuplicateView(dateLabel, null);
  expect(nullLabelView.confirmLabel).toBe('');
  const nullLabel = host(renderPdfPreflight(nullLabelView));
  assertCompiledComments(nullLabel, 'duplicate');
  expect(nullLabel.querySelector('#confirm-ok')!.textContent).toBe('');
  expect(nullLabel.querySelector('strong')!.textContent).toBe(dateLabel);
  const literal = '\u00a0<svg onload="alert(1)"> & \'quote\'\nModel\u00a0';
  const root = host(renderPdfPreflight(projectPdfDuplicateView(dateLabel, literal)));
  assertCompiledComments(root, 'duplicate');
  expect(root.querySelector('#confirm-ok')!.textContent).toBe(literal);
  expect(root.querySelector('svg,[onload]')).toBeNull();
});

for (const original of fixture.samples.filter(item => item.kind === 'duplicate')) {
  it(`keeps actual public duplicate Date formatting connected to the original prepared label: ${original.name}`, async () => {
    controller.entries = [{ importHash: 'fixture-hash', date: original.input.dupDate }];
    const pending = runPreflightChecks('synthetic text', 'synthetic.pdf');
    const overlay = document.getElementById('confirm-dialog-overlay')!;
    assertParity(overlay.innerHTML, original);
    overlay.querySelector<HTMLButtonElement>('#confirm-cancel')!.click(); // explicit jsdom callback seam
    expect(await pending).toBe(false);
  });
}

it('keeps actual public comprehensive lab-name assembly and unsupported link contract', async () => {
  const original = sample('unsupported-comprehensive-controller-label');
  controller.provider = true;
  controller.classification = { testType: original.input.testType as string, labName: original.input.labName as string };
  const pending = runPreflightChecks('synthetic text', 'synthetic.pdf');
  await vi.waitFor(() => expect(document.getElementById('confirm-ok')).not.toBeNull());
  const overlay = document.getElementById('confirm-dialog-overlay')!;
  assertParity(overlay.innerHTML, original);
  overlay.querySelector<HTMLButtonElement>('#confirm-cancel')!.click(); // explicit jsdom callback seam
  expect(await pending).toBe(false);
});

it('rejects unreviewed class, default-type, attribute, whitespace and inline-style changes', () => {
  const original = sample('model-namespace');
  const html = renderPdfPreflight(preparedView(original)); assertParity(html, original);
  const mutations: Array<(root: HTMLDivElement) => void> = [
    root => root.querySelector('#confirm-continue')!.classList.add('unreviewed-token'),
    root => root.querySelector('#confirm-continue')!.setAttribute('type', 'button'),
    root => root.querySelector('[role]')!.setAttribute('aria-modal', 'false'),
    root => { root.querySelector('#confirm-cancel')!.textContent = 'Cancel\u00a0'; },
    root => root.querySelector('#confirm-continue')!.setAttribute('style', 'color:red'),
    root => root.querySelector('.confirm-message')!.appendChild(document.createTextNode(' ')),
    root => root.appendChild(document.createComment('unreviewed')),
  ];
  for (const mutate of mutations) {
    const changed = host(html); mutate(changed);
    expect(() => assertParity(changed.innerHTML, original)).toThrow();
  }
});

it('uses authored components with no raw HTML slots and owns the repaired image-warning host', () => {
  for (const name of ['PdfPreflightPresentation', 'PdfImageModePresentation']) {
    expect(readFileSync(`js/components/${name}.svelte`, 'utf8')).not.toContain('{@html');
  }
  const source = readFileSync('js/pdf-import-file-handlers.ts', 'utf8');
  expect(source).toContain("let overlay = document.getElementById('confirm-dialog-overlay');");
  expect(source).toContain("if (overlay?.classList.contains('show')) { resolve('cancel'); return; }");
  expect(source).toContain("let dialog = overlay.querySelector<HTMLElement>('#confirm-dialog');");
  expect(source).toContain('overlay.replaceChildren(dialog);');
  expect(source).toContain("dialog.setAttribute('role', 'alertdialog');");
  expect(source).toContain("dialog.setAttribute('aria-modal', 'true');");
  expect(source).toContain("dialog.setAttribute('aria-label', 'Scanned PDF');");
  expect(source).toContain("overlay.dataset.escapeOwner = 'pdf-image-mode';");
  expect(source).toContain("document.addEventListener('keydown', onKey);");
  expect(source).not.toContain("document.addEventListener('keydown', onKey, { once: true });");
  expect(source).toContain("document.removeEventListener('keydown', onKey);");
  expect(source).toContain("if (previousEscapeOwner === undefined) delete overlay.dataset.escapeOwner;");
  expect(source).toContain('else overlay.dataset.escapeOwner = previousEscapeOwner;');
  expect(source).toContain('dialog.innerHTML = renderPdfImageMode();');
  expect(sample('image-missing-native-host').rawHTML).toBeNull();
  expect(sample('image-missing-native-host').result).toBe('cancel');
});
