import {renderHTML as chromeHTML} from './components/MarkerDetailChrome.svelte.html.js';
import {renderHTML as bioHTML} from './components/MarkerDetailBioAge.svelte.html.js';
import {renderHTML as notesHTML} from './components/MarkerDetailNotes.svelte.html.js';
import type {MarkerDetailChromeView} from './marker-detail-view.js';
export type {MarkerDetailChromeView} from './marker-detail-view.js';
import type {MarkerDetailBioAgeView} from './marker-detail-view.js';
export type {MarkerDetailBioAgeView} from './marker-detail-view.js';
import type {MarkerDetailNotesView} from './marker-detail-view.js';
export type {MarkerDetailNotesView} from './marker-detail-view.js';
export function renderMarkerDetailChrome(view:MarkerDetailChromeView):string{return chromeHTML({view});}
export function renderMarkerDetailBioAge(view:MarkerDetailBioAgeView):string{return bioHTML({view});}
export function renderMarkerDetailNotes(view:MarkerDetailNotesView):string{return notesHTML({view});}
