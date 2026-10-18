import {renderHTML} from './components/MarkerDetailModal.svelte.html.js';
import type {MarkerDetailModalView} from './marker-detail-view.js';
export function renderMarkerDetailModal(view:MarkerDetailModalView):string{return renderHTML({view});}
