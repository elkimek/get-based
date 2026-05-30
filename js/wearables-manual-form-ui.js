import { escapeHTML } from './utils.js';

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
    ${tags.map(t => `<button type="button" class="wearable-log-chip" data-tag="${escapeHTML(t)}" onclick="toggleManualLogChip(this,event)">${escapeHTML(t)}</button>`).join('')}
  </div>`;
}

export function toggleManualLogChip(btn, event) {
  if (event) event.stopPropagation();
  btn.classList.toggle('active');
}

export function _collectActiveChips(card) {
  return Array.from(card.querySelectorAll('.wearable-log-chip.active')).map(b => b.dataset.tag);
}

// Shared note-textarea snippet for both manual-log forms. The `idSuffix`
// disambiguates dashboard-card (`wl-...-note`) vs detail-modal (`wlad-note`).
export function _renderNoteField(idSuffix = 'wl-note') {
  return `<textarea class="wearable-log-note" id="${escapeHTML(idSuffix)}" rows="2" placeholder="Optional note — e.g. retook because cuff felt loose, different arm, different lab, just after coffee..." aria-label="Optional note"></textarea>`;
}
