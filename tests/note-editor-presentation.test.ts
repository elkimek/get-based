// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { projectNoteEditorView, type NoteEditorInput } from '../js/notes-presentation.js';
import { renderNoteEditor } from '../js/notes-rendering.js';
import { noteEditorClasses } from '../js/note-editor-classes.js';

interface NativeControls {
  date: { attribute: string | null; value: string; defaultValue: string };
  textarea: { textContent: string | null; value: string; defaultValue: string };
  childTags: string[];
  actionIndices: Array<{ action: string | null; index: string | null }>;
}
interface OriginalSample {
  name: string;
  boundary: string;
  input: NoteEditorInput;
  undefinedKeys: Array<keyof NoteEditorInput>;
  html: string;
  native: NativeControls;
}
interface OriginalFixture {
  schemaVersion: number;
  provenance: {
    originalFiles: Array<{ path: string; sha256: string }>;
    unchangedBeforeAfter: boolean;
  };
  samples: OriginalSample[];
  coercion: {
    publicCalls: string[];
    presentationCalls: string[];
    date: string;
    text: string;
    saveIndex: string;
    deleteIndex: string;
    html: string;
    native: NativeControls;
  };
}
const fixture = JSON.parse(readFileSync('tests/fixtures/note-editor/original-presentation.json', 'utf8')) as OriginalFixture;

// Only these independently reviewed utilities replace original inline declarations
// or extend the native textarea class. Additional tokens must fail this contract.
const approvedClasses = {
  dateContainer: 'gb:note-editor-inline:[margin:16px_0]',
  dateLabel: 'gb:note-editor-inline:[font-size:13px] gb:note-editor-inline:[color:var(--text-secondary)] gb:note-editor-inline:[display:block] gb:note-editor-inline:[margin-bottom:4px]',
  dateInput: 'gb:note-editor-inline:[padding:8px_12px] gb:note-editor-inline:[border-radius:6px] gb:note-editor-inline:[border:1px_solid_var(--border)] gb:note-editor-inline:[background:var(--bg-primary)] gb:note-editor-inline:[color:var(--text-primary)] gb:note-editor-inline:[font-size:13px] gb:note-editor-inline:[font-family:inherit]',
  textarea: 'note-editor gb:note-editor-field:[width:100%] gb:note-editor-field:[min-height:120px] gb:note-editor-field:[padding:12px] gb:note-editor-field:[border-radius:6px] gb:note-editor-field:[border:1px_solid_var(--border)] gb:note-editor-field:[background:var(--bg-primary)] gb:note-editor-field:[color:var(--text-primary)] gb:note-editor-field:[font-size:13px] gb:note-editor-field:[font-family:inherit] gb:note-editor-field:[resize:vertical] gb:note-editor-field:[line-height:1.5] gb:note-editor-field:[margin:16px_0] gb:note-editor-field:[&:focus]:[border-color:var(--accent)]',
  deleteButton: 'import-btn import-btn-secondary gb:note-editor-inline:[color:var(--red)] gb:note-editor-inline:[border-color:var(--red)] gb:note-editor-inline:[margin-left:auto]',
} as const;

function host(html: string): HTMLDivElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}
function controls(root: Element): NativeControls {
  const date = root.querySelector<HTMLInputElement>('#note-date-input')!;
  const textarea = root.querySelector<HTMLTextAreaElement>('#note-textarea')!;
  return {
    date: { attribute: date.getAttribute('value'), value: date.value, defaultValue: date.defaultValue },
    textarea: { textContent: textarea.textContent, value: textarea.value, defaultValue: textarea.defaultValue },
    childTags: [...root.children].map(child => child.tagName),
    actionIndices: [...root.querySelectorAll('[data-note-action]')].map(node => ({
      action: node.getAttribute('data-note-action'), index: node.getAttribute('data-note-index'),
    })),
  };
}
interface Structure {
  tag: string;
  attributes: Record<string, string>;
  text: string;
  children: Structure[];
}
function structure(element: Element): Structure {
  const directText = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
  // Comments are checked separately. All literal text and template indentation
  // remain exact, including textarea LF/CR/NBSP and empty conditional spacing.
  const text = directText.map(node => node.textContent ?? '').join('');
  return {
    tag: element.tagName,
    attributes: Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value])),
    text,
    children: [...element.children].map(structure),
  };
}
function restoreReviewedClassOwnership(actual: Element, original: Element): void {
  const owners: Array<[string, keyof typeof approvedClasses]> = [
    [':scope > div:not([class])', 'dateContainer'],
    ['label', 'dateLabel'],
    ['#note-date-input', 'dateInput'],
    ['#note-textarea', 'textarea'],
    ['[data-note-action="delete"]', 'deleteButton'],
  ];
  for (const [selector, key] of owners) {
    const source = original.querySelector(selector);
    if (!source) { expect(key).toBe('deleteButton'); continue; }
    const target = key === 'dateContainer' ? actual.children[3]! : actual.querySelector(selector)!;
    expect(target).not.toBeNull();
    expect(target.getAttribute('class'), key).toBe(approvedClasses[key]);
    expect(target.hasAttribute('style'), key).toBe(false);
    const sourceClass = source.getAttribute('class');
    if (sourceClass === null) target.removeAttribute('class'); else target.setAttribute('class', sourceClass);
    const sourceStyle = source.getAttribute('style');
    if (sourceStyle !== null) target.setAttribute('style', sourceStyle);
  }
}
function assertOriginalParity(html: string, expectedHTML: string, expectedControls: NativeControls): void {
  const actual = host(html), original = host(expectedHTML);
  expect(controls(original)).toEqual(expectedControls);
  expect(controls(actual)).toEqual(expectedControls);
  expect([...actual.children].map(child => child.tagName)).toEqual(['BUTTON', 'H3', 'DIV', 'DIV', 'TEXTAREA', 'DIV']);
  expect(actual.querySelectorAll('script,img,[onclick],[onfocus],[onerror],[autofocus]')).toHaveLength(0);
  const comments = document.createTreeWalker(actual, NodeFilter.SHOW_COMMENT);
  for (let node = comments.nextNode(); node; node = comments.nextNode()) {
    expect(node.textContent).toMatch(/^(?:\[|\]|\[0|\[-1)$/);
  }
  restoreReviewedClassOwnership(actual, original);
  expect(structure(actual)).toEqual(structure(original));
}

it('pins the independently executed native renderer and reviewed utility catalog', () => {
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.provenance.unchangedBeforeAfter).toBe(true);
  expect(fixture.provenance.originalFiles).toEqual([
    { path: 'js/notes.js', sha256: '825482e7305b7e1c80b58f8534d0d165268203b987b851eb338f58615a5e9941' },
    { path: 'js/utils.js', sha256: 'da83d9cc78f705de4afb2b0ea1774889b251a9033d426fb5fed7dad6495c7dc1' },
    { path: 'js/action-attributes.js', sha256: '885bb0e531c44a64b6c321eb43f98dfd0a43308ab2a40feb41752184685e4114' },
  ]);
  expect(noteEditorClasses).toEqual(approvedClasses);
});

it.each(fixture.samples)('preserves independently captured native serialization: $name', sample => {
  const input = { ...sample.input };
  for (const key of sample.undefinedKeys) Object.assign(input, { [key]: undefined });
  const before = { ...input };
  const view = projectNoteEditorView(input);
  assertOriginalParity(renderNoteEditor(view), sample.html, sample.native);
  expect(input).toEqual(before);
  expect(view.title).toBe(input.isEditing ? 'Edit Note' : 'Add Note');
  expect(view.isEditing).toBe(input.isEditing);
});

it('preserves the original date/text/save/delete conversion order and separate index conversions', () => {
  const calls: string[] = [];
  let indexCalls = 0;
  const input: NoteEditorInput = {
    isEditing: true,
    defaultDate: { toString() { calls.push('date'); return fixture.coercion.date; } },
    currentText: { toString() { calls.push('text'); return fixture.coercion.text; } },
    existingIdx: { toString() { calls.push('index'); return indexCalls++ === 0 ? fixture.coercion.saveIndex : fixture.coercion.deleteIndex; } },
  };
  const view = projectNoteEditorView(input);
  expect(calls).toEqual(fixture.coercion.presentationCalls);
  expect(fixture.coercion.publicCalls).toEqual(['index', 'date', 'text', 'index', 'index', 'index']);
  expect(view.saveIndex).toBe(fixture.coercion.saveIndex);
  expect(view.deleteIndex).toBe(fixture.coercion.deleteIndex);
  assertOriginalParity(renderNoteEditor(view), fixture.coercion.html, fixture.coercion.native);
  expect(calls).toEqual(fixture.coercion.presentationCalls);
});

it('omits only nullish indices and never consults an unused Add index', () => {
  for (const index of [null, undefined]) {
    const root = host(renderNoteEditor(projectNoteEditorView({ isEditing: true, defaultDate: null, currentText: null, existingIdx: index })));
    expect(root.querySelector('[data-note-action="save"]')!.hasAttribute('data-note-index')).toBe(false);
    expect(root.querySelector('[data-note-action="delete"]')!.hasAttribute('data-note-index')).toBe(false);
  }
  for (const index of [0, false, '']) {
    const root = host(renderNoteEditor(projectNoteEditorView({ isEditing: true, defaultDate: '', currentText: '', existingIdx: index })));
    expect(root.querySelector('[data-note-action="save"]')!.getAttribute('data-note-index')).toBe(String(index));
    expect(root.querySelector('[data-note-action="delete"]')!.getAttribute('data-note-index')).toBe(String(index));
  }
  const unused = { toString() { throw new Error('Add must not stringify index'); } };
  const root = host(renderNoteEditor(projectNoteEditorView({ isEditing: false, defaultDate: '', currentText: '', existingIdx: unused })));
  expect(root.querySelector('[data-note-action="save"]')!.hasAttribute('data-note-index')).toBe(false);
  expect(root.querySelector('[data-note-action="delete"]')).toBeNull();
});

it('retains native editing properties and form-reset defaults after user draft changes', () => {
  const sample = fixture.samples.find(sample => sample.name === 'edit-leading-crlf')!;
  const form = document.createElement('form');
  form.innerHTML = renderNoteEditor(projectNoteEditorView(sample.input));
  const date = form.querySelector<HTMLInputElement>('#note-date-input')!;
  const textarea = form.querySelector<HTMLTextAreaElement>('#note-textarea')!;
  date.value = '2026-11-01'; textarea.value = 'User draft\n\u00a0kept';
  expect(date.defaultValue).toBe(sample.native.date.defaultValue);
  expect(textarea.defaultValue).toBe(sample.native.textarea.defaultValue);
  form.reset();
  expect(date.value).toBe(sample.native.date.value);
  expect(textarea.value).toBe(sample.native.textarea.value);
});
