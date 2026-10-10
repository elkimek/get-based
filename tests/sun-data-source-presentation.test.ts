// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

// Only configuration reads and host classification are supplied. The public
// controller, projector and authored renderer remain real; unused ports throw.
const ports = vi.hoisted(() => ({ trace: [] as string[], official: false, reads: 0,
  config: (() => ({})) as () => unknown,
  unused: () => { throw new Error('Unexpected non-Sun unit port'); },
}));
vi.mock('../js/settings-runtime.js', () => ({
  getSettingsMeteoConfig: () => { ports.trace.push('read' + (++ports.reads)); return ports.config(); },
  saveSettingsMeteoConfig: ports.unused,
}));
vi.mock('../js/url-safety.js', () => ({ isOfficialGetbasedHost: () => { ports.trace.push('host'); return ports.official; } }));
vi.mock('../js/api.js', () => ({ getOllamaPIIApiKey: ports.unused, getOllamaPIIUrl: ports.unused, getOllamaPIIModel: ports.unused }));
vi.mock('../js/pii.js', () => ({ isOllamaPIIEnabled: ports.unused, setOllamaPIIEnabled: ports.unused, checkOllamaPII: ports.unused }));
vi.mock('../js/cloud-ai-consent.js', () => ({ CLOUD_AI_CONSENT_VERSION: 'unused', AI_ROUTE_CONFIRMATION_VERSION: 'unused',
  getCloudAIConsentRecord: ports.unused, getAIRouteConfirmationRecord: ports.unused,
  hasAcknowledgedAITransparency: ports.unused, withdrawCloudAIConsent: ports.unused, withdrawAIRouteConfirmations: ports.unused,
}));
vi.mock('../js/utils.js', () => ({ isPIIReviewEnabled: ports.unused, isAnalyticsEnabled: ports.unused, showNotification: ports.unused }));
vi.mock('../js/settings-privacy-view.js', () => ({ getPrivacySettingsView: ports.unused }));
import { renderSunDataSourceSettings } from '../js/settings-privacy.js';
import { projectSunModeOption, projectSunCredential } from '../js/sun-data-source-presentation.js';

interface Delta { path: number[]; set: Record<string, string>; remove: string[] }
interface Contract { key: string; baseline: 'selfControlled' | 'official'; htmlSHA256: string; attributes: Delta[] }
interface Matrix extends Contract { index: number; official: boolean; mode: string; rounding: number | null; seed: [string, string]; trace: string[] }
interface Adversarial { key: string; label: string; trace: string[]; error: string | null; contract?: Contract }
interface Config { mode?: unknown; selfhostUrl?: unknown; selfhostBearer?: unknown; privacyRounding?: unknown }
interface InputFacts { value: string; defaultValue: string; valueAttribute: string | null; type: string; checked: boolean; defaultChecked: boolean; autocomplete: string }
interface Fixture {
  schemaVersion: number;
  provenance: { releaseSHA256: string; originalControllerSHA256: string; vmSHA256: string; nativeParserSHA256: string };
  baselines: { selfControlled: string; official: string };
  matrix: Matrix[]; adversarial: Adversarial[];
  browser: Contract & { config: Config; nativeInputs: { id: string; form: InputFacts }[] };
  nativeRadioParser: { checked: boolean[]; defaultChecked: boolean[]; checkedAttributes: string[]; jsdomChecked: boolean[] };
}
interface Recipe { path: number[]; keys: string[]; originalStyle: string; currentStyle: string | null }
interface Policy { catalog: Record<string, string[]>; recipes: Recipe[]; officialTail: Recipe }
interface Anchor { path: number[]; value: string | null; joinText?: true }
const fixtureBytes = readFileSync('tests/fixtures/sun-data-source/original-contract.json');
const fixture = JSON.parse(fixtureBytes.toString()) as Fixture;
const policyBytes = readFileSync('tests/fixtures/sun-data-source/receiver-policy.json');
const policy = JSON.parse(policyBytes.toString()) as Policy;
const comments = JSON.parse(readFileSync('tests/fixtures/sun-data-source/compiler-comments.json', 'utf8')) as {
  status: string; byKey: Record<string, Anchor[]> | null;
};
beforeEach(() => { ports.trace = []; ports.reads = 0; ports.official = false; ports.config = () => ({}); });
function host(html: string): HTMLDivElement { const h = document.createElement('div'); h.innerHTML = html; return h; }
function at(root: Node, path: number[]): Element {
  let node = root;
  for (const index of path) { const child = node.childNodes[index]; if (!child) throw new Error('Missing original receiver ' + path); node = child; }
  if (!(node instanceof Element)) throw new Error('Original receiver is not an element ' + path);
  return node;
}
function original(contract: Contract): HTMLDivElement {
  const h = host(fixture.baselines[contract.baseline]);
  const root = h.querySelector('#sun-data-source-section');
  if (!root) throw new Error('Missing original fixture root');
  for (const change of contract.attributes) {
    const element = at(root, change.path);
    for (const name of change.remove) element.removeAttribute(name);
    for (const [name, value] of Object.entries(change.set)) element.setAttribute(name, value);
  }
  // Parse the reconstructed original HTML, as the public renderer originally does.
  // Programmatic checked-attribute edits otherwise introduce a different live radio state.
  return host(h.innerHTML);
}
function reviewedAnchors(h: Node, key: string): void {
  const expected = comments.byKey?.[key];
  if (comments.status !== 'reviewed-actual-compiled-comments' || !expected) throw new Error('Pending actual Sun compiler-comment review: ' + key);
  const actual: Omit<Anchor, 'joinText'>[] = [], nodes: Comment[] = [];
  const walk = (parent: Node, path: number[]): void => [...parent.childNodes].forEach((node, index) => {
    const childPath = [...path, index];
    if (node.nodeType === Node.COMMENT_NODE) { actual.push({ path: childPath, value: node.nodeValue }); nodes.push(node as Comment); }
    walk(node, childPath);
  });
  walk(h, []);
  expect(actual).toEqual(expected.map(({ path, value }) => ({ path, value })));
  nodes.forEach((node, index) => {
    const previous = node.previousSibling, next = node.nextSibling;
    node.parentNode!.removeChild(node);
    if (expected[index]!.joinText) {
      expect(previous?.nodeType).toBe(Node.TEXT_NODE); expect(next?.nodeType).toBe(Node.TEXT_NODE);
      previous!.nodeValue = previous!.nodeValue! + next!.nodeValue!;
      next!.parentNode!.removeChild(next!);
    }
  });
}
interface Shape { tag?: string; attrs?: Record<string, string>; children?: Shape[]; text?: string | null }
function shape(node: Node): Shape {
  if (node instanceof Element) return { tag: node.tagName,
    attrs: Object.fromEntries([...node.attributes].map(a => [a.name, a.value])), children: [...node.childNodes].map(shape) };
  expect(node.nodeType).toBe(Node.TEXT_NODE);
  return { text: node.nodeValue }; // Exact indentation, separators, NBSP and credential text.
}
function form(input: HTMLInputElement): InputFacts {
  return { value: input.value, defaultValue: input.defaultValue, valueAttribute: input.getAttribute('value'),
    type: input.type, checked: input.checked, defaultChecked: input.defaultChecked, autocomplete: input.autocomplete };
}
function parity(contract: Contract, html = renderSunDataSourceSettings()): HTMLDivElement {
  const actual = host(html), expected = original(contract);
  reviewedAnchors(actual, contract.key);
  const a = actual.querySelector('#sun-data-source-section'), e = expected.querySelector('#sun-data-source-section');
  if (!a || !e) throw new Error('Missing Sun root');
  const recipes = contract.baseline === 'official'
    ? [...policy.recipes.filter(r => r.path[0] !== 9), policy.officialTail] : policy.recipes;
  for (const recipe of recipes) {
    const receiver = at(a, recipe.path), native = at(e, recipe.path);
    let keys = recipe.keys;
    if (keys[0] === 'option') keys = ['option', native.querySelector('input')!.hasAttribute('checked') ? 'optionChecked' : 'optionUnchecked'];
    const tokens = keys.flatMap(key => { const known = policy.catalog[key]; if (!known) throw new Error('Unknown reviewed receiver ' + key); return known; });
    const nativeClass = native.getAttribute('class');
    expect(receiver.getAttribute('class'), recipe.path.join('.')).toBe((nativeClass ? nativeClass + ' ' : '') + tokens.join(' '));
    expect(receiver.getAttribute('style')).toBe(keys[0] === 'selfhost'
      ? (native.getAttribute('style') === 'margin-top:10px;' ? null : 'display:none') : recipe.currentStyle);
    if (nativeClass === null) receiver.removeAttribute('class'); else receiver.setAttribute('class', nativeClass);
    receiver.setAttribute('style', native.getAttribute('style')!);
  }
  expect([...actual.childNodes].map(shape)).toEqual([...expected.childNodes].map(shape));
  const ai = [...actual.querySelectorAll<HTMLInputElement>('input')], ei = [...expected.querySelectorAll<HTMLInputElement>('input')];
  expect(ai.map(form)).toEqual(ei.map(form));
  expect(actual.querySelectorAll('script,img,iframe,[onclick],[onerror],[autofocus]')).toHaveLength(0);
  return actual;
}

it('pins accepted originals and the literal private receiver catalog', () => {
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe('78d49fb4d5968e1d2a85352681cb1e32237597b8c2544541cbed91604624f3a9');
  expect(createHash('sha256').update(policyBytes).digest('hex')).toBe('e852899274cab764fd329a8a2b14768d9efeb6f8f42a02e32eb00cee99755ac7');
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.provenance.releaseSHA256).toBe('8e8066cfd193036db9cd41ab53575dc84aeaddcfe66bcd551615787be73619af');
  expect(fixture.provenance.originalControllerSHA256).toBe('6395bec8fcc5fd5b8b3756e3875a2f27e9ba33a26f4d00c5c75a3bd296f52581');
  expect(fixture.matrix).toHaveLength(18); expect(fixture.adversarial).toHaveLength(11);
  expect(Object.keys(policy.catalog)).toHaveLength(18); expect(Object.values(policy.catalog).flat()).toHaveLength(42);
});
it.each(fixture.matrix)('preserves original VM state $index and native credential defaults', sample => {
  ports.official = sample.official;
  ports.config = () => ({ mode: sample.mode, selfhostUrl: sample.seed[0], selfhostBearer: sample.seed[1], privacyRounding: sample.rounding });
  parity(sample); expect(ports.trace).toEqual(sample.trace); expect(ports.reads).toBe(4);
});
it('preserves original real-browser credential properties and native form reset after editing', () => {
  ports.config = () => fixture.browser.config;
  const actual = parity(fixture.browser), formElement = document.createElement('form'); formElement.appendChild(actual);
  for (const facts of fixture.browser.nativeInputs) {
    const input = actual.querySelector<HTMLInputElement>('#' + facts.id)!;
    expect(form(input)).toEqual(Object.fromEntries(Object.entries(facts.form).filter(([key]) =>
      ['value','defaultValue','valueAttribute','type','checked','defaultChecked','autocomplete'].includes(key))));
    input.value = '  Edited synthetic draft  ';
    expect(input.value).toBe('  Edited synthetic draft  ');
    expect(input.defaultValue).toBe(facts.form.defaultValue); expect(input.getAttribute('value')).toBe(facts.form.valueAttribute);
  }
  formElement.reset();
  for (const facts of fixture.browser.nativeInputs) expect(form(actual.querySelector<HTMLInputElement>('#' + facts.id)!)).toEqual(
    Object.fromEntries(Object.entries(facts.form).filter(([key]) => ['value','defaultValue','valueAttribute','type','checked','defaultChecked','autocomplete'].includes(key))));
});
it.each(fixture.adversarial)('preserves $label getter order, short circuit and exact original result', sample => {
  const sentinel = new Error('Original Sun conversion boundary');
  if (sample.label === 'independent-mode-reads') {
    const first = {
      get mode() { ports.trace.push('first.mode'); return 'auto'; },
      get selfhostUrl() { ports.trace.push('url'); return { toString() { ports.trace.push('url.String'); return 'https://meteo.example.com/a'; } }; },
      get selfhostBearer() { ports.trace.push('bearer'); return { toString() { ports.trace.push('bearer.String'); return 'synthetic'; } }; },
      get privacyRounding() { ports.trace.push('rounding'); return { valueOf() { ports.trace.push('rounding.valueOf'); return 0.1; } }; },
    };
    ports.config = () => ports.reads === 1 ? first : { get mode() {
      ports.trace.push('option' + ports.reads + '.mode'); return ['auto','open-meteo','selfhost'][ports.reads - 2];
    } };
  } else if (sample.label.startsWith('first-config-throw-')) {
    const parts = sample.label.split('-'); ports.official = parts[3] === 'true'; const stop = parts[4];
    const field = (name: string, value: unknown): PropertyDescriptor => ({ get() {
      ports.trace.push('first.' + name); if (name === stop) throw sentinel; return value;
    }, enumerable: true });
    const first = Object.defineProperties({}, { mode: field('mode', 'auto'), selfhostUrl: field('url', 'https://meteo.example.com/'),
      selfhostBearer: field('bearer', 'synthetic'), privacyRounding: field('rounding', 0.1) });
    ports.config = () => ports.reads === 1 ? first : { mode: 'auto' };
  } else {
    const mode = sample.label.slice('falsy-fields-mode-'.length);
    ports.config = () => ({ mode, selfhostUrl: 0, selfhostBearer: false, privacyRounding: 0 });
  }
  let result: string | undefined, thrown: unknown;
  try { result = renderSunDataSourceSettings(); } catch (error) { thrown = error; }
  expect(thrown).toBe(sample.error === 'same sentinel identity' ? sentinel : undefined);
  // The original two falsy fixtures intentionally did not trace config reads.
  expect(ports.trace.filter(x => !sample.label.startsWith('falsy-fields-mode-') || !/^read\d$/.test(x))).toEqual(sample.trace);
  expect(ports.reads).toBe(4);
  if (sample.contract) {
    if (result === undefined) throw new Error('Expected successful original rendering');
    const rendered = parity(sample.contract, result);
    if (sample.label === 'independent-mode-reads') {
      const radios = [...rendered.querySelectorAll<HTMLInputElement>('input[name=meteo-mode]')];
      expect(radios.map(input => input.hasAttribute('checked'))).toEqual([true,true,true]);
      expect(radios.map(input => input.defaultChecked)).toEqual(fixture.nativeRadioParser.defaultChecked);
      // jsdom's checked state differs from actual Chromium; the sealed parser
      // receipt retains [false,false,true], and native replay owns that assertion.
      expect(fixture.nativeRadioParser.checked).toEqual([false,false,true]);
      expect(fixture.nativeRadioParser.checkedAttributes).toEqual(['','','']);
    }
  } else expect(result).toBeUndefined();
});
it('retains option template coercion order and each value exactly once', () => {
  const trace: string[] = [];
  const text = (key: string) => ({ toString() { trace.push(key); return key + '<>&"\'\u00a0'; } });
  const projected = projectSunModeOption(text('mode'), text('label'), text('description'), true);
  expect(trace).toEqual(['mode','label','description']);
  expect(projected).toEqual({ mode: 'mode<>&"\'\u00a0', label: 'label<>&"\'\u00a0', description: 'description<>&"\'\u00a0', checked: true });
});
it.each(['mode','label','description'])('preserves option %s coercion error identity and stops later conversions', stop => {
  const trace: string[] = [], sentinel = new Error('Original template conversion');
  const text = (key: string) => ({ toString() { trace.push(key); if (key === stop) throw sentinel; return key; } });
  let caught: unknown;
  try { projectSunModeOption(text('mode'), text('label'), text('description'), false); } catch (error) { caught = error; }
  expect(caught).toBe(sentinel); expect(trace).toEqual(['mode','label','description'].slice(0, ['mode','label','description'].indexOf(stop) + 1));
});
it('keeps credential one-String conversion distinct from option template Symbol failure', () => {
  const symbol = Symbol('synthetic'); expect(projectSunCredential(symbol)).toBe('Symbol(synthetic)');
  expect(() => projectSunModeOption(symbol, 'label', 'description', false)).toThrow(TypeError);
  for (const value of [null, undefined]) expect(projectSunCredential(value)).toBe('');
  expect([false, 0, ''].map(projectSunCredential)).toEqual(['false','0','']);
  const sentinel = new Error('Credential String conversion'), trace: string[] = [];
  let caught: unknown;
  try { projectSunCredential({ toString() { trace.push('String'); throw sentinel; } }); } catch (error) { caught = error; }
  expect(caught).toBe(sentinel); expect(trace).toEqual(['String']);
});

it.each(['url', 'bearer'])('stops the public controller at %s String conversion before later getters', stop => {
  const trace = ports.trace, sentinel = new Error('Original credential conversion');
  const credential = (name: string, value: string) => ({ toString() {
    trace.push(name + '.String'); if (name === stop) throw sentinel; return value;
  } });
  const first = {
    get mode() { trace.push('first.mode'); return 'auto'; },
    get selfhostUrl() { trace.push('url'); return credential('url', 'https://meteo.example.com/'); },
    get selfhostBearer() { trace.push('bearer'); return credential('bearer', 'synthetic'); },
    get privacyRounding() { trace.push('rounding'); return 0.1; },
  };
  ports.config = () => ports.reads === 1 ? first : { mode: 'auto' };
  let caught: unknown;
  try { renderSunDataSourceSettings(); } catch (error) { caught = error; }
  expect(caught).toBe(sentinel);
  expect(trace).toEqual(['read1','host','read2','read3','read4','first.mode','url','url.String',
    ...(stop === 'bearer' ? ['bearer','bearer.String'] : [])]);
});
