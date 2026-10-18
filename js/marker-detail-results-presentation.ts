import {renderHTML as historyHTML} from './components/MarkerDetailHistory.svelte.html.js';
import {renderHTML as rangeHTML} from './components/MarkerDetailRange.svelte.html.js';
import {renderHTML as editorHTML} from './components/MarkerReferenceEditor.svelte.html.js';
import type {MarkerDetailHistoryView} from './marker-detail-view.js';
export type {MarkerDetailHistoryView} from './marker-detail-view.js';
import type {MarkerDetailRangeView} from './marker-detail-view.js';
export type {MarkerDetailRangeView} from './marker-detail-view.js';
import type {MarkerDetailEditorView} from './marker-detail-view.js';
export type {MarkerDetailEditorView} from './marker-detail-view.js';
export function renderMarkerDetailHistory(view:MarkerDetailHistoryView):string{return historyHTML({view});}
export function renderMarkerDetailRange(view:MarkerDetailRangeView):string{return rangeHTML({view});}
export function renderMarkerDetailEditor(view:MarkerDetailEditorView):string{return editorHTML({view});}
