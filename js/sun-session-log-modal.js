// @ts-check

import { escapeAttr, escapeHTML } from './utils.js';
import { BODY_REGIONS, bindBodySilhouette, renderBodySilhouette } from './sun-body-silhouette.js';
import { sunSessionActionAttrs } from './sun-session-actions.js';

export function renderPastSessionLogModal(options) {
  const { lastUsed, lastRegions, eyeMode, lensTint, localStartDefault, localNow, eyeModes, lensTints, postureOptions, surfaceOptions } = options;
  return `<div class="modal sun-detailed-modal" role="dialog" aria-label="Past session log">
    <div class="modal-header">
      <h3>Log a past session</h3>
      <button type="button" class="modal-close" ${sunSessionActionAttrs('close-modal')} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">For sessions that already happened. Tap each body region that was uncovered.${lastUsed ? ' Body regions, eyewear, and lens tint default to your last session.' : ''}</p>
      <label class="ctx-label">Body regions exposed</label>
      <div class="sun-silhouette-wrap" id="sun-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-silhouette-hint">Tap any body region to toggle whether it was uncovered.</div>
      <div class="sun-detailed-row">
        <label class="ctx-label">Started at
          <input type="datetime-local" id="det-started-at" class="ctx-input" value="${escapeAttr(localStartDefault)}" max="${escapeAttr(localNow)}" />
        </label>
        <label class="ctx-label">Ended at
          <input type="datetime-local" id="det-ended-at" class="ctx-input" value="${escapeAttr(localNow)}" max="${escapeAttr(localNow)}" />
        </label>
      </div>
      <p class="sun-detailed-glass-hint">Choose a protected-eye option only when the lenses are labeled UV-blocking. Dark tint alone does not prove UV protection.</p>
      <div class="sun-silhouette-hint" id="det-duration-hint" style="margin-top:-6px">Duration: 15 min</div>
      <div class="sun-detailed-row">
        <label class="ctx-label">Sunscreen SPF
          <input type="number" id="det-spf" class="ctx-input" min="0" max="100" placeholder="none" />
          <span class="sun-silhouette-hint">Modeled conservatively as variable typical-use protection, not the full laboratory SPF or permission to stay out longer.</span>
        </label>
        <div class="ctx-label sun-detailed-glass" style="margin-top:24px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Behind glass (window / car / sunroom)</span>
          <label class="toggle-switch"><input type="checkbox" id="det-glass" /><span class="toggle-slider"></span></label>
        </div>
      </div>
      <div class="sun-detailed-row">
        <label class="ctx-label">Eyes
          <select id="det-eye-mode" class="ctx-select">${eyeModes.map(item => `<option value="${escapeAttr(item.key)}"${item.key === eyeMode ? ' selected' : ''}>${escapeHTML(item.pickerLabel || item.label)}</option>`).join('')}</select>
        </label>
        <label class="ctx-label">Lens tint
          <select id="det-lens-tint" class="ctx-select">${lensTints.map(item => `<option value="${escapeAttr(item.key)}"${item.key === lensTint ? ' selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="sun-detailed-row">
        <label class="ctx-label">Posture
          <select id="det-posture" class="ctx-select">${postureOptions.map(item => `<option value="${escapeAttr(item.key)}"${item.key === (lastUsed?.posture || 'standing') ? ' selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}</select>
        </label>
        <label class="ctx-label">Surface
          <select id="det-surface" class="ctx-select">${surfaceOptions.map(item => `<option value="${escapeAttr(item.key)}"${item.key === (lastUsed?.surfaceAlbedo || 'grass') ? ' selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}</select>
        </label>
      </div>
      <label class="ctx-label">Notes<textarea id="det-notes" class="ctx-input" rows="2" placeholder="Optional"></textarea></label>
      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="import-btn import-btn-secondary" ${sunSessionActionAttrs('close-modal')}>Cancel</button>
        <button type="button" class="import-btn import-btn-primary" id="det-save">Save session</button>
      </div>
    </div>
  </div>`;
}

export function bindPastSessionRegionPicker(overlay, initialRegions) {
  const selected = new Set(initialRegions);
  const slot = overlay.querySelector('#sun-silhouette-slot');
  const hint = overlay.querySelector('#sun-silhouette-hint');
  const updateHint = () => {
    if (!hint) return;
    const fraction = Array.from(selected).reduce((sum, key) => sum + (BODY_REGIONS.find(region => region.key === key)?.fraction || 0), 0);
    if (selected.size === 0) hint.textContent = 'Tap any body region to toggle whether it was uncovered.';
    else {
      const labels = Array.from(selected).map(key => BODY_REGIONS.find(region => region.key === key)?.label || key).join(', ');
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${(fraction * 100).toFixed(0)}% of skin) — ${labels}`;
    }
  };
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();
  return selected;
}

export function bindPastSessionDurationHint(overlay) {
  const start = /** @type {HTMLInputElement | null} */ (overlay.querySelector('#det-started-at'));
  const end = /** @type {HTMLInputElement | null} */ (overlay.querySelector('#det-ended-at'));
  const hint = /** @type {HTMLElement | null} */ (overlay.querySelector('#det-duration-hint'));
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
