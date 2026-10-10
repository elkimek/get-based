// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { projectUtilsConfirm, projectUtilsPrompt, type UtilsConfirmFacts, type UtilsPromptFacts } from '../js/utils-dialog-presentation.js';
import { renderUtilsConfirm, renderUtilsPrompt } from '../js/utils-dialog-rendering.js';

interface Sample {
  key: string;
  kind: 'confirm' | 'prompt';
  facts: Record<string, unknown>;
  html: string;
  input: { value: string; defaultValue: string; valueAttribute: string; type: string } | null;
}
interface Fixture {
  schemaVersion: number;
  provenance: { originalReleaseSHA256: string; originalUtilsSHA256: string };
  coercionOrder: { confirm: string[]; prompt: string[] };
  samples: Sample[];
}
interface Comment { path: number[]; value: string | null }
const fixtureBytes = readFileSync('tests/fixtures/utils-dialogs/original-contract.json');
const fixture = JSON.parse(fixtureBytes.toString()) as Fixture;
const comments = JSON.parse(readFileSync('tests/fixtures/utils-dialogs/compiler-comments.json', 'utf8')) as {
  status: string; byKey: Record<string, Comment[]> | null;
};
// Literal independently reviewed receiver additions; no wildcard/prefix removal.
const receivers = [
  ['.confirm-dialog', ['gb:utils-dialog-panel:utils-dialog-panel', 'gb:utils-dialog-panel:utils-dialog-phone:[padding:22px_18px]']],
  ['.confirm-message', ['gb:utils-dialog-message:utils-dialog-message']],
  ['.confirm-input', ['gb:utils-dialog-input:utils-dialog-input', 'gb:utils-dialog-input-focus:utils-dialog-input-focus']],
  ['.confirm-actions', ['gb:utils-dialog-actions:utils-dialog-actions']],
  ['.confirm-btn-cancel', ['gb:utils-dialog-cancel:utils-dialog-cancel', 'gb:utils-dialog-cancel-hover:utils-dialog-cancel-hover']],
  ['.confirm-btn-danger', ['gb:utils-dialog-danger:utils-dialog-danger', 'gb:utils-dialog-danger-hover:utils-dialog-danger-hover']],
  ['.confirm-btn-primary', ['gb:utils-dialog-primary:utils-dialog-primary', 'gb:utils-dialog-primary-hover:utils-dialog-primary-hover']],
] as const;
function host(html: string): HTMLDivElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}
function removeReviewedComments(root: Node, key: string): void {
  const expected = comments.byKey?.[key];
  if (comments.status !== 'reviewed-actual-compiled-comments' || !expected) {
    throw new Error('Pending independent actual compiler-comment review: ' + key);
  }
  const actual: Comment[] = [], nodes: Node[] = [];
  const visit = (parent: Node, path: number[]): void => [...parent.childNodes].forEach((node, index) => {
    const childPath = [...path, index];
    if (node.nodeType === Node.COMMENT_NODE) { actual.push({ path: childPath, value: node.nodeValue }); nodes.push(node); }
    visit(node, childPath);
  });
  visit(root, []);
  expect(actual).toEqual(expected); // Missing, added, moved and changed anchors all fail.
  for (const node of nodes) node.parentNode!.removeChild(node);
}
interface Shape { tag?: string; attrs?: Record<string, string>; children?: Shape[]; text?: string | null }
function shape(node: Node): Shape {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    return { tag: element.tagName, attrs: Object.fromEntries([...element.attributes].map(a => [a.name, a.value])),
      children: [...element.childNodes].map(shape) };
  }
  expect(node.nodeType).toBe(Node.TEXT_NODE);
  return { text: node.nodeValue }; // Preserve indentation, NBSP and every meaningful separator.
}
function parity(sample: Sample): HTMLDivElement {
  const html = sample.kind === 'confirm'
    ? renderUtilsConfirm(sample.facts as unknown as UtilsConfirmFacts)
    : renderUtilsPrompt(sample.facts as unknown as UtilsPromptFacts);
  const actual = host(html), original = host(sample.html);
  removeReviewedComments(actual, sample.key);
  for (const [selector, tokens] of receivers) {
    const targets = [...actual.querySelectorAll(selector)], sources = [...original.querySelectorAll(selector)];
    expect(targets.length, selector).toBe(sources.length);
    for (let index = 0; index < sources.length; index++) {
      const native = sources[index]!.getAttribute('class');
      expect(native).not.toBeNull();
      expect(targets[index]!.getAttribute('class'), selector).toBe(native + ' ' + tokens.join(' '));
      targets[index]!.setAttribute('class', native!);
    }
  }
  expect([...actual.childNodes].map(shape)).toEqual([...original.childNodes].map(shape));
  expect(actual.querySelectorAll('script,img,iframe,[onclick],[onerror],[autofocus]')).toHaveLength(0);
  return actual;
}

it('uses independently accepted original HTML and the exact twelve reviewed receiver additions', () => {
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe('a38b89c56590625e37814f13f79643f6cf60fa8c9e2cb8d1dbd629ef201c255f');
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.provenance.originalReleaseSHA256).toBe('dace6fa61afdb8947eb5a1f0d3295e327d8ee7dc8d87e676642db390a1dbf4a4');
  expect(fixture.provenance.originalUtilsSHA256).toBe('da83d9cc78f705de4afb2b0ea1774889b251a9033d426fb5fed7dad6495c7dc1');
  expect(fixture.samples).toHaveLength(11);
  expect(receivers.flatMap(([, tokens]) => [...tokens])).toHaveLength(12);
});

it.each(fixture.samples)('preserves $key literal DOM, native form defaults and implicit button types', sample => {
  const actual = parity(sample);
  for (const button of actual.querySelectorAll('button')) {
    expect(button.getAttribute('type')).toBeNull();
    expect(button.type).toBe('submit');
    expect(button.disabled).toBe(false);
  }
  const input = actual.querySelector<HTMLInputElement>('#prompt-dialog-input');
  if (sample.input) {
    expect(input).not.toBeNull();
    expect({ value: input!.value, defaultValue: input!.defaultValue, valueAttribute: input!.getAttribute('value'), type: input!.type }).toEqual(sample.input);
  } else expect(input).toBeNull();
});

it('keeps dirty native input independent from the original default and native form reset', () => {
  const sample = fixture.samples.find(s => s.key === 'prompt-literal')!;
  const actual = parity(sample), form = document.createElement('form');
  form.appendChild(actual);
  const input = actual.querySelector<HTMLInputElement>('#prompt-dialog-input')!;
  input.value = '  Edited value  ';
  expect(input.value).toBe('  Edited value  ');
  expect(input.defaultValue).toBe(sample.input!.defaultValue);
  expect(input.getAttribute('value')).toBe(sample.input!.valueAttribute);
  for (const button of actual.querySelectorAll('button')) expect(button.form).toBe(form);
  form.reset();
  expect(input.value).toBe(sample.input!.value);
});

it('preserves nullish, false and zero primitive conversion without inventing controller defaults', () => {
  expect(projectUtilsConfirm({ ariaLabel: null, message: false, cancelLabel: 0, confirmLabel: undefined, tone: 'danger' }))
    .toEqual({ ariaLabel: '', message: 'false', cancelLabel: '0', confirmLabel: '', tone: 'danger' });
  expect(projectUtilsPrompt({ message: undefined, inputType: null, defaultValue: 0, placeholder: false, cancelLabel: null, okLabel: '' }))
    .toEqual({ message: '', inputType: '', defaultValue: '0', placeholder: 'false', inputAriaLabel: '', cancelLabel: '', okLabel: '' });
  // Public option getters/truthy fallbacks stay in utils; accepted native cases cover them.
});
function text(name: string, trace: string[]): object {
  return { toString() { trace.push(name); return name + '<>&"\'\u00a0'; } };
}
it('retains confirm coercion order from the original public controller receipt', () => {
  const trace: string[] = [];
  const view = projectUtilsConfirm({ ariaLabel: text('ariaLabel', trace), message: text('message', trace),
    cancelLabel: text('cancelLabel', trace), confirmLabel: text('confirmLabel', trace), tone: 'primary' });
  expect(trace).toEqual(fixture.coercionOrder.confirm);
  expect(view.message).toBe('message<>&"\'\u00a0');
  expect(view.ariaLabel).toBe('ariaLabel<>&"\'\u00a0');
});
it('converts prompt message twice in original order and retains different second conversion', () => {
  const trace: string[] = [];
  let calls = 0;
  const message = { toString() { trace.push('message'); return ++calls === 1 ? 'First <literal>' : 'Second "aria"'; } };
  const view = projectUtilsPrompt({ message, inputType: text('inputType', trace), defaultValue: text('defaultValue', trace),
    placeholder: text('placeholder', trace), cancelLabel: text('cancelLabel', trace), okLabel: text('okLabel', trace) });
  expect(trace).toEqual(fixture.coercionOrder.prompt);
  expect(calls).toBe(2);
  expect(view.message).toBe('First <literal>');
  expect(view.inputAriaLabel).toBe('Second "aria"');
});
const failures = [
  { kind: 'confirm', stop: 'ariaLabel', order: ['ariaLabel'] },
  { kind: 'confirm', stop: 'cancelLabel', order: ['ariaLabel', 'message', 'cancelLabel'] },
  { kind: 'prompt', stop: 'defaultValue', order: ['message', 'inputType', 'defaultValue'] },
  { kind: 'prompt', stop: 'second-message', order: ['message', 'inputType', 'defaultValue', 'placeholder', 'message'] },
] as const;
it.each(failures)('short-circuits $kind at $stop with the original error identity', failure => {
  const trace: string[] = [], sentinel = new Error('Original conversion boundary');
  let messages = 0;
  const value = (name: string) => ({ toString() {
    trace.push(name);
    if (name === 'message') messages++;
    if (name === failure.stop || (failure.stop === 'second-message' && name === 'message' && messages === 2)) throw sentinel;
    return name;
  } });
  let caught: unknown;
  try {
    if (failure.kind === 'confirm') projectUtilsConfirm({ ariaLabel: value('ariaLabel'), message: value('message'),
      cancelLabel: value('cancelLabel'), confirmLabel: value('confirmLabel'), tone: 'danger' });
    else projectUtilsPrompt({ message: value('message'), inputType: value('inputType'), defaultValue: value('defaultValue'),
      placeholder: value('placeholder'), cancelLabel: value('cancelLabel'), okLabel: value('okLabel') });
  } catch (error) { caught = error; }
  expect(caught).toBe(sentinel);
  expect(trace).toEqual(failure.order);
});
