import {renderHTML as modalHTML} from './components/EMFInterpretationModal.svelte.html.js';
import {renderHTML as statusHTML} from './components/EMFInterpretationStatus.svelte.html.js';

export interface EMFInterpretationStatusView {
  readonly kind: 'placeholder' | 'error';
  readonly text: string;
}
/** The Markdown branch accepts only the existing renderMarkdown sanitizer output. */
export type EMFInterpretationBodyView =
  | {readonly kind: 'status'; readonly status: EMFInterpretationStatusView}
  | {readonly kind: 'markdown'; readonly sanitizedHTML: string};
export interface EMFInterpretationModalView {
  readonly title: string;
  readonly body: EMFInterpretationBodyView;
  readonly meta: string;
  readonly generate: 'Interpret' | 'Re-interpret';
  readonly showDiscuss: boolean;
}

export function projectEMFInterpretationModal(
  title: unknown,
  hasExisting: unknown,
  readBody: () => EMFInterpretationBodyView,
  readMeta: () => string,
): EMFInterpretationModalView {
  // Capture title, body/Markdown and metadata in the original eager order.
  const titleText = String(title ?? '');
  const body: EMFInterpretationBodyView = hasExisting ? readBody() : {
    kind: 'status', status: {kind: 'placeholder', text: 'Click Interpret to get an AI interpretation of this assessment.'},
  };
  const meta = hasExisting ? readMeta() : '';
  return {title: titleText, body, meta, generate: hasExisting ? 'Re-interpret' : 'Interpret', showDiscuss: !!hasExisting};
}

export function renderEMFInterpretationModal(
  title: unknown, hasExisting: unknown,
  readBody: () => EMFInterpretationBodyView, readMeta: () => string,
): string {
  return modalHTML({view: projectEMFInterpretationModal(title, hasExisting, readBody, readMeta)});
}
export function renderEMFInterpretationStatus(text: 'Click Interpret to get an AI interpretation of this assessment.' | 'Thinking…' | 'No response received.'): string {
  return statusHTML({view: {kind: 'placeholder', text}});
}
export function renderEMFInterpretationError(message: unknown): string {
  return statusHTML({view: {kind: 'error', text: 'Error: ' + String(message ?? '')}});
}
