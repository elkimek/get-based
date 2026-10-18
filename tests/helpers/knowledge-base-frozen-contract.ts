import { expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { reviewedUtilities } from './knowledge-base-current-capture.mjs';
import {sharedUtilsPromptReceivers} from './knowledge-base-utils-dialog-contract.js';

export interface StructuralSample {
  kind: 'panel' | 'status-toggle' | 'modal' | 'library-options' | 'library-create';
  name: string;
  input: unknown;
  html: string | null;
  controls: unknown[];
  trace: unknown[];
  scheduledFrames?: number;
  selected?: string | null;
}

export interface StatsSample {
  name: string;
  input: unknown;
  initialHTML: string;
  statsHTML: string;
  documentsHTML: string;
  libraryOptionsHTML: string;
  finalPanelHTML: string;
  trace: unknown[];
  workerRequests: unknown[];
  cachedCorpusCount: string | null;
  remainingFrames: number;
}

export interface StatusEditReceipt {
  enabled: boolean;
  beforeStatusHTML: string;
  statusHTML: string;
  fields: Array<{ id: string; value: string; sameNode: boolean }>;
  samePanel: boolean;
  sameChip: boolean;
  activeElement: string;
  caret: { start: number; end: number; direction: string };
  cfg: unknown;
  trace: unknown[];
  scheduledFrames: number;
}

export interface IngestSnapshot {
  label: string;
  now: number;
  pillHTML: string | null;
  statsHTML: string | null;
  docListHTML: string | null;
  pillBar: { html: string; value: number | null; max: number } | null;
  modalBar: { html: string; value: number | null; max: number } | null;
  modalWrap: { html: string; hidden: boolean; display: string } | null;
  notifications: Array<{ html: string; text: string; className: string }>;
  [key: string]: unknown;
}

export interface IngestReceipt {
  name: string;
  status: string;
  snapshots: IngestSnapshot[];
  requests: Array<{ now: number; message: { type: string; [key: string]: unknown } }>;
  replies: unknown[];
  trace: Array<{ type: string; url?: string; [key: string]: unknown }>;
  warnings: unknown[];
  errors: unknown[];
  observations: unknown[];
  wireDelta: string[];
  focusedBranchWire?: string[];
  loadingStopReceipt?: unknown;
}

interface ElementShape {
  tag: string;
  attributes: Record<string, string>;
  children: Array<ElementShape | string | { comment: string }>;
}

// These are Svelte's documented/static renderer anchor spellings. Unknown
// comments remain in the comparison; arbitrary comments cannot disappear.
const svelteAnchors = new Set(['', '[', ']', '[!', '[-1', '[0', '[1']);
const layoutContainers = new Set(['DIV', 'SECTION', 'LABEL']);

// These existing receivers contain only block/form children; indentation carries no text.
function formattingContainer(element: Element): boolean {
  if (layoutContainers.has(element.tagName)) return true;
  if (element.tagName === 'SELECT') return element.id === 'lens-library-select';
  if (element.tagName === 'DETAILS') return element.classList.contains('kb-setup-details')
    || element.classList.contains('kb-setup-audit');
  return element.tagName === 'SPAN' && (
    element.classList.contains('toggle-switch')
    || element.classList.contains('kb-model-copy')
    || element.parentElement?.classList.contains('kb-option-card') === true
  );
}

function shape(element: Element): ElementShape {
  const children: ElementShape['children'] = [];
  for (const child of element.childNodes) {
    if (child.nodeType === 8) {
      const comment = child.textContent ?? '';
      if (!svelteAnchors.has(comment)) children.push({ comment });
      continue;
    }
    if (child.nodeType === 1) {
      children.push(shape(child as Element));
      continue;
    }
    if (child.nodeType !== 3) throw new Error(`Unexpected DOM node type ${child.nodeType}`);
    const text = child.textContent ?? '';
    // Ignore only standalone ASCII indentation in structural containers
    // containing elements. Literal leaf text, inline text, NBSP and spaces
    // around actual words are never trimmed or collapsed.
    if (/^[\t\r\n ]*$/.test(text) && formattingContainer(element) && (element.children.length > 0
      || element.classList.contains('kb-footer-secondary'))) continue;
    const previous = children[children.length - 1];
    if (typeof previous === 'string') children[children.length - 1] = previous + text;
    else children.push(text);
  }
  return {
    tag: element.tagName,
    attributes: Object.fromEntries([...element.attributes]
      .filter(attribute => attribute.name !== 'class')
      .map(attribute => [attribute.name, attribute.value])
      .sort(([left], [right]) => left!.localeCompare(right!))),
    children,
  };
}

function nativeControl(element: Element): unknown {
  const tag = element.tagName;
  const base = {
    tag,
    id: element.id,
    type: element.getAttribute('type'),
    hidden: (element as HTMLElement).hidden,
  };
  if (tag === 'INPUT') {
    const control = element as HTMLInputElement;
    return { ...base, value: control.value, defaultValue: control.defaultValue,
      checked: control.checked, defaultChecked: control.defaultChecked, disabled: control.disabled,
      multiple: control.multiple, accept: control.accept, min: control.min, max: control.max };
  }
  if (tag === 'SELECT') {
    const control = element as HTMLSelectElement;
    return { ...base, value: control.value, selectedIndex: control.selectedIndex, disabled: control.disabled,
      options: [...control.options].map(option => ({ value: option.value, text: option.textContent,
        selected: option.selected, defaultSelected: option.defaultSelected })) };
  }
  if (tag === 'BUTTON') {
    const control = element as HTMLButtonElement;
    return { ...base, value: control.value, disabled: control.disabled };
  }
  if (tag === 'PROGRESS') {
    const control = element as HTMLProgressElement;
    return { ...base, value: control.hasAttribute('value') ? control.value : null, max: control.max };
  }
  if (tag === 'TEXTAREA') {
    const control = element as HTMLTextAreaElement;
    return { ...base, value: control.value, defaultValue: control.defaultValue, disabled: control.disabled };
  }
  return null;
}

export function equalOriginalDOM(currentHTML: string | null, originalHTML: string | null): void {
  if (originalHTML === null || currentHTML === null) {
    expect(currentHTML).toBe(originalHTML);
    return;
  }
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://fixture.test/' });
  try {
    const original = dom.window.document.createElement('div');
    const current = dom.window.document.createElement('div');
    original.innerHTML = originalHTML;
    current.innerHTML = currentHTML;
    expect(shape(current)).toEqual(shape(original));
    const sharedUtils = sharedUtilsPromptReceivers(current, original);
    const before = [...original.querySelectorAll('*')];
    const after = [...current.querySelectorAll('*')];
    expect(after).toHaveLength(before.length);
    before.forEach((element, index) => {
      const next = after[index]!;
      const priorClasses = [...element.classList];
      const nextClasses = [...next.classList];
      expect(nextClasses.slice(0, priorClasses.length), `Original class order at ${element.tagName}#${element.id}`).toEqual(priorClasses);
      for (const appended of nextClasses.slice(priorClasses.length)) {
        expect(sharedUtils.get(next) ?? reviewedUtilities, `Unreviewed appended class: ${appended}`).toContain(appended);
      }
      expect(nativeControl(next)).toEqual(nativeControl(element));
    });
    expect(current.querySelector('img,script,[onerror],[onclick]')).toBeNull();
  } finally {
    dom.window.close();
  }
}

export function equalIngestSnapshot(current: IngestSnapshot, original: IngestSnapshot): void {
  for (const field of ['pillHTML', 'statsHTML', 'docListHTML'] as const) {
    equalOriginalDOM(current[field], original[field]);
  }
  for (const field of ['pillBar', 'modalBar', 'modalWrap'] as const) {
    equalOriginalDOM(current[field]?.html ?? null, original[field]?.html ?? null);
  }
  expect(current.notifications).toHaveLength(original.notifications.length);
  current.notifications.forEach((notification, index) => {
    equalOriginalDOM(notification.html, original.notifications[index]!.html);
    expect(notification.text).toBe(original.notifications[index]!.text);
    expect(notification.className).toBe(original.notifications[index]!.className);
  });
  const scalar = (snapshot: IngestSnapshot) => ({
    ...Object.fromEntries(Object.entries(snapshot).filter(([field]) => ![
      'pillHTML', 'statsHTML', 'docListHTML', 'pillBar', 'modalBar', 'modalWrap', 'notifications',
    ].includes(field))),
    pillBar: snapshot.pillBar ? { value: snapshot.pillBar.value, max: snapshot.pillBar.max } : null,
    modalBar: snapshot.modalBar ? { value: snapshot.modalBar.value, max: snapshot.modalBar.max } : null,
    modalWrap: snapshot.modalWrap ? { hidden: snapshot.modalWrap.hidden, display: snapshot.modalWrap.display } : null,
    notifications: snapshot.notifications.map(({ text, className }) => ({ text, className })),
  });
  expect(scalar(current)).toEqual(scalar(original));
}
