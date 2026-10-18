import {renderHTML as diffHTML} from './components/PIIDiffViewer.svelte.html.js';
import {renderHTML as reviewHTML} from './components/PIIReviewModal.svelte.html.js';
import {renderHTML as fragmentHTML} from './components/PIIDiffFragment.svelte.html.js';

export type PIIChangeKind = 'equal' | 'removed' | 'added';
export interface PIIWordView { readonly kind: PIIChangeKind | 'blank'; readonly text: string; }
export interface PIILineView { readonly kind: PIIChangeKind; readonly words: readonly PIIWordView[]; }
export interface PIIPanelView { readonly lines: readonly PIILineView[]; }
export interface PIIDiffView { readonly left: PIIPanelView; readonly right: PIIPanelView; }
export interface PIIReviewView { readonly left: PIIPanelView; readonly initial: string; readonly streaming: boolean; }
export type PIIDiffFragmentView =
  | {readonly kind: 'word'; readonly word: PIIWordView}
  | {readonly kind: 'line'; readonly line: PIILineView}
  | {readonly kind: 'panel'; readonly panel: PIIPanelView; readonly header: boolean};

/** Native DOM boundary serializers. Authored children receive only text and typed diff data. */
export function renderPIIOriginalPanel(panel: PIIPanelView): string {
  return fragmentHTML({view: {kind: 'panel', panel, header: true}});
}
export function renderPIIPanel(panel: PIIPanelView): string {
  return fragmentHTML({view: {kind: 'panel', panel, header: false}});
}
export function renderPIIDiffViewer(left: PIIPanelView, right: PIIPanelView): string {
  return diffHTML({view: {left, right}});
}
export function renderPIIReviewModal(left: PIIPanelView, initial: string, streaming: boolean): string {
  return reviewHTML({view: {left, initial, streaming}});
}
