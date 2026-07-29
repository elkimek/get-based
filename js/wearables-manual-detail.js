// @ts-check
// Manual-entry form and mutation owner for the wearable detail modal.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { canonicalMetric, isoDay } from './wearable-adapters.js';
import { getActiveProfileId } from './profile.js';
import { escapeAttr, showNotification } from './utils.js';
import {
  deleteManualMetric,
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
import {
  confirmWearableDetailActionRuntime,
  navigateWearableDetailRuntime,
} from './wearables-detail-runtime.js';

const detailDeps = {
  closeDetail: () => {},
  openDetail: (_metricId) => {},
};

export function configureWearableManualDetailDeps(deps = {}) {
  const previous = { ...detailDeps };
  if (typeof deps.closeDetail === 'function') detailDeps.closeDetail = deps.closeDetail;
  if (typeof deps.openDetail === 'function') detailDeps.openDetail = deps.openDetail;
  return previous;
}

function actionAttrs(action) {
  return `data-wearable-action="${escapeAttr(action)}"`;
}

function formAttrs(metricId, kind) {
  return `data-wearable-form="detail-manual-add" data-wearable-metric="${escapeAttr(metricId)}" data-wearable-kind="${escapeAttr(kind)}"`;
}

export function openManualAddFromDetail(metricId, event) {
  event?.stopPropagation();
  const slot = document.getElementById('wearable-manual-add-slot');
  if (!slot) return;
  const today = isoDay();
  const isBloodPressure = metricId === 'bp_systolic' || metricId === 'bp_diastolic';
  const kind = isBloodPressure ? 'bp' : ['weight', 'rhr'].includes(metricId) ? metricId : '';
  if (!kind) return;
  if (kind === 'weight') {
    const weightUnit = state.unitSystem === 'US' ? 'lb' : 'kg';
    slot.innerHTML = `<form class="wearable-manual-add-form" ${formAttrs(metricId, kind)}>
      <input type="number" step="0.1" inputmode="decimal" class="wearable-log-input" id="wlad-val" placeholder="${weightUnit}" aria-label="Weight in ${weightUnit === 'lb' ? 'pounds' : 'kilograms'}" autofocus>
      ${_renderNoteField('wlad-note')}
      <input type="date" class="wearable-log-date" id="wlad-date" value="${today}">
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" ${actionAttrs('close-detail-manual-add')}>✕</button>
    </form>`;
  } else if (kind === 'rhr') {
    slot.innerHTML = `<form class="wearable-manual-add-form" ${formAttrs(metricId, kind)}>
      <input type="number" inputmode="numeric" class="wearable-log-input" id="wlad-val" placeholder="bpm" autofocus>
      ${_renderTagChips('rhr')}
      ${_renderNoteField('wlad-note')}
      <input type="date" class="wearable-log-date" id="wlad-date" value="${today}">
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" ${actionAttrs('close-detail-manual-add')}>✕</button>
    </form>`;
  } else if (kind === 'bp') {
    slot.innerHTML = `<form class="wearable-manual-add-form wearable-manual-add-form-bp" ${formAttrs(metricId, kind)}>
      <span class="wearable-log-bp-row">
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wlad-sys" placeholder="sys" autofocus>
        <span class="wearable-log-sep">/</span>
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wlad-dia" placeholder="dia">
      </span>
      <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-pulse-optional" id="wlad-pulse" placeholder="pulse (optional)">
      ${_renderTagChips('bp_systolic')}
      ${_renderNoteField('wlad-note')}
      <input type="date" class="wearable-log-date" id="wlad-date" value="${today}">
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" ${actionAttrs('close-detail-manual-add')}>✕</button>
    </form>`;
  }
  const firstNumberInput = slot.querySelector('input[type="number"]');
  if (firstNumberInput instanceof HTMLElement) firstNumberInput.focus();
}

export function closeManualAddFromDetail() {
  const slot = document.getElementById('wearable-manual-add-slot');
  if (slot) slot.innerHTML = '';
}

const manualEntryOps = new Map();

function bumpManualEntryOp(metricId) {
  const next = (manualEntryOps.get(metricId) || 0) + 1;
  manualEntryOps.set(metricId, next);
  return next;
}

export async function saveManualEntryFromDetail(metricId, kind) {
  const operation = bumpManualEntryOp(metricId);
  const profileId = getActiveProfileId();
  const date = inputValueById('wlad-date');
  if (!date) {
    showNotification('Pick a date', 'error');
    return;
  }
  const formEl = document.querySelector('.wearable-manual-add-form');
  const tags = formEl ? _collectActiveChips(formEl) : [];
  const note = inputValueFromElement(document.getElementById('wlad-note'));
  try {
    if (kind === 'weight') {
      const value = parseFloat(inputValueById('wlad-val'));
      if (!value || value <= 0) return showNotification('Enter a weight', 'error');
      if (value > 500) return showNotification('Weight over 500 kg seems unlikely', 'error');
      await logManualMetric(profileId, 'weight', { date, value, tags, note });
    } else if (kind === 'rhr') {
      const value = parseInt(inputValueById('wlad-val'), 10);
      if (!value || value <= 0) return showNotification('Enter a pulse', 'error');
      if (value > 250) return showNotification('Pulse over 250 bpm seems unlikely', 'error');
      await logManualMetric(profileId, 'rhr', { date, value, tags, note });
    } else if (kind === 'bp') {
      const systolic = parseInt(inputValueById('wlad-sys'), 10);
      const diastolic = parseInt(inputValueById('wlad-dia'), 10);
      const pulse = parseInt(inputValueById('wlad-pulse'), 10);
      if (!systolic || !diastolic || systolic <= 0 || diastolic <= 0) {
        return showNotification('Enter systolic and diastolic', 'error');
      }
      if (systolic > 300 || diastolic > 200) {
        return showNotification('BP values seem too high', 'error');
      }
      if (diastolic >= systolic) {
        return showNotification('Diastolic should be lower than systolic', 'error');
      }
      await logManualBP(profileId, {
        date,
        systolic,
        diastolic,
        pulse: Number.isFinite(pulse) && pulse > 0 ? pulse : undefined,
        tags,
        note,
      });
    }
    await refreshManualSummary(profileId);
    if (operation !== manualEntryOps.get(metricId)) return;
    showNotification('Saved', 'success');
    navigateWearableDetailRuntime('dashboard');
    detailDeps.openDetail(metricId);
  } catch (error) {
    showNotification(`Couldn't save: ${getErrorMessage(error)}`, 'error', 4000);
  }
}

export async function deleteManualEntryFromDetail(metricId, date) {
  const operation = bumpManualEntryOp(metricId);
  const label = canonicalMetric(metricId)?.label || metricId;
  if (!await confirmWearableDetailActionRuntime(
    `Delete this ${label.toLowerCase()} reading from ${date}?`,
  )) return;
  try {
    const profileId = getActiveProfileId();
    const metrics = ['bp_systolic', 'bp_diastolic'].includes(metricId)
      ? ['bp_systolic', 'bp_diastolic']
      : [metricId];
    for (const metric of metrics) await deleteManualMetric(profileId, metric, date);
    await refreshManualSummary(profileId);
    if (operation !== manualEntryOps.get(metricId)) return;
    showNotification('Deleted', 'success');
    navigateWearableDetailRuntime('dashboard');
    if (state.importedData?.wearableSummary?.metrics?.[metricId]) {
      detailDeps.openDetail(metricId);
    } else {
      detailDeps.closeDetail();
    }
  } catch (error) {
    showNotification(`Couldn't delete: ${getErrorMessage(error)}`, 'error', 4000);
  }
}
