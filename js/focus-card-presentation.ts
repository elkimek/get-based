import {applyInlineMarkdown} from './markdown.js';
import {renderHTML} from './components/FocusCard.svelte.html.js';

// Only the existing escaped inline-Markdown renderer can create this boundary.
declare const focusInlineMarkdown: unique symbol;
export type FocusInlineMarkdown = string & {readonly [focusInlineMarkdown]: true};
export type FocusCardBodyView =
  | {readonly kind: 'shimmer'}
  | {readonly kind: 'markdown'; readonly markdown: FocusInlineMarkdown}
  | {readonly kind: 'message'; readonly text: string}
  | {readonly kind: 'stream'; readonly text: string};
export interface FocusCardView {readonly body: FocusCardBodyView}

export function projectFocusCardMarkdown(text: unknown): FocusCardBodyView {
  return {kind: 'markdown', markdown: applyInlineMarkdown(text) as FocusInlineMarkdown};
}
export function renderFocusCardView(view: FocusCardView): string {
  return renderHTML({view});
}
