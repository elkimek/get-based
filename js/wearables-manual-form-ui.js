// @ts-check

import { escapeAttr, escapeHTML } from './utils.js';

const WEARABLE_LOG_ACTION_ATTR = 'data-wearable-log-action';
const wearableManualFormDelegateRoots = new WeakSet();

// Chip row for optional context tags. Tags are informational; sensors cannot
// infer whether a manual BP/RHR reading was resting, post-workout, etc.
const TAG_CHIPS = {
  bp_systolic: ['resting', 'morning-fasted', 'post-workout', 'stress'],
  rhr: ['resting', 'morning-fasted', 'post-workout'],
};

export function _renderTagChips(metricId) {
  const tags = TAG_CHIPS[metricId];
  if (!tags) return '';
  return `<div class="wearable-log-tags" role="group" aria-label="Optional context">
    ${tags.map(t => `<button type="button" class="wearable-log-chip" ${WEARABLE_LOG_ACTION_ATTR}="toggle-chip" data-tag="${escapeAttr(t)}">${escapeHTML(t)}</button>`).join('')}
  </div>`;
}

export function toggleManualLogChip(btn, event) {
  if (event) event.stopPropagation();
  btn.classList.toggle('active');
}

function closestWearableLogAction(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(`[${WEARABLE_LOG_ACTION_ATTR}]`);
}

function handleWearableLogActionClick(event) {
  const actionEl = closestWearableLogAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(WEARABLE_LOG_ACTION_ATTR) === 'toggle-chip') {
    toggleManualLogChip(actionEl, event);
  }
}

export function installWearablesManualFormDelegates(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || wearableManualFormDelegateRoots.has(root)) return;
  wearableManualFormDelegateRoots.add(root);
  root.addEventListener('click', handleWearableLogActionClick);
}

if (typeof document !== 'undefined') {
  installWearablesManualFormDelegates(document);
}

export function _collectActiveChips(card) {
  return Array.from(card.querySelectorAll('.wearable-log-chip.active')).map(b => b.dataset.tag);
}

export function inputValueFromElement(el) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return '';
}

export function inputValueById(id) {
  return inputValueFromElement(document.getElementById(id));
}

// Shared note-textarea snippet for both manual-log forms. The `idSuffix`
// disambiguates dashboard-card (`wl-...-note`) vs detail-modal (`wlad-note`).
export function _renderNoteField(idSuffix = 'wl-note') {
  return `<textarea class="wearable-log-note" id="${escapeHTML(idSuffix)}" rows="2" placeholder="Optional note — e.g. retook because cuff felt loose, different arm, different lab, just after coffee..." aria-label="Optional note"></textarea>`;
}
