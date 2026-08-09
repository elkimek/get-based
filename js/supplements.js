// @ts-check
// supplements.js — Public facade and editor controller for supplements/medications.

import { state } from './state.js';
import { bindDetailModalSyncRefresh, escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
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
  getSupplementPeriods,
  getSupplementRecordId,
  getSupplementStatus,
  localDateKey,
  normalizeSupplementUnit,
} from './supplement-medication-domain.js';
import {
  aggregateSupplementContaminants,
  formatContaminantMass,
  formatSupplementQualityResult,
  isSupplementQualityIncludedInAI,
} from './supplement-quality.js';
import {
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

function navigateSupplementView(category) {
  navigateSupplementsViewRuntime(category);
}

function refreshOpenSupplementsEditorOnSync({ modal }) {
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
      const source = sourceUrlParts(supplement.sourceUrl);
      const qualityAICount = (supplement.qualityTests || []).filter(test => isSupplementQualityIncludedInAI(test, supplement)).length;
      const ingredientPills = supplement.ingredients?.map(ingredient => {
        const total = ingredientDailyTotal(ingredient, supplement);
        const times = effectiveTimesPerDay(ingredient, supplement);
        const timesText = times && times > 1 ? ` × ${times}/day` : '';
        const totalText = total ? ` → ${formatSupplementTotal(total)}` : '';
        return `<span class="supp-ing-pill">${escapeHTML(ingredient.name)}${ingredient.amount ? ` ${escapeHTML(ingredient.amount)}` : ''}${escapeHTML(timesText)}${escapeHTML(totalText)}</span>`;
      }).join('') || '';
      html += `<div class="supp-list-item${isEdit && editIndex === index ? ' supp-list-item-active' : ''}" data-idx="${index}" role="button" tabindex="0" aria-label="Edit ${escapeHTML(supplement.name)}" ${suppActionAttrs('toggle-accordion', `data-supp-index="${index}"`)}><span class="supp-list-icon">${icon}</span><div class="supp-list-info"><div class="supp-list-name">${escapeHTML(supplement.name)} <span class="supp-status-badge supp-status-${status}">${escapeHTML(status === 'active' ? 'Current' : status)}</span>${supplement.dosage ? ` <span class="supp-list-meta">${escapeHTML(supplement.dosage)}</span>` : ''}</div><div class="supp-list-meta">${dateRange}${source ? ` &middot; <a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer" class="supp-list-source">${escapeHTML(source.host)} ↗</a>` : ''}</div>${ingredientPills ? `<div class="supp-list-ingredients">${ingredientPills}</div>` : ''}${supplement.qualityTests?.length ? `<div class="supp-list-quality">${supplement.qualityTests.length} laboratory result${supplement.qualityTests.length === 1 ? '' : 's'} kept separate from ingredients · ${qualityAICount} in AI context</div>` : ''}${supplement.note ? `<div class="supp-list-note">${escapeHTML(supplement.note)}</div>` : ''}</div></div>`;
      if (isEdit && editIndex === index) html += `<div class="supp-list-expanded" data-expanded-idx="${index}">${renderSupplementImpact(supplement, index)}${suppFormHtml(index, supplement)}</div>`;
    }
    html += '</div>';
  }
  html += `<div class="supp-add-section"><button class="supp-add-btn" ${suppActionAttrs('toggle-add-form')}>+ Add New</button><div id="supp-add-form-area"></div></div>`;
  modal.innerHTML = html;
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
  setTimeout(() => {
    getFormField('supp-name')?.focus();
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function parseScheduleDetails(mode, details) {
  if (mode === 'selected-days') {
    const names = [['sun', 0], ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6]];
    return { daysOfWeek: names.filter(([name]) => new RegExp(`\\b${name}(?:day)?s?\\b`, 'i').test(details)).map(([, day]) => day) };
  }
  if (mode === 'interval') {
    const match = details.match(/(?:every\s*)?(\d+)\s*days?/i);
    const intervalDays = match ? Number(match[1]) : NaN;
    return Number.isInteger(intervalDays) && intervalDays > 0 ? { intervalDays } : {};
  }
  return {};
}

export function saveSupplement(index) {
  const name = getFieldValue('supp-name').trim();
  const dosage = getFieldValue('supp-dosage').trim();
  const type = getFieldValue('supp-type');
  if (!name) { showNotification('Name is required', 'error'); return; }
  const periods = collectPeriods();
  if (!periods.length) { showNotification('At least one period is required', 'error'); return; }
  for (const period of periods) {
    if (!period.start) { showNotification('Each period needs a start date', 'error'); return; }
    if (period.end && period.end < period.start) { showNotification('Period end must be after start', 'error'); return; }
  }
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  for (let periodIndex = 0; periodIndex < sorted.length - 1; periodIndex += 1) {
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
  const maxPerDayRaw = getFieldValue('supp-max-per-day').trim();
  const maxPerDay = maxPerDayRaw ? parseFloat(maxPerDayRaw) : NaN;
  const sourceUrlRaw = getFieldValue('supp-url').trim();
  let sourceUrl = null;
  if (sourceUrlRaw) {
    try {
      sourceUrl = new URL(sourceUrlRaw);
      if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error('Invalid protocol');
    } catch {
      showNotification('Invalid product URL', 'error');
      return;
    }
  }
  const previous = index >= 0 ? state.importedData.supplements?.[index] : null;
  const entry = {
    ...(previous && typeof previous === 'object' ? previous : {}),
    id: getSupplementRecordId(previous) || createSupplementRecordId(),
    schemaVersion: SUPPLEMENT_RECORD_VERSION,
    name, dosage, type,
    startDate: sorted[0].start,
    endDate: sorted[sorted.length - 1].end,
    note: getFieldValue('supp-note').trim(),
    periods: sorted,
    schedule: {
      ...(previous?.schedule && typeof previous.schedule === 'object' ? previous.schedule : {}),
      mode: scheduleMode,
      ...(scheduleDetails ? { details: scheduleDetails } : {}),
      ...(isFinite(maxPerDay) && maxPerDay > 0 ? { maxPerDay } : {}),
      ...parseScheduleDetails(scheduleMode, scheduleDetails),
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
  if (isFinite(servingValue) || servingUnit) entry.servingSize = { ...(isFinite(servingValue) ? { value: servingValue } : {}), ...(servingUnit ? { unit: servingUnit } : {}) };
  else delete entry.servingSize;
  const latestDose = sorted[sorted.length - 1]?.dose;
  if (latestDose) entry.currentDose = latestDose; else delete entry.currentDose;
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
  if (index >= 0) replaceImportedArrayItem(state.importedData, 'supplements', index, entry);
  else appendImportedArrayItem(state.importedData, 'supplements', entry);
  saveImportedData();
  showNotification(index >= 0 ? 'Item updated' : 'Item added', 'success');
  const section = document.querySelector('.supp-timeline-section');
  if (section) section.outerHTML = renderSupplementsSection();
  openSupplementsEditor(index >= 0 ? index : state.importedData.supplements.length - 1);
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

function closeSupplementPeriod(index, lifecycleState) {
  const previous = state.importedData.supplements?.[index];
  if (!previous) return;
  const today = localDateKey();
  const formMatches = Number.parseInt(document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') || '', 10) === index;
  const reason = formMatches ? getFieldValue('supp-end-reason').trim() : '';
  let changed = false;
  const periods = getSupplementPeriods(previous).map(period => {
    if (period?.start && period.start <= today && !period.end) {
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
  replaceImportedArrayItem(state.importedData, 'supplements', index, entry);
  saveImportedData();
  showNotification(lifecycleState === 'paused' ? 'Item paused and moved out of Current' : 'Item ended and moved to History', 'success');
  refreshSupplementSurfaces(index);
}

export function pauseSupplement(index) { closeSupplementPeriod(index, 'paused'); }
export function endSupplement(index) { closeSupplementPeriod(index, 'ended'); }

export function restartSupplement(index) {
  const previous = state.importedData.supplements?.[index];
  if (!previous) return;
  if (getSupplementStatus(previous) === 'active') { showNotification('This item is already current.', 'info'); return; }
  const today = localDateKey();
  const periods = getSupplementPeriods(previous).map(period => ({ ...period }));
  const latest = periods[periods.length - 1];
  if (latest?.end === today) latest.end = null;
  else periods.push({ start: today, end: null, ...(previous.currentDose ? { dose: previous.currentDose } : {}) });
  replaceImportedArrayItem(state.importedData, 'supplements', index, {
    ...previous, periods, startDate: periods[0]?.start || today, endDate: null,
    lifecycle: { ...(previous.lifecycle || {}), state: 'active', changedAt: Date.now() }, updatedAt: Date.now(),
  });
  saveImportedData();
  showNotification('Item restarted. Review the current dose and schedule.', 'success');
  refreshSupplementSurfaces(index);
}

export function beginSupplementDoseChange(index) {
  const previous = state.importedData.supplements?.[index];
  if (!previous || getSupplementStatus(previous) !== 'active') return;
  const today = localDateKey();
  const openRow = Array.from(document.querySelectorAll('#supp-periods .supp-period-row'))
    .find(row => !getElementValue(row.querySelector('.supp-period-end')));
  if (!openRow) return;
  if (getElementValue(openRow.querySelector('.supp-period-start')) === today) {
    const dose = openRow.querySelector('.supp-period-dose');
    if (dose instanceof HTMLElement) dose.focus();
    showNotification('Update today’s dose, then save.', 'info');
    return;
  }
  const end = openRow.querySelector('.supp-period-end');
  if (end instanceof HTMLInputElement) end.value = previousDateKey(today);
  addPeriodRow({ start: today, end: null, dose: '' });
  const doseInputs = document.querySelectorAll('#supp-periods .supp-period-dose');
  const latestDose = doseInputs[doseInputs.length - 1];
  if (latestDose instanceof HTMLElement) latestDose.focus();
  showNotification('A new period starts today. Enter the new dose and save.', 'info');
}

export async function deleteSupplement(index) {
  const supplement = state.importedData.supplements?.[index];
  if (!supplement) return;
  const confirmed = await showConfirmDialog(`Permanently delete "${supplement.name}" and its full usage history? Ending it keeps the history and is usually better.`, {
    confirmLabel: 'Delete permanently', tone: 'danger', ariaLabel: 'Delete supplement or medication',
  });
  if (!confirmed) return;
  deleteImportedArrayItem(state.importedData, 'supplements', index);
  saveImportedData();
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
  openEditor: openSupplementsEditor,
  toggleAccordion: toggleSuppAccordion,
  toggleAddForm: showAddSuppForm,
  closeModal: closeSupplementModal,
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
  pause: pauseSupplement,
  end: endSupplement,
  restart: restartSupplement,
  changeDose: beginSupplementDoseChange,
  applyImport: applySupplementImportDraft,
  keepSafetyQuality: keepSafetyFocusedImportQuality,
  discardImport: discardSupplementImportDraft,
  refreshImpact: refreshSupplementImpact,
  updateIngredientTotal: updateIngTotal,
  updateAllIngredientTotals: updateAllIngTotals,
  updateIngredientUnit,
});
