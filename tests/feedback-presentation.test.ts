// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { renderFeedbackForm } from '../js/feedback-rendering.js';
import { feedbackClasses } from '../js/feedback-classes.js';
interface Adjacent { type: number; text: string | null }
interface Anchor { path: number[]; value: string | null; previous: Adjacent | null; next: Adjacent | null }
interface Receiver { elementIndex: number; nativeClass: string | null; utilities: string[] }
const bytes = readFileSync('tests/fixtures/feedback/original-contract.json');
const fixture = JSON.parse(bytes.toString()) as {
  schemaVersion: number; html: string; comments: Anchor[]; receivers: Receiver[];
  provenance: { originalBaselineSealSHA256: string; originalHTMLSHA256: string };
};
function original(): Node {
  const template = document.createElement('template');
  template.innerHTML = fixture.html;
  return template.content.cloneNode(true);
}
function host(fragment: Node): HTMLDivElement {
  const element = document.createElement('div'); element.replaceChildren(fragment); return element;
}
function tree(node: Node): unknown {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    return { tag: element.tagName, attrs: Object.fromEntries([...element.attributes].map(a => [a.name, a.value])),
      children: [...element.childNodes].map(tree) };
  }
  expect(node.nodeType).toBe(Node.TEXT_NODE);
  return { text: node.nodeValue }; // No trimming, separator joining or generic comment removal.
}
function reviewed(actual: HTMLDivElement): HTMLDivElement {
  const anchors: Anchor[] = [], nodes: Node[] = [];
  const adjacent = (node: Node | null): Adjacent | null => node ? { type: node.nodeType, text: node.nodeValue } : null;
  function visit(parent: Node, path: number[]): void {
    [...parent.childNodes].forEach((node, index) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        anchors.push({ path: [...path, index], value: node.nodeValue,
          previous: adjacent(node.previousSibling), next: adjacent(node.nextSibling) }); nodes.push(node);
      }
      visit(node, [...path, index]);
    });
  }
  visit(actual, []); expect(anchors).toEqual(fixture.comments);
  nodes.forEach(node => node.parentNode!.removeChild(node));
  const elements = [...actual.querySelectorAll('*')];
  expect(elements).toHaveLength(33); expect(fixture.receivers).toHaveLength(33);
  fixture.receivers.forEach((receiver, index) => {
    expect(receiver.elementIndex).toBe(index);
    const expected = receiver.utilities.length
      ? [receiver.nativeClass, ...receiver.utilities].filter(v => v !== null).join(' ') : receiver.nativeClass;
    expect(elements[index]!.getAttribute('class')).toBe(expected);
    if (receiver.nativeClass === null) elements[index]!.removeAttribute('class');
    else elements[index]!.setAttribute('class', receiver.nativeClass);
  }); return actual;
}
function controls(root: ParentNode): unknown {
  const select = root.querySelector<HTMLSelectElement>('#feedback-type')!;
  return { selectedIndex: select.selectedIndex, value: select.value,
    options: [...select.options].map(o => ({ value: o.value, text: o.text, selected: o.selected, defaultSelected: o.defaultSelected })),
    fields: ['feedback-title', 'feedback-desc', 'feedback-draft'].map(id => {
      const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
      return { id, value: input.value, defaultValue: input.defaultValue, valueAttribute: input.getAttribute('value'),
        required: input.required, readOnly: input.readOnly, maxLength: input.maxLength, disabled: input.disabled };
    }), buttons: [...root.querySelectorAll<HTMLButtonElement>('button')].map(b => ({ type: b.type, attr: b.getAttribute('type'), disabled: b.disabled })) };
}
it('pins the accepted original literal and terminal indentation', () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('31216729aa802bd4b83ce0334ec111197ada05b13b37f13c4c070107e24bc32a');
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.provenance.originalBaselineSealSHA256).toBe('3119033d375ade983b4e8bc050b3ff43f8f46db92cdacaf0eb3e392a6a075d5f');
  expect(createHash('sha256').update(fixture.html).digest('hex')).toBe('a86c670150725a0e66e15ea15b9eb60f8db1f06681cada243ec70a7aa5cf4b76');
  expect(fixture.html.endsWith('\n  ')).toBe(true);
});
it('preserves original text, attributes and only exact reviewed utility/anchor additions', () => {
  const actual = reviewed(host(renderFeedbackForm()));
  expect([...actual.childNodes].map(tree)).toEqual([...host(original()).childNodes].map(tree));
  expect(feedbackClasses('modal gb-form-modal feedback-redesign-modal', 'panel')).toBe(
    'modal gb-form-modal feedback-redesign-modal gb:feedback-panel:feedback-panel-block gb:feedback-phone-panel:feedback-phone-panel-block');
});
it('returns independent native template-content clones rather than strings or shared live nodes', () => {
  const create = vi.spyOn(document, 'createElement');
  let first: Node | undefined, second: Node | undefined;
  try {
    first = renderFeedbackForm(); second = renderFeedbackForm();
    expect(create.mock.calls.map(call => call[0])).toEqual(['template', 'template']);
  } finally { create.mockRestore(); }
  expect(first!.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE);
  expect(second!.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE);
  const a = host(first!), b = host(second!);
  expect(first!.childNodes).toHaveLength(0);
  expect(a.firstChild).not.toBe(b.firstChild);
  a.querySelector<HTMLInputElement>('#feedback-title')!.value = 'Local edit';
  a.querySelector('#feedback-title')!.setAttribute('data-test-local', 'first-only');
  expect(b.querySelector<HTMLInputElement>('#feedback-title')!.value).toBe('');
  expect(b.querySelector('#feedback-title')!.hasAttribute('data-test-local')).toBe(false);
});
it('keeps native defaults, validation, read-only preview and button types', () => {
  const actual = host(renderFeedbackForm()); expect(controls(actual)).toEqual(controls(host(original())));
  const title = actual.querySelector<HTMLInputElement>('#feedback-title')!;
  const desc = actual.querySelector<HTMLTextAreaElement>('#feedback-desc')!;
  const draft = actual.querySelector<HTMLTextAreaElement>('#feedback-draft')!;
  expect([title.required, title.maxLength, desc.required, desc.maxLength, draft.readOnly]).toEqual([true, 160, true, 10000, true]);
  expect([title.validity.valueMissing, desc.validity.valueMissing]).toEqual([true, true]);
  expect(actual.querySelector('#feedback-result')!.hasAttribute('hidden')).toBe(true);
  expect(actual.querySelector('details')!.hasAttribute('open')).toBe(false);
  expect(actual.querySelector('a')!.getAttribute('href')).toBeNull();
});
it('preserves reset defaults after native control writes', () => {
  const actual = host(renderFeedbackForm()), baseline = host(original());
  for (const root of [actual, baseline]) {
    root.querySelector<HTMLSelectElement>('#feedback-type')!.value = 'feature';
    root.querySelector<HTMLInputElement>('#feedback-title')!.value = 'Edited';
    root.querySelector<HTMLTextAreaElement>('#feedback-desc')!.value = 'Description';
    root.querySelector<HTMLTextAreaElement>('#feedback-draft')!.value = 'Prepared report';
    root.querySelector<HTMLFormElement>('form')!.reset();
  }
  expect(controls(actual)).toEqual(controls(baseline));
  expect(actual.querySelector<HTMLSelectElement>('#feedback-type')!.value).toBe('bug');
  expect([...actual.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].map(i => i.value)).toEqual(['', '', '']);
});
