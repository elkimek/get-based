import { renderHTML } from './components/TweaksPresentation.svelte.html.js';
import type { TweaksPanelView } from './tweaks-presentation.js';

/** Synchronous markup only. Existing Settings delegates and modal lifecycle own the nodes. */
export function renderTweaksPanel(view: TweaksPanelView): string {
  return renderHTML({ view });
}
