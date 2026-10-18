import { BODY_REGIONS, bindBodySilhouette, projectBodySilhouette } from './sun-body-silhouette.js';

export type { PastSessionLogOptions } from './light-session-presentation.js';
import { projectPastSessionForm, type PastSessionLogOptions } from './light-session-presentation.js';
import { renderHTML } from './components/LightSessionPresentation.svelte.html.js';

export function renderPastSessionLogModal(options: PastSessionLogOptions) {
  return renderHTML({ kind: 'past', view: projectPastSessionForm(options), silhouetteView: projectBodySilhouette(options.lastRegions) });
}

export function bindPastSessionRegionPicker<Region = string>(overlay: Element, initialRegions: Iterable<Region> | null | undefined) {
  const selected = new Set<Region | string>(initialRegions);
  const slot = overlay.querySelector('#sun-silhouette-slot');
  const hint = overlay.querySelector('#sun-silhouette-hint');
  const updateHint = () => {
    if (!hint) return;
    const fraction = Array.from(selected).reduce<number>((sum, key) => sum + (BODY_REGIONS.find(region => region.key === key)?.fraction || 0), 0);
    if (selected.size === 0) hint.textContent = 'Tap any body region to toggle whether it was uncovered.';
    else {
      const labels = Array.from(selected).map(key => BODY_REGIONS.find(region => region.key === key)?.label || key).join(', ');
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${(fraction * 100).toFixed(0)}% of skin) — ${labels}`;
    }
  };
  (bindBodySilhouette as (root: Element | null, selected: Set<unknown>, changed: () => void) => void)(slot, selected, updateHint);
  updateHint();
  return selected;
}

export function bindPastSessionDurationHint(overlay: Element) {
  const start = overlay.querySelector<HTMLInputElement>('#det-started-at');
  const end = overlay.querySelector<HTMLInputElement>('#det-ended-at');
  const hint = overlay.querySelector<HTMLElement>('#det-duration-hint');
  const update = () => {
    if (!start || !end || !hint) return;
    const startMs = new Date(start.value).getTime();
    const endMs = new Date(end.value).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) hint.textContent = 'Duration: —';
    else {
      const minutes = Math.round((endMs - startMs) / 60000);
      if (minutes <= 0) hint.textContent = `Ended must be after Started (currently ${minutes} min)`;
      else if (minutes > 240) hint.textContent = `Duration: ${minutes} min — over 4 hours, double-check the times`;
      else hint.textContent = `Duration: ${minutes} min`;
    }
  };
  start?.addEventListener('input', update);
  end?.addEventListener('input', update);
  update();
}
