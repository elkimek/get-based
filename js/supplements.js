// @ts-check
// supplements.js — Public facade and editor controller for supplements/medications.

import { state } from './state.js';
import { bindDetailModalSyncRefresh, escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { saveImportedDataForProfile } from './data.js';
import {
  appendImportedArrayItem,
  deleteImportedArrayItem,
  getConfiguredArrayItemId,
  replaceImportedArrayItem,
} from './data-merge.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { initSupplementActionDelegates, suppActionAttrs } from './supplement-action-delegates.js';
import { closeSupplementsModalRuntime, navigateSupplementsViewRuntime } from './supplements-runtime.js';
import { askAIMitoContext, renderSupplementsSection } from './supplement-dashboard.js';
import {
  effectiveTimesPerDay,
  formatSupplementTotal,
  ingredientDailyTotal,
  refreshSupplementImpact,
  renderSupplementImpact,
} from './supplement-impact.js';
import {
  SUPPLEMENT_RECORD_VERSION,
  createSupplementRecordId,
  confirmIngredientDosePeriod,
  getSupplementPeriods,
  getSupplementRecordId,
  getSupplementStatus,
  localDateKey,
  normalizeSupplementUnit,
  recordSupplementSchedule,
  recordIngredientDoseChange,
  supplementDoseText,
} from './supplement-medication-domain.js';
import {
  aggregateSupplementContaminants,
  formatContaminantMass,
  formatSupplementQualityResult,
  isSupplementQualityIncludedInAI,
} from './supplement-quality.js';
import {
  applyIngredientDoseToPeriod,
  addIngredientRow,
  addPeriodRow,
  addQualityTestRow,
  collectInactiveIngredients,
  collectIngredients,
  collectPeriods,
  collectQualityTests,
  getElementValue,
  getFieldValue,
  getFormField,
  removeIngredientRow,
  removePeriodRow,
  removeQualityTestRow,
  rememberSupplementForm,
  supplementFormHasChanges,
  supplementFieldsChanged,
  supplementFormRecordChanged,
  sourceUrlParts,
  suppFormHtml,
  updateAllIngTotals,
  updateIngTotal,
  updateIngredientUnit,
} from './supplement-form-ui.js';
import {
  applySupplementImportDraft,
  clearPendingSupplementImport,
  discardSupplementImportDraft,
  fetchSupplementFromURL,
  getPendingSupplementImport,
  keepSafetyFocusedImportQuality,
  renderPendingImportReview,
  scanSupplementLabel,
} from './supplement-import-controller.js';

export {
  computeAllImpacts,
  computeSupplementImpact,
  effectiveTimesPerDay,
  ingredientDailyTotal,
  parseAmount,
  refreshSupplementImpact,
  renderSupplementImpact,
} from './supplement-impact.js';
export {
  getCurrentSupplements,
  getInactiveSupplements,
  getSupplementPeriods,
  getSupplementStatus,
  getSupplementsOverlappingRange,
  getUpcomingSupplements,
  isSupplementCurrent,
  isSupplementExpectedOnDate,
} from './supplement-medication-domain.js';
export { askAIMitoContext, renderSupplementsSection } from './supplement-dashboard.js';
export {
  addIngredientRow,
  addPeriodRow,
  addQualityTestRow,
  removeIngredientRow,
  removePeriodRow,
  removeQualityTestRow,
  updateAllIngTotals,
  updateIngTotal,
  updateIngredientUnit,
} from './supplement-form-ui.js';
export {
  applySupplementImportDraft,
  discardSupplementImportDraft,
  fetchSupplementFromURL,
  keepSafetyFocusedImportQuality,
  scanSupplementLabel,
} from './supplement-import-controller.js';

function closeSupplementModal() {
  closeSupplementsModalRuntime();
}

function withSupplementDraftCheck(action) {
  if (!supplementFormHasChanges()) { action(); return; }
  void showConfirmDialog('You have unsaved supplement changes. Discard them and continue?', {
    confirmLabel: 'Discard changes', tone: 'danger', ariaLabel: 'Unsaved supplement changes',
  }).then(confirmed => { if (confirmed) action(); });
}

function navigateSupplementView(category) {
  navigateSupplementsViewRuntime(category);
}

function refreshOpenSupplementsEditorOnSync({ modal }) {
  if (supplementFormHasChanges()) {
    showNotification('Synced data arrived. Your unsaved supplement edits are still open.', 'info');
    return;
  }
  const index = Number.parseInt(modal.dataset.syncRefreshEditIdx || '', 10);
  const itemId = modal.dataset.syncRefreshItemId || '';
  const supplements = state.importedData.supplements || [];
  let nextIndex = -1;
  if (Number.isInteger(index) && supplements[index]) {
    const indexItemId = getConfiguredArrayItemId('supplements', supplements[index]);
    if (!itemId || indexItemId === itemId) nextIndex = index;
  }
  if (nextIndex < 0 && itemId) {
    nextIndex = supplements.findIndex(item => getConfiguredArrayItemId('supplements', item) === itemId);
  }
  openSupplementsEditor(nextIndex >= 0 ? nextIndex : undefined);
}

if (typeof window !== 'undefined') bindDetailModalSyncRefresh('supplements', refreshOpenSupplementsEditorOnSync);

export function toggleSuppAccordion(index) {
  clearPendingSupplementImport();
  const addArea = document.getElementById('supp-add-form-area');
  if (addArea) addArea.innerHTML = '';
  const existing = document.querySelector('.supp-list-expanded');
  const clickedRow = document.querySelector(`.supp-list-item[data-idx="${index}"]`);
  if (existing) {
    const oldIndex = existing instanceof HTMLElement ? parseInt(existing.dataset.expandedIdx || '', 10) : NaN;
    existing.remove();
    document.querySelector(`.supp-list-item[data-idx="${oldIndex}"]`)?.classList.remove('supp-list-item-active');
    if (oldIndex === index) return;
  }
  if (!clickedRow) return;
  const supplement = state.importedData.supplements?.[index];
  if (!supplement) return;
  clickedRow.classList.add('supp-list-item-active');
  clickedRow.insertAdjacentHTML('afterend', `<div class="supp-list-expanded" data-expanded-idx="${index}">${renderSupplementImpact(supplement, index)}${suppFormHtml(index, supplement)}</div>`);
  rememberSupplementForm();
  document.querySelector('.supp-list-expanded')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSupplementQualityOverview(supplements) {
  const current = (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => getSupplementStatus(supplement) === 'active');
  const groups = aggregateSupplementContaminants(current);
  if (!groups.length) return '';
  const rows = groups.map(group => {
    const reported = group.entries.map(entry => `<div><strong>${escapeHTML(entry.product)}</strong>: ${escapeHTML(formatSupplementQualityResult(entry.test))}</div>`).join('');
    const totalMcg = group.exactMcgPerDay + group.upperMcgPerDay;
    const total = group.summableCount
      ? `${group.upperMcgPerDay > 0 ? '≤ ' : ''}${formatContaminantMass(totalMcg)}${group.summableCount < group.reportedCount ? ` + ${group.reportedCount - group.summableCount} not summable` : ''}`
      : 'Not summable';
    const analyte = group.analyte ? group.analyte.charAt(0).toUpperCase() + group.analyte.slice(1) : '';
    return `<tr><th>${escapeHTML(analyte)}</th><td>${reported}</td><td>${escapeHTML(total)}</td></tr>`;
  }).join('');
  return `<section class="supp-quality-overview"><div class="supp-form-section-title">Current contaminant overview</div><div class="supp-form-help">Source-reported, often lot-specific laboratory data. Totals are shown only after the user confirms the report matches their bottle lot and the result is a compatible mass-per-serving/unit value with a personal daily frequency. No safety threshold or regulatory conclusion is applied.</div><div class="supp-quality-overview-scroll"><table><thead><tr><th>Analyte</th><th>Reported by product</th><th>Combined daily amount</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

export function openSupplementsEditor(editIndex) {
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  const supplements = state.importedData.supplements || [];
  clearPendingSupplementImport();
  const isEdit = typeof editIndex === 'number' && !!supplements[editIndex];
  let html = `<button class="modal-close" aria-label="Close supplements and medications" ${suppActionAttrs('close-modal')}>&times;</button><h3>Supplements & Medications</h3><div class="modal-unit">Track what you're taking and when. Click an item to edit it. This history supports context and research warnings; it is not a comprehensive interaction or prescribing checker.</div>${renderSupplementQualityOverview(supplements)}`;
  if (supplements.length) {
    const formatDate = date => date && Number.isFinite(new Date(`${date}T00:00:00`).getTime())
      ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'date not set';
    const statusOrder = { active: 0, scheduled: 1, paused: 2, ended: 3, planned: 4 };
    const statusLabels = { active: 'Current', scheduled: 'Upcoming', paused: 'Paused / between cycles', ended: 'History', planned: 'Planned' };
    const orderedRows = supplements.map((supplement, index) => ({ supplement, index, status: getSupplementStatus(supplement) }))
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.index - b.index);
    html += '<div class="supp-list">';
    let previousStatus = '';
    for (const { supplement, index, status } of orderedRows) {
      if (status !== previousStatus) {
        html += `<div class="supp-list-group-title">${escapeHTML(statusLabels[status])}</div>`;
        previousStatus = status;
      }
      const icon = supplement.type === 'medication' ? '💊' : '💧';
      const periods = getSupplementPeriods(supplement);
      const dateRange = periods.length === 1
        ? `${formatDate(periods[0].start)} → ${periods[0].end ? formatDate(periods[0].end) : 'ongoing'}`
        : periods.map(period => `${formatDate(period.start)}→${period.end ? formatDate(period.end) : 'now'}`).join(' · ');
      const source = sourceUrlParts(supplement.sourceUrl || supplement.importProvenance?.url);
      const currentPeriod = periods.find(period => period.start <= localDateKey() && (!period.end || period.end >= localDateKey()));
      const recordedDose = supplementDoseText(currentPeriod?.dose);
      const qualityAICount = (supplement.qualityTests || []).filter(test => isSupplementQualityIncludedInAI(test, supplement)).length;
      const ingredientPills = supplement.ingredients?.map(ingredient => {
        const total = recordedDose ? null : ingredientDailyTotal(ingredient, supplement);
        const times = effectiveTimesPerDay(ingredient, supplement);
        const timesText = !recordedDose && times && times > 1 ? ` × ${times}/day` : '';
        const totalText = total ? ` → ${formatSupplementTotal(total)}` : '';
        return `<span class="supp-ing-pill">${escapeHTML(ingredient.name)}${ingredient.amount ? ` ${escapeHTML(ingredient.amount)}${recordedDose ? ' per serving' : ''}` : ''}${escapeHTML(timesText)}${escapeHTML(totalText)}</span>`;
      }).join('') || '';
      html += `<div class="supp-list-item${isEdit && editIndex === index ? ' supp-list-item-active' : ''}" data-idx="${index}" role="button" tabindex="0" aria-label="Edit ${escapeHTML(supplement.name)}" ${suppActionAttrs('toggle-accordion', `data-supp-index="${index}"`)}><span class="supp-list-icon">${icon}</span><div class="supp-list-info"><div class="supp-list-name">${escapeHTML(supplement.name)} <span class="supp-status-badge supp-status-${status}">${escapeHTML(status === 'active' ? 'Current' : status)}</span>${supplement.dosage ? ` <span class="supp-list-meta">${escapeHTML(supplement.dosage)}</span>` : ''}</div><div class="supp-list-meta">${dateRange}${source ? ` &middot; <a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer" class="supp-list-source">${escapeHTML(source.host)} ↗</a>` : ''}</div>${recordedDose ? `<div class="supp-list-dose">Recorded dose: ${escapeHTML(recordedDose)}</div>` : ''}${ingredientPills ? `<div class="supp-list-ingredients">${ingredientPills}</div>` : ''}${supplement.qualityTests?.length ? `<div class="supp-list-quality">${supplement.qualityTests.length} laboratory result${supplement.qualityTests.length === 1 ? '' : 's'} kept separate from ingredients · ${qualityAICount} in AI context</div>` : ''}${supplement.note ? `<div class="supp-list-note">${escapeHTML(supplement.note)}</div>` : ''}</div></div>`;
      if (isEdit && editIndex === index) html += `<div class="supp-list-expanded" data-expanded-idx="${index}">${renderSupplementImpact(supplement, index)}${suppFormHtml(index, supplement)}</div>`;
    }
    html += '</div>';
  }
  html += `<div class="supp-add-section"><button class="supp-add-btn" ${suppActionAttrs('toggle-add-form')}>+ Add New</button><div id="supp-add-form-area"></div></div>`;
  modal.innerHTML = html;
  rememberSupplementForm();
  modal.dataset.syncRefreshKind = 'supplements';
  modal.dataset.syncRefreshEditIdx = isEdit ? String(editIndex) : '';
  modal.dataset.syncRefreshItemId = isEdit ? getConfiguredArrayItemId('supplements', supplements[editIndex]) || '' : '';
  openModalOverlay(overlay);
  if (isEdit) setTimeout(() => document.querySelector('.supp-list-expanded')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

export function showAddSuppForm() {
  const area = document.getElementById('supp-add-form-area');
  if (!area) return;
  if (area.innerHTML.trim()) { area.innerHTML = ''; return; }
  clearPendingSupplementImport();
  const existing = document.querySelector('.supp-list-expanded');
  if (existing) {
    const oldIndex = existing instanceof HTMLElement ? parseInt(existing.dataset.expandedIdx || '', 10) : NaN;
    existing.remove();
    document.querySelector(`.supp-list-item[data-idx="${oldIndex}"]`)?.classList.remove('supp-list-item-active');
  }
  area.innerHTML = suppFormHtml(-1, null, renderPendingImportReview());
  rememberSupplementForm();
  setTimeout(() => {
    getFormField('supp-url')?.focus();
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function parseScheduleDetails(mode, details) {
  if (mode === 'selected-days') {
    const names = ['sun(?:day)?', 'mon(?:day)?', 'tue(?:s(?:day)?)?', 'wed(?:nesday)?', 'thu(?:rs?(?:day)?)?', 'fri(?:day)?', 'sat(?:urday)?'];
    return { daysOfWeek: names.flatMap((name, day) => new RegExp(`\\b${name}s?\\b`, 'i').test(details) ? [day] : []) };
  }
  if (mode === 'interval') {
    const match = details.match(/(?:every\s*)?(\d+)\s*days?/i);
    const intervalDays = match ? Number(match[1]) : NaN;
    return Number.isInteger(intervalDays) && intervalDays > 0 ? { intervalDays } : {};
  }
  return {};
}

const scheduleFields = '#supp-schedule-mode, #supp-schedule-details, #supp-times, #supp-max-per-day';

function preserveUntouchedSupplementFields(entry, previous) {
  if (!previous) return;
  const fields = {
    name: '#supp-name', type: '#supp-type', dosage: '#supp-dosage', note: '#supp-note',
    periods: '#supp-periods', startDate: '#supp-periods', endDate: '#supp-periods', currentDose: '#supp-periods',
    schedule: scheduleFields, timesPerDay: scheduleFields,
    ingredients: '#supp-ingredients', inactiveIngredients: '#supp-inactive-ingredients',
    qualityTests: '#supp-quality-tests', qualityEvidenceScope: '#supp-quality-evidence-scope',
    sourceUrl: '#supp-url', servingSize: '#supp-serving-value, #supp-serving-unit',
    brand: '#supp-brand', genericName: '#supp-generic-name', dosageForm: '#supp-dosage-form',
    route: '#supp-route', labelDirections: '#supp-label-directions', reason: '#supp-reason', prescriber: '#supp-prescriber',
    lifecycle: '#supp-periods, #supp-end-reason',
  };
  for (const [key, selector] of Object.entries(fields)) {
    if (supplementFieldsChanged(selector)) continue;
    if (Object.hasOwn(previous, key)) entry[key] = structuredClone(previous[key]);
    else delete entry[key];
  }
}

let supplementSavePending = false;

/** Persist a detached intent; failed writes must leave both saved state and the draft intact. */
async function commitSupplementMutation(mutate) {
  if (supplementSavePending) return false;
  const profile = state.currentProfile;
  if (!profile) { showNotification('Select a profile before saving.', 'error'); return false; }
  supplementSavePending = true;
  const baseData = structuredClone(state.importedData);
  const snapshot = structuredClone(baseData);
  const controls = Array.from(document.querySelectorAll('#supp-form-panel input, #supp-form-panel select, #supp-form-panel textarea, #supp-form-panel button')).filter(control => control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement || control instanceof HTMLButtonElement);
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  try {
    mutate(snapshot);
    return await saveImportedDataForProfile(profile, snapshot, { baseData });
  } finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    supplementSavePending = false;
  }
}

export async function saveSupplement(index) {
  if (supplementFormRecordChanged()) {
    showNotification('This record changed elsewhere. Copy any unsaved edits, then close and reopen it before saving.', 'error');
    return;
  }
  const previous = index >= 0 ? state.importedData.supplements?.[index] : null;
  const periodsChanged = !previous || supplementFieldsChanged('#supp-periods');
  const scheduleChanged = !previous || supplementFieldsChanged(scheduleFields);
  const name = getFieldValue('supp-name').trim();
  const dosage = getFieldValue('supp-dosage').trim();
  const type = getFieldValue('supp-type');
  if (!name) { getFormField('supp-name')?.focus(); showNotification('Name is required', 'error'); return; }
  const missingStart = Array.from(document.querySelectorAll('#supp-periods .supp-period-start')).find(input => !getElementValue(input));
  if (periodsChanged && missingStart instanceof HTMLInputElement) {
    missingStart.focus();
    showNotification('Enter a start date for every period, or remove the empty period.', 'error');
    return;
  }
  const periods = collectPeriods();
  if (periodsChanged && !periods.length) { showNotification('At least one period is required', 'error'); return; }
  for (const period of periodsChanged ? periods : []) {
    if (!period.start) { showNotification('Each period needs a start date', 'error'); return; }
    if (period.end && period.end < period.start) { showNotification('Period end must be after start', 'error'); return; }
  }
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  for (let periodIndex = 0; periodsChanged && periodIndex < sorted.length - 1; periodIndex += 1) {
    if ((sorted[periodIndex].end || '9999-12-31') >= sorted[periodIndex + 1].start) {
      showNotification('Periods must not overlap or share the same date', 'error');
      return;
    }
  }
  const pendingImport = getPendingSupplementImport();
  const ingredients = collectIngredients(pendingImport);
  const inactiveIngredients = collectInactiveIngredients();
  const qualityTests = collectQualityTests(pendingImport);
  const timesRaw = getFieldValue('supp-times').trim();
  const timesPerDay = timesRaw ? parseFloat(timesRaw) : NaN;
  const scheduleMode = getFieldValue('supp-schedule-mode') || 'daily';
  const scheduleDetails = getFieldValue('supp-schedule-details').trim();
  const parsedSchedule = parseScheduleDetails(scheduleMode, scheduleDetails);
  if (scheduleChanged && ((scheduleMode === 'selected-days' && !parsedSchedule.daysOfWeek?.length)
    || (scheduleMode === 'interval' && !parsedSchedule.intervalDays))) {
    getFormField('supp-schedule-details')?.focus();
    showNotification(scheduleMode === 'selected-days' ? 'Enter weekdays, for example Mon/Wed/Fri.' : 'Enter an interval, for example every 3 days.', 'error');
    return;
  }
  if (scheduleChanged && timesRaw && (!Number.isFinite(timesPerDay) || timesPerDay <= 0 || timesPerDay > 99)) {
    getFormField('supp-times')?.focus();
    showNotification('Servings/day must be greater than zero. Use Pause when you stop taking it.', 'error');
    return;
  }
  const maxPerDayRaw = getFieldValue('supp-max-per-day').trim();
  const maxPerDay = maxPerDayRaw ? parseFloat(maxPerDayRaw) : NaN;
  const sourceUrlRaw = getFieldValue('supp-url').trim();
  let sourceUrl = null;
  if (sourceUrlRaw && (!previous || supplementFieldsChanged('#supp-url'))) {
    try {
      sourceUrl = new URL(sourceUrlRaw);
      if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error('Invalid protocol');
    } catch {
      showNotification('Invalid product URL', 'error');
      return;
    }
  }
  /** @type {import('../types/supplement-data.js').SupplementRecordWithHistory} */
  const entry = {
    ...(previous && typeof previous === 'object' ? previous : {}),
    id: getSupplementRecordId(previous) || createSupplementRecordId(),
    schemaVersion: previous?.schemaVersion ?? SUPPLEMENT_RECORD_VERSION,
    name, dosage, type,
    startDate: sorted[0]?.start,
    endDate: sorted[sorted.length - 1]?.end,
    note: getFieldValue('supp-note').trim(),
    periods: sorted,
    schedule: {
      ...(previous?.schedule && typeof previous.schedule === 'object' ? previous.schedule : {}),
      mode: scheduleMode,
      ...(scheduleDetails ? { details: scheduleDetails } : {}),
      ...(isFinite(maxPerDay) && maxPerDay > 0 ? { maxPerDay } : {}),
      ...parsedSchedule,
    },
    lifecycle: {
      ...(previous?.lifecycle && typeof previous.lifecycle === 'object' ? previous.lifecycle : {}),
      state: sorted.some(period => period.start <= localDateKey() && !period.end) ? 'active' : previous?.lifecycle?.state || 'ended',
    },
    updatedAt: Date.now(),
  };
  if (!scheduleDetails) delete entry.schedule.details;
  if (!(isFinite(maxPerDay) && maxPerDay > 0)) delete entry.schedule.maxPerDay;
  if (scheduleMode !== 'selected-days') delete entry.schedule.daysOfWeek;
  if (scheduleMode !== 'interval') delete entry.schedule.intervalDays;
  if (ingredients) entry.ingredients = ingredients; else delete entry.ingredients;
  if (inactiveIngredients) entry.inactiveIngredients = inactiveIngredients; else delete entry.inactiveIngredients;
  if (qualityTests) {
    entry.qualityTests = qualityTests;
    entry.qualityEvidenceScope = getFieldValue('supp-quality-evidence-scope') || 'unknown';
  } else {
    delete entry.qualityTests;
    delete entry.qualityEvidenceScope;
  }
  if (scheduleMode !== 'prn' && isFinite(timesPerDay) && timesPerDay > 0) entry.timesPerDay = timesPerDay;
  else delete entry.timesPerDay;
  entry.schedule.timesPerDay = entry.timesPerDay ?? null;

  if (sourceUrl) entry.sourceUrl = sourceUrl.toString(); else delete entry.sourceUrl;
  for (const [field, id] of [['brand','supp-brand'],['genericName','supp-generic-name'],['dosageForm','supp-dosage-form'],['route','supp-route'],['labelDirections','supp-label-directions'],['reason','supp-reason'],['prescriber','supp-prescriber']]) {
    const value = getFieldValue(id).trim();
    if (value) entry[field] = value; else delete entry[field];
  }
  const lifecycleReason = getFieldValue('supp-end-reason').trim();
  if (lifecycleReason) {
    entry.lifecycle.reason = lifecycleReason;
    const latestPeriod = entry.periods[entry.periods.length - 1];
    if (latestPeriod?.end) latestPeriod.endReason = lifecycleReason;
  } else delete entry.lifecycle.reason;
  const servingValueRaw = getFieldValue('supp-serving-value').trim();
  const servingValue = servingValueRaw ? parseFloat(servingValueRaw) : NaN;
  const servingUnit = normalizeSupplementUnit(getFieldValue('supp-serving-unit'));
  if (isFinite(servingValue) || servingUnit) {
    entry.servingSize = { ...previous?.servingSize };
    if (isFinite(servingValue)) entry.servingSize.value = servingValue; else delete entry.servingSize.value;
    if (servingUnit) entry.servingSize.unit = servingUnit; else delete entry.servingSize.unit;
  } else delete entry.servingSize;
  preserveUntouchedSupplementFields(entry, previous);
  if (scheduleChanged || periodsChanged) entry.periods = recordSupplementSchedule(previous, getSupplementPeriods(entry), entry.schedule || { mode: 'daily', timesPerDay: entry.timesPerDay ?? null });
  const ingredientsChanged = !previous || supplementFieldsChanged('#supp-ingredients');
  if (ingredientsChanged || scheduleChanged) recordIngredientDoseChange(entry, localDateKey(), previous);
  if (periodsChanged || ingredientsChanged || scheduleChanged) {
    const latestDose = getSupplementPeriods(entry).at(-1)?.dose;
    if (latestDose) entry.currentDose = latestDose; else delete entry.currentDose;
  }
  if (pendingImport?.draft?.source?.reviewed) {
    const draft = pendingImport.draft;
    const fields = ['product', 'genericName', 'brand', 'type', 'dosageForm', 'route', 'servingSize', 'labelDirections', 'ingredients', 'inactiveIngredients', 'qualityTests'];
    entry.importProvenance = {
      ...draft.source,
      reviewedAt: Date.now(),
      fields: Object.fromEntries(fields.filter(field => draft[field] && (!Array.isArray(draft[field]) || draft[field].length)).map(field => [field, {
        source: draft.fieldSources?.[field] || draft.source.kind,
        confidence: draft.confidence,
        deterministic: draft.source.deterministicFields.includes(field),
      }])),
    };
    if (draft.warnings.length) entry.labelWarnings = [...draft.warnings];
  }
  const profile = state.currentProfile;
  const form = document.getElementById('supp-form-panel');
  const saved = await commitSupplementMutation(snapshot => {
    if (index >= 0) replaceImportedArrayItem(snapshot, 'supplements', index, entry);
    else appendImportedArrayItem(snapshot, 'supplements', entry);
  });
  if (!saved || state.currentProfile !== profile) return saved;
  showNotification(index >= 0 ? 'Changes saved' : 'Item added', 'success');
  if (document.getElementById('supp-form-panel') === form) {
    refreshSupplementSurfaces(state.importedData.supplements.findIndex(item => getSupplementRecordId(item) === entry.id));
  }
  return true;
}

function refreshSupplementSurfaces(editIndex) {
  const section = document.querySelector('.supp-timeline-section');
  if (section) section.outerHTML = renderSupplementsSection();
  openSupplementsEditor(editIndex);
}

function previousDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

async function closeSupplementPeriod(index, lifecycleState) {
  const previous = state.importedData.supplements?.[index];
  if (!previous) return;
  const today = localDateKey();
  const formMatches = Number.parseInt(document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') || '', 10) === index;
  const reason = formMatches ? getFieldValue('supp-end-reason').trim() : '';
  let changed = false;
  const periods = getSupplementPeriods(previous).map(period => {
    if (period?.start && period.start <= today && (!period.end || period.end >= today)) {
      changed = true;
      return { ...period, end: today, ...(reason ? { endReason: reason } : {}) };
    }
    return { ...period };
  });
  if (!changed) { showNotification('This item has no open period to close.', 'info'); return; }
  const entry = {
    ...previous, periods,
    startDate: periods[0]?.start || previous.startDate,
    endDate: periods[periods.length - 1]?.end || null,
    lifecycle: { ...(previous.lifecycle || {}), state: lifecycleState, changedAt: Date.now(), ...(reason ? { reason } : {}) },
    updatedAt: Date.now(),
  };
  const profile = state.currentProfile;
  if (await commitSupplementMutation(snapshot => replaceImportedArrayItem(snapshot, 'supplements', index, entry)) && state.currentProfile === profile) {
    showNotification(lifecycleState === 'paused' ? 'Item paused and moved out of Current' : 'Item ended and moved to History', 'success');
    refreshSupplementSurfaces(index);
  }
}

export function pauseSupplement(index) { return closeSupplementPeriod(index, 'paused'); }
export function endSupplement(index) { return closeSupplementPeriod(index, 'ended'); }

export async function restartSupplement(index) {
  const previous = state.importedData.supplements?.[index];
  if (!previous) return;
  if (getSupplementStatus(previous) === 'active') { showNotification('This item is already current.', 'info'); return; }
  const today = localDateKey();
  if (getSupplementPeriods(previous).some(period => period.start > today)) {
    showNotification('This item has a planned period. Edit its dates before restarting.', 'info');
    return;
  }
  const periods = getSupplementPeriods(previous).map(period => ({ ...period }));
  const latest = periods[periods.length - 1];
  if (latest?.end === today) latest.end = null;
  else periods.push({ start: today, end: null,
    ...(latest?.dose || previous.currentDose ? { dose: latest?.dose || previous.currentDose } : {}),
    ...(latest?.ingredientDoses ? { ingredientDoses: latest.ingredientDoses.map(dose => ({ ...dose })) } : {}),
    ...(previous.schedule || latest?.schedule ? { schedule: { ...(previous.schedule || latest.schedule) } } : {}),
  });
  const entry = {
    ...previous, periods, startDate: periods[0]?.start || today, endDate: null,
    lifecycle: { ...(previous.lifecycle || {}), state: 'active', changedAt: Date.now() }, updatedAt: Date.now(),
  };
  recordIngredientDoseChange(entry, localDateKey(), previous);
  const profile = state.currentProfile;
  if (await commitSupplementMutation(snapshot => replaceImportedArrayItem(snapshot, 'supplements', index, entry)) && state.currentProfile === profile) {
    showNotification('Item restarted. Review the current dose and schedule.', 'success');
    refreshSupplementSurfaces(index);
  }
}

export function beginSupplementDoseChange(index) {
  const previous = state.importedData.supplements?.[index];
  if (!previous || getSupplementStatus(previous) !== 'active') return;
  const today = localDateKey();
  const rows = Array.from(document.querySelectorAll('#supp-periods .supp-period-row'));
  const openRow = rows.find(row => {
    const start = getElementValue(row.querySelector('.supp-period-start'));
    const end = getElementValue(row.querySelector('.supp-period-end'));
    return start && start <= today && (!end || end >= today);
  });
  if (openRow && getElementValue(openRow.querySelector('.supp-period-start')) === today) {
    const dose = openRow.querySelector('.supp-period-dose');
    if (dose instanceof HTMLElement) dose.focus();
    showNotification('Today’s period already exists. Edit its dose, then Save changes.', 'info');
    return;
  }
  // Removing a staged dose-change row leaves the previous period closed.
  // Allow the user to create today's row again without reopening history.
  if (rows.some(row => {
    if (row === openRow) return false;
    const start = getElementValue(row.querySelector('.supp-period-start'));
    const end = getElementValue(row.querySelector('.supp-period-end'));
    return !start || start >= today || (end && end >= today);
  })) {
    showNotification('Review the period dates first: today’s new dose must not overlap another period.', 'info');
    return;
  }
  const end = openRow?.querySelector('.supp-period-end');
  const previousEnd = getElementValue(end);
  const doseInput = openRow?.querySelector('.supp-period-dose');
  const originalIndex = Number.parseInt(openRow?.getAttribute('data-original-index') || '', 10);
  const original = getSupplementPeriods(previous)[originalIndex];
  let newDose = '';
  // If the user types first and then chooses a new dose, keep the saved
  // historical amount and move their edit into the new period.
  if (doseInput instanceof HTMLInputElement && original && doseInput.value !== supplementDoseText(original.dose)) {
    newDose = doseInput.value;
    doseInput.value = supplementDoseText(original.dose);
  }
  if (end instanceof HTMLInputElement) end.value = previousDateKey(today);
  addPeriodRow({ start: today, end: previousEnd || null, dose: newDose }, openRow, previousEnd);
  const doseInputs = document.querySelectorAll('#supp-periods .supp-period-dose');
  const latestDose = doseInputs[doseInputs.length - 1];
  if (latestDose instanceof HTMLElement) latestDose.focus();
  showNotification('New period starts today. Enter its dose, then Save changes.', 'info');
}

export async function deleteSupplement(index) {
  const supplement = state.importedData.supplements?.[index];
  if (!supplement) return;
  const profile = state.currentProfile;
  const expectedRecord = JSON.stringify(supplement);
  const confirmed = await showConfirmDialog(`Permanently delete "${supplement.name}" and its full usage history? Ending it keeps the history and is usually better.`, {
    confirmLabel: 'Delete permanently', tone: 'danger', ariaLabel: 'Delete supplement or medication',
  });
  if (!confirmed || state.currentProfile !== profile || JSON.stringify(state.importedData.supplements?.[index]) !== expectedRecord) return;
  if (!await commitSupplementMutation(snapshot => deleteImportedArrayItem(snapshot, 'supplements', index)) || state.currentProfile !== profile) return;
  showNotification(`"${supplement.name}" removed`, 'info');
  const section = document.querySelector('.supp-timeline-section');
  if (section) section.outerHTML = renderSupplementsSection();
  if (state.importedData.supplements.length) openSupplementsEditor();
  else {
    closeSupplementModal();
    const activeNav = document.querySelector('.nav-item.active');
    navigateSupplementView(activeNav instanceof HTMLElement ? activeNav.dataset.category || 'dashboard' : 'dashboard');
  }
}

initSupplementActionDelegates({
  applyIngredientDoseToPeriod,
  openEditor: index => withSupplementDraftCheck(() => openSupplementsEditor(index)),
  toggleAccordion: index => withSupplementDraftCheck(() => toggleSuppAccordion(index)),
  toggleAddForm: () => withSupplementDraftCheck(showAddSuppForm),
  closeModal: () => withSupplementDraftCheck(closeSupplementModal),
  askMito: askAIMitoContext,
  addIngredient: addIngredientRow,
  removeIngredient: removeIngredientRow,
  addQualityTest: addQualityTestRow,
  removeQualityTest: removeQualityTestRow,
  addPeriod: addPeriodRow,
  removePeriod: removePeriodRow,
  fetchUrl: fetchSupplementFromURL,
  triggerLabelPicker: () => document.getElementById('supp-label-input')?.click(),
  scanLabel: scanSupplementLabel,
  save: saveSupplement,
  delete: deleteSupplement,
  pause: index => withSupplementDraftCheck(() => pauseSupplement(index)),
  end: index => withSupplementDraftCheck(() => endSupplement(index)),
  restart: index => withSupplementDraftCheck(() => restartSupplement(index)),
  changeDose: beginSupplementDoseChange,
  applyImport: applySupplementImportDraft,
  keepSafetyQuality: keepSafetyFocusedImportQuality,
  discardImport: discardSupplementImportDraft,
  refreshImpact: refreshSupplementImpact,
  updateIngredientTotal: updateIngTotal,
  updateAllIngredientTotals: updateAllIngTotals,
  updateIngredientUnit,
});


/** Commit only the dated ingredient confirmation the user just previewed. */
export async function saveSupplementIngredientPeriod(id, periodIndex, expectedRecord) {
  const profile = state.currentProfile;
  const records = state.importedData.supplements || [];
  const index = records.findIndex(record => getSupplementRecordId(record) === id);
  if (!profile || index < 0 || records.filter(record => getSupplementRecordId(record) === id).length !== 1
      || JSON.stringify(records[index]) !== expectedRecord) return false;
  const confirmed = confirmIngredientDosePeriod(records[index], periodIndex);
  if (!confirmed) return false;
  const baseData = structuredClone(state.importedData);
  const snapshot = structuredClone(baseData);
  replaceImportedArrayItem(snapshot, 'supplements', index, confirmed);
  const saved = await saveImportedDataForProfile(profile, snapshot, { baseData });
  if (saved && state.currentProfile === profile) showNotification('Dose dates saved', 'success');
  return saved;
}
