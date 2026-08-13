// @ts-check
// export-report-builder.js — PDF report modal builder

import { getErrorMessage } from './caught-error.js';
import { getActiveData } from './data.js';
import { getAllFlaggedMarkers } from './marker-analysis.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  DEFAULT_REPORT_PRESET,
  REPORT_BUILDER_OVERLAY_ID,
  REPORT_DATE_RANGE_OPTIONS,
  REPORT_LAB_SECTION_IDS,
  REPORT_PRESETS,
  REPORT_SECTION_DEFS,
  generateReportAISummary,
  getReportPreset,
} from './export-report.js';
import { exportPDFReport } from './export-report-html.js';

let reportBuilderDelegatesInstalled = false;

function reportBuilderActionAttrs(action, attrs = {}) {
  const extraAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => ` data-report-${name}="${escapeAttr(String(value))}"`)
    .join('');
  return `data-report-action="${escapeAttr(action)}"${extraAttrs}`;
}

function getReportCategoryOptions(data = getActiveData()) {
  const flags = getAllFlaggedMarkers(data);
  const flagCounts = new Map();
  for (const flag of flags) {
    flagCounts.set(flag.categoryKey, (flagCounts.get(flag.categoryKey) || 0) + 1);
  }
  return Object.entries(data.categories || {}).map(([key, cat]) => {
    const markers = Object.values(cat.markers || {}).filter(marker => !marker.hidden);
    const markerCount = markers.filter(marker => marker.values?.some(value => value !== null)).length;
    if (markerCount === 0) return null;
    return {
      key,
      label: cat.label || key,
      markerCount,
      flaggedCount: flagCounts.get(key) || 0,
    };
  }).filter(Boolean);
}

function getDefaultReportCategoryKeys(presetId, categoryOptions) {
  const preset = getReportPreset(presetId);
  if (preset.categoryMode === 'priority') {
    const flagged = categoryOptions.filter(option => option.flaggedCount > 0);
    if (flagged.length > 0) return flagged.map(option => option.key);
  }
  return categoryOptions.map(option => option.key);
}

function renderReportPresetButton(presetId, activePresetId) {
  const preset = getReportPreset(presetId);
  const isActive = presetId === activePresetId;
  return `<button type="button" class="report-preset-btn${isActive ? ' active' : ''}" ${reportBuilderActionAttrs('set-preset', { preset: presetId })} aria-pressed="${isActive}">
    <span class="report-preset-title">${escapeHTML(preset.label)}</span>
    <span class="report-preset-meta">${escapeHTML(preset.subtitle)}</span>
  </button>`;
}

function renderReportSectionChecks(preset) {
  const selected = new Set(preset.sections);
  return REPORT_SECTION_DEFS.map(section => `<label class="report-builder-check">
    <input type="checkbox" data-report-section="${escapeAttr(section.id)}" ${selected.has(section.id) ? 'checked' : ''}>
    <span>${escapeHTML(section.label)}</span>
  </label>`).join('');
}

function renderReportCategoryChecks(categoryOptions, selectedCategoryKeys) {
  const selected = new Set(selectedCategoryKeys);
  if (categoryOptions.length === 0) {
    return `<div class="report-builder-empty">No lab categories with data.</div>`;
  }
  return categoryOptions.map(option => {
    const checked = selected.has(option.key);
    const markerText = `${option.markerCount} marker${option.markerCount === 1 ? '' : 's'}`;
    const flagText = option.flaggedCount > 0
      ? `${markerText} · ${option.flaggedCount} flagged`
      : markerText;
    return `<label class="report-category-row">
      <input type="checkbox" data-report-category="${escapeAttr(option.key)}" data-report-priority="${option.flaggedCount > 0 ? 'true' : 'false'}" ${checked ? 'checked' : ''}>
      <span class="report-category-copy">
        <span class="report-category-title">${escapeHTML(option.label)}</span>
        <span class="report-category-meta">${escapeHTML(flagText)}</span>
      </span>
    </label>`;
  }).join('');
}

function formatSelectionCount(selected, total, noun) {
  const label = total === 1
    ? noun
    : (noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`);
  return `${selected} of ${total} ${label}`;
}

function renderReportBuilder(presetId = DEFAULT_REPORT_PRESET) {
  const preset = getReportPreset(presetId);
  const rawData = getActiveData();
  const categoryOptions = getReportCategoryOptions(rawData);
  const selectedCategoryKeys = getDefaultReportCategoryKeys(presetId, categoryOptions);
  const presetButtons = Object.keys(REPORT_PRESETS)
    .map(id => renderReportPresetButton(id, presetId))
    .join('');
  const dateOptions = REPORT_DATE_RANGE_OPTIONS.map(option =>
    `<option value="${escapeAttr(option.value)}" ${preset.dateRange === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`
  ).join('');

  const selectedSectionCount = preset.sections.length;
  const selectedCategoryCount = selectedCategoryKeys.length;
  const priorityAction = categoryOptions.some(option => option.flaggedCount > 0)
    ? `<button type="button" class="report-mini-btn" aria-label="Select lab categories with flagged results" ${reportBuilderActionAttrs('select-priority-categories')}>Flagged</button>`
    : '';
  const categoryActions = categoryOptions.length ? `<div class="report-category-actions">
    <button type="button" class="report-mini-btn" aria-label="Select all lab categories" ${reportBuilderActionAttrs('select-all-categories')}>All</button>
    ${priorityAction}
    <button type="button" class="report-mini-btn" aria-label="Clear selected lab categories" ${reportBuilderActionAttrs('clear-categories')}>Clear</button>
  </div>` : '';

  return `<div class="modal-overlay" id="${REPORT_BUILDER_OVERLAY_ID}" data-report-builder-overlay data-report-preset="${escapeAttr(presetId)}">
    <div class="modal gb-form-modal report-builder-modal" role="dialog" aria-modal="true" aria-labelledby="report-builder-title">
      <div class="gb-modal-head">
        <div>
          <div class="gb-modal-kicker">Reports</div>
          <div class="gb-modal-title" id="report-builder-title">Create a report</div>
        </div>
        <button type="button" class="modal-close" aria-label="Close" ${reportBuilderActionAttrs('close')}>&times;</button>
      </div>
      <div class="gb-form-body report-builder-body">
        <div class="report-builder-scroll">
        <div class="report-builder-intro">
          <div>
            <div class="report-builder-intro-title">Choose what you want to share</div>
            <div class="report-builder-help">Build a print-ready view of this profile. The preview is created locally in your browser.</div>
          </div>
          <span class="report-builder-local-badge">Local preview</span>
        </div>
        <div class="report-builder-section">
          <div class="report-builder-section-head">
            <div class="report-builder-section-title">Start with a template</div>
            <div class="report-builder-help">Templates set the initial range and sections. You can adjust everything below.</div>
          </div>
          <div class="report-preset-grid">${presetButtons}</div>
        </div>
        <div class="report-builder-section report-builder-two-col">
          <label class="report-builder-field" for="report-date-range">
            <span class="report-builder-label">Date range</span>
            <select id="report-date-range" class="report-builder-select">${dateOptions}</select>
          </label>
          <div class="report-builder-field">
            <div class="report-builder-field-head">
              <span class="report-builder-label">Sections</span>
              <span class="report-selection-count" data-report-section-count>${escapeHTML(formatSelectionCount(selectedSectionCount, REPORT_SECTION_DEFS.length, 'section'))}</span>
            </div>
            <div class="report-section-grid">${renderReportSectionChecks(preset)}</div>
          </div>
        </div>
        <div class="report-builder-section">
          <div class="report-builder-row-head">
            <div class="report-builder-section-head">
              <div class="report-builder-field-head">
                <span class="report-builder-section-title">Lab categories</span>
                <span class="report-selection-count" data-report-category-count>${categoryOptions.length ? escapeHTML(formatSelectionCount(selectedCategoryCount, categoryOptions.length, 'category')) : 'No lab data'}</span>
              </div>
              <div class="report-builder-help">Choose which imported lab groups appear in lab-based sections.</div>
            </div>
            ${categoryActions}
          </div>
          <div class="report-category-list">${renderReportCategoryChecks(categoryOptions, selectedCategoryKeys)}</div>
        </div>
        <div class="report-builder-section report-ai-builder">
          <div class="report-builder-row-head">
            <div>
              <div class="report-builder-section-title">Practitioner overview <span class="report-optional-label">Optional</span></div>
              <div class="report-builder-help">Generating may share the report data selected above with your active AI provider. Preview works without it.</div>
            </div>
            <div class="report-ai-actions">
              <button type="button" class="report-mini-btn report-ai-generate-btn" ${reportBuilderActionAttrs('generate-ai-summary')}>Generate overview</button>
              <button type="button" class="report-mini-btn report-ai-clear-btn" hidden ${reportBuilderActionAttrs('clear-ai-summary')}>Clear</button>
            </div>
          </div>
          <div class="report-ai-status" data-report-ai-status aria-live="polite">Not generated.</div>
          <textarea id="report-ai-summary-text" class="report-ai-summary-text" aria-label="Editable practitioner overview" hidden></textarea>
        </div>
        </div>
        <div class="gb-form-actions report-builder-actions">
          <div class="report-builder-selection-summary" id="report-builder-selection-summary" data-report-selection-summary aria-live="polite">${escapeHTML(`${selectedSectionCount} sections${categoryOptions.length ? ` · ${selectedCategoryCount} lab categories` : ' · no lab data'}`)}</div>
          <div class="report-builder-footer-buttons">
            <button type="button" class="import-btn import-btn-secondary" ${reportBuilderActionAttrs('close')}>Cancel</button>
            <button type="button" class="import-btn import-btn-primary report-builder-preview-btn" aria-describedby="report-builder-selection-summary" ${reportBuilderActionAttrs('export')}>Preview PDF</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function collectReportBuilderOptions(overlay) {
  const aiText = overlay.querySelector('#report-ai-summary-text')?.value?.trim() || '';
  const options = {
    preset: overlay.dataset.reportPreset || DEFAULT_REPORT_PRESET,
    dateRange: overlay.querySelector('#report-date-range')?.value || 'current',
    sections: Array.from(overlay.querySelectorAll('input[data-report-section]:checked'))
      .map(input => input.dataset.reportSection),
    categoryKeys: Array.from(overlay.querySelectorAll('input[data-report-category]:checked'))
      .map(input => input.dataset.reportCategory),
  };
  if (aiText) {
    const aiEl = overlay.querySelector('#report-ai-summary-text');
    options.aiSummary = {
      text: aiText,
      generatedAt: aiEl?.dataset.reportAiGeneratedAt || '',
      model: aiEl?.dataset.reportAiModel || '',
      provider: aiEl?.dataset.reportAiProvider || '',
      modelId: aiEl?.dataset.reportAiModelId || '',
    };
  }
  return options;
}

function getReportBuilderSelectionError(overlay, options) {
  if (options.sections.length === 0) return 'Choose at least one report section';
  const hasCategories = overlay.querySelectorAll('input[data-report-category]').length > 0;
  const hasLabSection = options.sections.some(section => REPORT_LAB_SECTION_IDS.includes(section));
  if (hasLabSection && hasCategories && options.categoryKeys.length === 0) {
    return 'Choose at least one lab category or turn off lab sections';
  }
  return '';
}

function setReportCategoryChecks(overlay, mode) {
  const boxes = Array.from(overlay.querySelectorAll('input[data-report-category]'));
  if (mode === 'clear') {
    boxes.forEach(box => { box.checked = false; });
    return;
  }
  if (mode === 'priority') {
    const hasPriority = boxes.some(box => box.dataset.reportPriority === 'true');
    boxes.forEach(box => { box.checked = hasPriority ? box.dataset.reportPriority === 'true' : true; });
    return;
  }
  boxes.forEach(box => { box.checked = true; });
}

function updateReportBuilderSelectionState(overlay) {
  const sectionBoxes = Array.from(overlay.querySelectorAll('input[data-report-section]'));
  const categoryBoxes = Array.from(overlay.querySelectorAll('input[data-report-category]'));
  const selectedSections = sectionBoxes.filter(box => box.checked).length;
  const selectedCategories = categoryBoxes.filter(box => box.checked).length;
  const sectionCount = overlay.querySelector('[data-report-section-count]');
  const categoryCount = overlay.querySelector('[data-report-category-count]');
  const summary = overlay.querySelector('[data-report-selection-summary]');
  if (sectionCount) sectionCount.textContent = formatSelectionCount(selectedSections, sectionBoxes.length, 'section');
  if (categoryCount) {
    categoryCount.textContent = categoryBoxes.length
      ? formatSelectionCount(selectedCategories, categoryBoxes.length, 'category')
      : 'No lab data';
  }
  if (summary) {
    summary.textContent = `${selectedSections} section${selectedSections === 1 ? '' : 's'}${categoryBoxes.length
      ? ` · ${selectedCategories} lab categor${selectedCategories === 1 ? 'y' : 'ies'}`
      : ' · no lab data'}`;
  }
}

function applyReportPreset(overlay, presetId) {
  const normalizedPresetId = REPORT_PRESETS[presetId] ? presetId : DEFAULT_REPORT_PRESET;
  const preset = getReportPreset(normalizedPresetId);
  overlay.dataset.reportPreset = normalizedPresetId;
  overlay.querySelectorAll('[data-report-action="set-preset"]').forEach(button => {
    const active = button.dataset.reportPreset === normalizedPresetId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const range = overlay.querySelector('#report-date-range');
  if (range) range.value = preset.dateRange;
  const selectedSections = new Set(preset.sections);
  overlay.querySelectorAll('input[data-report-section]').forEach(box => {
    box.checked = selectedSections.has(box.dataset.reportSection);
  });
  setReportCategoryChecks(overlay, preset.categoryMode === 'priority' ? 'priority' : 'all');
  clearReportBuilderAISummaryForOptionChange(overlay);
  updateReportBuilderSelectionState(overlay);
}

function setReportBuilderAISummary(overlay, summary) {
  const textEl = overlay.querySelector('#report-ai-summary-text');
  const statusEl = overlay.querySelector('[data-report-ai-status]');
  const clearBtn = overlay.querySelector('[data-report-action="clear-ai-summary"]');
  if (!textEl || !statusEl) return;
  if (!summary?.text) {
    textEl.value = '';
    textEl.hidden = true;
    delete textEl.dataset.reportAiGeneratedAt;
    delete textEl.dataset.reportAiModel;
    delete textEl.dataset.reportAiProvider;
    delete textEl.dataset.reportAiModelId;
    statusEl.textContent = 'Not generated.';
    if (clearBtn) clearBtn.hidden = true;
    return;
  }
  textEl.value = summary.text;
  textEl.hidden = false;
  textEl.dataset.reportAiGeneratedAt = summary.generatedAt || '';
  textEl.dataset.reportAiModel = summary.model || '';
  textEl.dataset.reportAiProvider = summary.provider || '';
  textEl.dataset.reportAiModelId = summary.modelId || '';
  statusEl.textContent = `Generated${summary.model ? ` with ${summary.model}` : ''}. Editable before preview.`;
  if (clearBtn) clearBtn.hidden = false;
}

function clearReportBuilderAISummaryForOptionChange(overlay) {
  const textEl = overlay?.querySelector('#report-ai-summary-text');
  if (!textEl?.value) return;
  setReportBuilderAISummary(overlay, null);
  const statusEl = overlay.querySelector('[data-report-ai-status]');
  if (statusEl) statusEl.textContent = 'Report options changed. Generate again for a practitioner overview.';
}

async function generateReportBuilderAISummary(overlay, actionEl) {
  const statusEl = overlay.querySelector('[data-report-ai-status]');
  const previousText = actionEl.textContent;
  actionEl.disabled = true;
  actionEl.textContent = 'Generating...';
  if (statusEl) statusEl.textContent = 'Generating practitioner overview...';
  try {
    const options = collectReportBuilderOptions(overlay);
    const selectionError = getReportBuilderSelectionError(overlay, options);
    if (selectionError) {
      if (statusEl) statusEl.textContent = `${selectionError}.`;
      showNotification(selectionError, 'error');
      return;
    }
    delete options.aiSummary;
    const summary = await generateReportAISummary(options);
    if (summary) {
      setReportBuilderAISummary(overlay, summary);
      showNotification('Practitioner overview generated', 'info', 2200);
    } else if (statusEl) {
      statusEl.textContent = 'Not generated.';
    }
  } catch (e) {
    const message = String(getErrorMessage(e, e) || 'Unknown error').slice(0, 180);
    if (statusEl) statusEl.textContent = 'Generation failed. Try again or preview without the overview.';
    showNotification('AI summary failed: ' + message, 'error');
  } finally {
    actionEl.disabled = false;
    actionEl.textContent = previousText || 'Generate';
  }
}

async function handleReportBuilderClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const actionEl = target?.closest('[data-report-action]');
  const overlay = actionEl?.closest(`#${REPORT_BUILDER_OVERLAY_ID}`);
  if (!actionEl || !overlay) return;
  const action = actionEl.dataset.reportAction;
  event.preventDefault();
  if (action === 'close') {
    closeReportBuilder();
  } else if (action === 'set-preset') {
    applyReportPreset(overlay, actionEl.dataset.reportPreset || DEFAULT_REPORT_PRESET);
  } else if (action === 'select-all-categories') {
    setReportCategoryChecks(overlay, 'all');
    clearReportBuilderAISummaryForOptionChange(overlay);
    updateReportBuilderSelectionState(overlay);
  } else if (action === 'select-priority-categories') {
    setReportCategoryChecks(overlay, 'priority');
    clearReportBuilderAISummaryForOptionChange(overlay);
    updateReportBuilderSelectionState(overlay);
  } else if (action === 'clear-categories') {
    setReportCategoryChecks(overlay, 'clear');
    clearReportBuilderAISummaryForOptionChange(overlay);
    updateReportBuilderSelectionState(overlay);
  } else if (action === 'generate-ai-summary') {
    await generateReportBuilderAISummary(overlay, actionEl);
  } else if (action === 'clear-ai-summary') {
    setReportBuilderAISummary(overlay, null);
  } else if (action === 'export') {
    const options = collectReportBuilderOptions(overlay);
    const selectionError = getReportBuilderSelectionError(overlay, options);
    if (selectionError) {
      showNotification(selectionError, 'error');
    } else if (exportPDFReport(options)) {
      closeReportBuilder();
    }
  } else {
    return;
  }
}

function handleReportBuilderChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  const overlay = target?.closest(`#${REPORT_BUILDER_OVERLAY_ID}`);
  if (!target || !overlay) return;
  if (
    target.matches('#report-date-range') ||
    target.matches('input[data-report-section]') ||
    target.matches('input[data-report-category]')
  ) {
    clearReportBuilderAISummaryForOptionChange(overlay);
    updateReportBuilderSelectionState(overlay);
  }
}

function installReportBuilderDelegates() {
  if (reportBuilderDelegatesInstalled || typeof document === 'undefined') return;
  reportBuilderDelegatesInstalled = true;
  document.addEventListener('click', handleReportBuilderClick);
  document.addEventListener('change', handleReportBuilderChange);
}

export function openReportBuilder(presetId = DEFAULT_REPORT_PRESET) {
  if (typeof document === 'undefined') return;
  const normalizedPresetId = REPORT_PRESETS[presetId] ? presetId : DEFAULT_REPORT_PRESET;
  closeReportBuilder();
  installReportBuilderDelegates();
  const template = document.createElement('template');
  template.innerHTML = renderReportBuilder(normalizedPresetId).trim();
  const overlay = template.content.firstElementChild;
  if (!(overlay instanceof HTMLElement)) return;
  openAppendedModalOverlay(overlay, closeReportBuilder, { initialFocus: '.report-preset-btn.active', focusDelay: 50 });
  updateReportBuilderSelectionState(overlay);
}

export function closeReportBuilder() {
  const overlay = document.getElementById(REPORT_BUILDER_OVERLAY_ID);
  if (overlay) removeModalOverlay(overlay);
}
