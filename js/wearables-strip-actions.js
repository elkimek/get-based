// @ts-check
// wearables-strip-actions.js — Wearable strip interaction and manual-log owner.

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, showNotification } from './utils.js';
import { state } from './state.js';
import {
  ADAPTERS,
  adapterById,
  canonicalMetric,
  metricsForSources,
  isoDay,
} from './wearable-adapters.js';
import { syncNow, listConnectedSources } from './wearables-connect.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';
import { saveImportedData } from './data.js';
import {
  logManualBP,
  logManualMetric,
  refreshManualSummary,
} from './wearables-manual.js';
import {
  _collectActiveChips,
  _renderNoteField,
  _renderTagChips,
  inputValueById,
  inputValueFromElement,
} from './wearables-manual-form-ui.js';
import { wearableActionAttrs } from './wearables-detail-modal.js';
import {
  getWearablesViewportSize,
  navigateWearables,
} from './wearables-runtime.js';

function rerenderCurrentView() {
  navigateWearables(state.currentView || 'dashboard');
}

export function resetOpenManualLogForms({ exceptMetricId = '' } = {}) {
  const openForms = Array.from(document.querySelectorAll('.wearable-card-empty .wearable-log-form'));
  const shouldReset = openForms.some(form => {
    const card = form.closest('.wearable-card-empty');
    return !(card instanceof HTMLElement) || card.dataset.emptyMetric !== exceptMetricId;
  });
  if (!shouldReset) return false;
  rerenderCurrentView();
  return true;
}

export function toggleWearableStrip() {
  const grid = document.querySelector('.wearable-card-grid');
  const footer = document.querySelector('.wearable-strip-footer');
  const arrow = document.querySelector('.wearable-collapse-arrow');
  if (!grid) return;
  const hidden = grid.classList.toggle('hidden');
  footer?.classList.toggle('hidden', hidden);
  arrow?.classList.toggle('collapsed', hidden);
  // Keep aria-expanded + aria-label on the chevron button in sync with the
  // visual collapse state. Captured-at-render-time attributes go stale on
  // every toggle without this — silent screen-reader regression.
  if (arrow) {
    arrow.setAttribute('aria-expanded', String(!hidden));
    const expanded = !hidden;
    const labelBase = arrow.getAttribute('aria-label') || '';
    // Toggle "Expand"/"Collapse" prefix in-place; preserves the rest of the
    // label that the renderer composed (e.g. "wearables strip").
    if (expanded && /^Expand /i.test(labelBase)) {
      arrow.setAttribute('aria-label', labelBase.replace(/^Expand /i, 'Collapse '));
    } else if (!expanded && /^Collapse /i.test(labelBase)) {
      arrow.setAttribute('aria-label', labelBase.replace(/^Collapse /i, 'Expand '));
    }
  }
  localStorage.setItem('wearables-strip-collapsed', hidden ? '1' : '0');
}

// Per-metric primary-source override picker. Reads connected sources that
// actually have data for this metric and lets the user pick one. The summary
// pipeline respects `state.importedData.wearablePrimaryOverride[metricId]`.
export async function chooseWearableSource(metricId, event) {
  const canon = canonicalMetric(metricId);
  if (!canon) return;
  const connected = listConnectedSources();
  // Sort connected vendors by ADAPTERS registry order so the picker presents
  // them in the same order users see in Settings → Integrations.
  const connectedIds = Object.keys(connected)
    .sort((a, b) => {
      const ai = ADAPTERS.findIndex(x => x.id === a);
      const bi = ADAPTERS.findIndex(x => x.id === b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  if (connectedIds.length < 2) return;

  // Find sources that map this canonical metric in their adapter registry —
  // no point offering WHOOP as a source for `weight` (it doesn't do scales).
  const eligible = connectedIds.filter(sid => {
    const a = adapterById(sid);
    return !!a?.metrics?.[metricId];
  });
  if (eligible.length < 2) {
    showNotification?.(`Only one connected wearable provides ${canon.label}`, 'info', 2500);
    return;
  }

  // Close any existing picker, then build + position a new one near the click.
  document.querySelectorAll('.wearable-source-picker').forEach(el => el.remove());
  // Pick the EFFECTIVE primary first — `wearableSummary.metrics[mid].primarySource`
  // is what the L2 picker actually used, which falls through to auto-pick when
  // an override points at a source with no data. Reading the override directly
  // would mark a stale checkmark and lie to the user about what's active.
  const effectivePrimary = state.importedData?.wearableSummary?.metrics?.[metricId]?.primarySource;
  const overrideSource = state.importedData?.wearablePrimaryOverride?.[metricId];
  const current = effectivePrimary || overrideSource || eligible[0];
  const picker = document.createElement('div');
  picker.className = 'wearable-source-picker';
  picker.innerHTML = `
    <div class="wearable-source-picker-head">${escapeHTML(canon.label)} source</div>
    ${eligible.map(sid => {
      const a = adapterById(sid);
      const selected = sid === current;
      return `<button type="button" class="wearable-source-picker-item${selected ? ' selected' : ''}" data-source="${escapeHTML(sid)}">
        <span>${escapeHTML(a?.displayName || sid)}</span>
        ${selected ? '<span class="wearable-source-picker-check">✓</span>' : ''}
      </button>`;
    }).join('')}
    <button type="button" class="wearable-source-picker-item wearable-source-picker-auto" data-source="">
      <span>Auto (most recent)</span>
      ${!state.importedData?.wearablePrimaryOverride?.[metricId] ? '<span class="wearable-source-picker-check">✓</span>' : ''}
    </button>
  `;
  const rect = event.target.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.visibility = 'hidden';
  picker.style.top = '0px';
  picker.style.left = '0px';
  picker.style.zIndex = '10000';
  document.body.appendChild(picker);
  // Clamp to viewport and flip above if opening below would collide with the
  // chat FAB hotspot (bottom-right ~72px square) or overflow the viewport. On
  // mobile the card is full-width, so a naive rect.left-60 can underflow and
  // the dropdown can disappear under the FAB — measure after insert and nudge.
  const pw = picker.offsetWidth || 200;
  const ph = picker.offsetHeight || 180;
  const { width: vw, height: vh } = getWearablesViewportSize();
  const fabHotspot = { left: vw - 88, top: vh - 88 }; // chat-fab 56px + 24px margin + buffer
  let top = rect.bottom + 4;
  let left = Math.max(8, rect.left - 60);
  // Flip above if bottom would overflow viewport OR intrude on FAB hotspot
  if (top + ph > vh - 8 || (top + ph > fabHotspot.top && left + pw > fabHotspot.left)) {
    top = Math.max(8, rect.top - ph - 4);
  }
  // Clamp right
  if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;
  picker.style.visibility = '';

  // Wire clicks — pick a source, persist override, re-render strip.
  picker.querySelectorAll('[data-source]').forEach(btn => {
    if (!(btn instanceof HTMLElement)) return;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sid = btn.dataset.source;
      if (!state.importedData.wearablePrimaryOverride) state.importedData.wearablePrimaryOverride = {};
      if (!sid) delete state.importedData.wearablePrimaryOverride[metricId];
      else state.importedData.wearablePrimaryOverride[metricId] = sid;
      await saveImportedData();
      await syncWearableSummary(getActiveProfileId(), listConnectedSources());
      picker.remove();
      navigateWearables('dashboard');
    });
  });

  // Dismiss on outside click / Escape.
  setTimeout(() => {
    const dismiss = (e) => {
      if (picker.contains(e.target)) return;
      picker.remove();
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      picker.remove();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', dismiss);
    };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);
  }, 0);
}

export async function syncWearableNow(triggerEl) {
  const sources = Object.keys(listConnectedSources());
  if (sources.length === 0) {
    showNotification?.('Connect a wearable in Settings → Wearables first', 'info');
    return;
  }
  // Spin the inline button icon for the duration of the sync. The button
  // disables itself so a double-click can't kick off concurrent syncs.
  const btn = triggerEl || document.querySelector('.wearable-strip-sync');
  btn?.classList.add('is-syncing');
  if (btn) btn.disabled = true;
  try {
    showNotification?.('Syncing wearables…', 'info', 1500);
    // force:true → bypass L2 gate so the strip never appears stuck on a
    // stale snapshot when a user explicitly clicks "sync now."
    let totalRows = 0;
    for (const sid of sources) {
      const res = await syncNow(sid, { force: true });
      totalRows += res?.rows ?? 0;
    }
    navigateWearables('dashboard');
    showNotification?.(
      totalRows > 0 ? `Wearables synced — ${totalRows} new row${totalRows === 1 ? '' : 's'}` : 'Wearables synced — already up to date',
      'success', 2000
    );
  } catch { /* per-source error already surfaced */ }
  finally {
    btn?.classList.remove('is-syncing');
    if (btn) btn.disabled = false;
  }
}

// Reorder mode — toggle + per-card move handlers. Keeps the reorder flag
// ephemeral (state._wearableReorderMode) so it auto-resets on reload; the
// card ORDER itself is persisted per-profile in importedData.wearableCardOrder.
export function toggleWearableReorder() {
  state._wearableReorderMode = !state._wearableReorderMode;
  navigateWearables('dashboard');
}

export async function moveWearableCard(metricId, delta) {
  const summary = state.importedData?.wearableSummary;
  if (!summary) return;
  // Rebuild the CURRENT display order the same way renderWearableStrip does,
  // so a move reflects exactly what the user sees (populated + empty cards
  // combined, then the saved order applied).
  const sourceIds = Object.keys(summary.sources || {})
    .sort((a, b) => {
      const ai = ADAPTERS.findIndex(x => x.id === a);
      const bi = ADAPTERS.findIndex(x => x.id === b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  const headerSourceIds = sourceIds.filter(s => (summary.sources[s].coverageDays || 0) > 0);
  const baseOrder = metricsForSources(headerSourceIds.length ? headerSourceIds : sourceIds);
  const MANUAL_EMPTY_METRICS_LOCAL = ['weight', 'bp_systolic', 'rhr'];
  // Mirror the strip-render BP merge: dia folds into the sys card and never
  // gets its own reorder slot when both are present.
  const hasSysLocal = !!summary.metrics?.bp_systolic;
  const display = [];
  const seen = new Set();
  for (const id of baseOrder) {
    if (id === 'bp_diastolic' && hasSysLocal) continue;
    if (summary.metrics?.[id]) { display.push(id); seen.add(id); }
  }
  for (const id of MANUAL_EMPTY_METRICS_LOCAL) {
    if (!seen.has(id)) { display.push(id); seen.add(id); }
  }
  const savedOrder = Array.isArray(state.importedData?.wearableCardOrder)
    ? state.importedData.wearableCardOrder : [];
  const ordered = [];
  for (const id of savedOrder) if (display.includes(id)) ordered.push(id);
  for (const id of display) if (!ordered.includes(id)) ordered.push(id);
  const idx = ordered.indexOf(metricId);
  if (idx === -1) return;
  const target = idx + delta;
  if (target < 0 || target >= ordered.length) return;
  const tmp = ordered[idx];
  ordered[idx] = ordered[target];
  ordered[target] = tmp;
  state.importedData.wearableCardOrder = ordered;
  await saveImportedData();
  navigateWearables('dashboard');
}

// Inline manual-log form (Phase 3) — opens from the empty strip cards.
export function openManualLogForm(metricId, event, opts = {}) {
  if (!opts.delegated && event?.target?.closest?.('[data-wearable-action]')) return;
  if (event) event.stopPropagation();
  let card = document.querySelector(`.wearable-card-empty[data-empty-metric="${metricId}"]`);
  if (!card) return;
  // Idempotent: clicks inside the form (e.g. tapping the dia field on the
  // BP card) bubble to the card's delegated action. Without this guard we'd rebuild
  // innerHTML and refocus the first input — yanking the cursor off whatever
  // the user actually clicked.
  if (card.querySelector('.wearable-log-form')) return;
  if (resetOpenManualLogForms({ exceptMetricId: metricId })) {
    card = document.querySelector(`.wearable-card-empty[data-empty-metric="${metricId}"]`);
    if (!card) return;
  }
  const today = isoDay();
  if (metricId === 'weight') {
    card.innerHTML = `
      <div class="wearable-card-top"><span class="wearable-metric-name">Weight</span></div>
      <div class="wearable-log-form">
        <input type="number" step="0.1" inputmode="decimal" class="wearable-log-input" id="wl-weight-val" placeholder="${state.unitSystem === 'US' ? 'lb' : 'kg'}" aria-label="${state.unitSystem === 'US' ? 'Weight in pounds' : 'Weight in kilograms'}" autofocus>
        ${_renderNoteField('wl-weight-note')}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-weight-date" value="${today}" max="${today}" aria-label="Date">
          <button type="button" class="wearable-log-save" ${wearableActionAttrs('manual-log-save', { kind: 'weight' })}>Save</button>
          <button type="button" class="wearable-log-cancel" ${wearableActionAttrs('manual-log-cancel')} aria-label="Cancel">✕</button>
        </div>
      </div>`;
  } else if (metricId === 'bp_systolic') {
    card.innerHTML = `
      <div class="wearable-card-top"><span class="wearable-metric-name">Blood pressure</span></div>
      <div class="wearable-log-form">
        <div class="wearable-log-bp-row">
          <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wl-bp-sys" placeholder="sys" aria-label="Systolic" autofocus>
          <span class="wearable-log-sep">/</span>
          <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wl-bp-dia" placeholder="dia" aria-label="Diastolic">
        </div>
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-pulse-optional" id="wl-bp-pulse" placeholder="pulse (optional)" aria-label="Pulse (optional)">
        ${_renderTagChips('bp_systolic')}
        ${_renderNoteField('wl-bp-note')}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-bp-date" value="${today}" max="${today}" aria-label="Date">
          <button type="button" class="wearable-log-save" ${wearableActionAttrs('manual-log-save', { kind: 'bp' })}>Save</button>
          <button type="button" class="wearable-log-cancel" ${wearableActionAttrs('manual-log-cancel')} aria-label="Cancel">✕</button>
        </div>
      </div>`;
  } else if (metricId === 'rhr') {
    card.innerHTML = `
      <div class="wearable-card-top"><span class="wearable-metric-name">Resting HR</span></div>
      <div class="wearable-log-form">
        <input type="number" inputmode="numeric" class="wearable-log-input" id="wl-rhr-val" placeholder="bpm" aria-label="Resting heart rate in bpm" autofocus>
        ${_renderTagChips('rhr')}
        ${_renderNoteField('wl-rhr-note')}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-rhr-date" value="${today}" max="${today}" aria-label="Date">
          <button type="button" class="wearable-log-save" ${wearableActionAttrs('manual-log-save', { kind: 'rhr' })}>Save</button>
          <button type="button" class="wearable-log-cancel" ${wearableActionAttrs('manual-log-cancel')} aria-label="Cancel">✕</button>
        </div>
      </div>`;
  }
  // Focus the first input.
  setTimeout(() => {
    const firstNumberInput = card.querySelector('input[type="number"]');
    if (firstNumberInput instanceof HTMLElement) firstNumberInput.focus();
  }, 0);
  // Enter-to-save on the number inputs.
  card.querySelectorAll('input[type="number"]').forEach((el) => {
    el.addEventListener('keydown', (e) => {
      const keyEvent = /** @type {KeyboardEvent} */ (e);
      if (keyEvent.key === 'Enter') { e.preventDefault(); saveManualLog(metricId === 'bp_systolic' ? 'bp' : metricId, e); }
      if (keyEvent.key === 'Escape') { e.preventDefault(); cancelManualLog(e); }
    });
  });
}

export async function saveManualLog(kind, event) {
  if (event) event.stopPropagation();
  const profileId = state.currentProfile;
  // Pull any active context chips before the DOM is swapped out by re-render.
  const cardForTags =
    kind === 'weight' ? document.querySelector('.wearable-card-empty[data-empty-metric="weight"]') :
    kind === 'rhr'    ? document.querySelector('.wearable-card-empty[data-empty-metric="rhr"]') :
    kind === 'bp'     ? document.querySelector('.wearable-card-empty[data-empty-metric="bp_systolic"]') : null;
  const tags = cardForTags ? _collectActiveChips(cardForTags) : [];
  // Note field — id varies by kind ('wl-weight-note' / 'wl-bp-note' / 'wl-rhr-note').
  const note = inputValueFromElement(document.getElementById(`wl-${kind === 'bp' ? 'bp' : kind}-note`));
  try {
    if (kind === 'weight') {
      const val = parseFloat(inputValueById('wl-weight-val'));
      const date = inputValueById('wl-weight-date');
      if (!val || val <= 0 || !date) { showNotification?.('Enter a weight and date', 'error'); return; }
      if (val > 500) { showNotification?.('Weight over 500 kg seems unlikely', 'error'); return; }
      await logManualMetric(profileId, 'weight', { date, value: val, tags, note });
    } else if (kind === 'rhr') {
      const val = parseInt(inputValueById('wl-rhr-val'), 10);
      const date = inputValueById('wl-rhr-date');
      if (!val || val <= 0 || !date) { showNotification?.('Enter a pulse and date', 'error'); return; }
      if (val > 250) { showNotification?.('Pulse over 250 bpm seems unlikely', 'error'); return; }
      await logManualMetric(profileId, 'rhr', { date, value: val, tags, note });
    } else if (kind === 'bp') {
      const sys = parseInt(inputValueById('wl-bp-sys'), 10);
      const dia = parseInt(inputValueById('wl-bp-dia'), 10);
      const pulse = parseInt(inputValueById('wl-bp-pulse'), 10);
      const date = inputValueById('wl-bp-date');
      if (!sys || !dia || sys <= 0 || dia <= 0 || !date) { showNotification?.('Enter systolic, diastolic, and date', 'error'); return; }
      if (sys > 300 || dia > 200) { showNotification?.('BP values seem too high', 'error'); return; }
      if (dia >= sys) { showNotification?.('Diastolic should be lower than systolic', 'error'); return; }
      await logManualBP(profileId, { date, systolic: sys, diastolic: dia, pulse: isFinite(pulse) && pulse > 0 ? pulse : undefined, tags, note });
    }
    await refreshManualSummary(profileId);
    rerenderCurrentView();
    showNotification?.('Saved', 'success');
  } catch (e) {
    showNotification?.('Could not save: ' + getErrorMessage(e), 'error');
  }
}

export function cancelManualLog(event) {
  if (event) event.stopPropagation();
  // Re-render the current dashboard/body surface to restore the empty card.
  rerenderCurrentView();
}
