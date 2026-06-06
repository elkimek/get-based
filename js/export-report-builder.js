// @ts-check
// export-report-builder.js — PDF report modal builder

import { getActiveData } from './data.js';
import { getAllFlaggedMarkers } from './marker-analysis.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import {
  DEFAULT_REPORT_PRESET,
  REPORT_BUILDER_OVERLAY_ID,
  REPORT_DATE_RANGE_OPTIONS,
  REPORT_LAB_SECTION_IDS,
  REPORT_PRESETS,
  REPORT_SECTION_DEFS,
  exportPDFReport,
  generateReportAISummary,
  getReportPreset,
} from './export-report.js';

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
    const flagText = option.flaggedCount > 0 ? `${option.flaggedCount} flagged` : `${option.markerCount} markers`;
    return `<label class="report-category-row">
      <input type="checkbox" data-report-category="${escapeAttr(option.key)}" data-report-priority="${option.flaggedCount > 0 ? 'true' : 'false'}" ${checked ? 'checked' : ''}>
      <span class="report-category-copy">
        <span class="report-category-title">${escapeHTML(option.label)}</span>
        <span class="report-category-meta">${escapeHTML(flagText)}</span>
      </span>
    </label>`;
  }).join('');
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

  return `<div class="modal-overlay show" id="${REPORT_BUILDER_OVERLAY_ID}" data-report-builder-overlay data-report-preset="${escapeAttr(presetId)}">
    <div class="modal show gb-form-modal report-builder-modal" role="dialog" aria-modal="true" aria-labelledby="report-builder-title">
      <div class="gb-modal-head">
        <div>
          <div class="gb-modal-kicker">Export</div>
          <div class="gb-modal-title" id="report-builder-title">Reports</div>
        </div>
        <button type="button" class="modal-close" aria-label="Close" ${reportBuilderActionAttrs('close')}>&times;</button>
      </div>
      <div class="gb-form-body report-builder-body">
        <div class="report-builder-scroll">
        <div class="report-builder-section">
          <div class="report-builder-label">Report type</div>
          <div class="report-preset-grid">${presetButtons}</div>
        </div>
        <div class="report-builder-section report-builder-two-col">
          <label class="report-builder-field" for="report-date-range">
            <span class="report-builder-label">Date range</span>
            <select id="report-date-range" class="report-builder-select">${dateOptions}</select>
          </label>
          <div class="report-builder-field">
            <span class="report-builder-label">Sections</span>
            <div class="report-section-grid">${renderReportSectionChecks(preset)}</div>
          </div>
        </div>
        <div class="report-builder-section">
          <div class="report-builder-row-head">
            <div class="report-builder-label">Lab categories</div>
            <div class="report-category-actions">
              <button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('select-all-categories')}>All</button>
              <button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('select-priority-categories')}>Priority</button>
              <button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('clear-categories')}>Clear</button>
            </div>
          </div>
          <div class="report-category-list">${renderReportCategoryChecks(categoryOptions, selectedCategoryKeys)}</div>
        </div>
        <div class="report-builder-section report-ai-builder">
          <div class="report-builder-row-head">
            <div>
              <div class="report-builder-label">Practitioner overview</div>
              <div class="report-builder-help">Generate a one-minute clinical picture from the selected report data. Edit it before preview if needed.</div>
            </div>
            <div class="report-ai-actions">
              <button type="button" class="report-mini-btn report-ai-generate-btn" ${reportBuilderActionAttrs('generate-ai-summary')}>Generate</button>
              <button type="button" class="report-mini-btn report-ai-clear-btn" hidden ${reportBuilderActionAttrs('clear-ai-summary')}>Clear</button>
            </div>
          </div>
          <div class="report-ai-status" data-report-ai-status>Not generated.</div>
          <textarea id="report-ai-summary-text" class="report-ai-summary-text" aria-label="Editable practitioner overview" hidden></textarea>
        </div>
        </div>
        <div class="gb-form-actions report-builder-actions">
          <button type="button" class="import-btn import-btn-secondary" ${reportBuilderActionAttrs('close')}>Cancel</button>
          <button type="button" class="import-btn import-btn-primary report-builder-preview-btn" ${reportBuilderActionAttrs('export')}>Preview PDF</button>
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
    delete options.aiSummary;
    const summary = await generateReportAISummary(options);
    if (summary) {
      setReportBuilderAISummary(overlay, summary);
      showNotification('Practitioner overview generated', 'info', 2200);
    } else if (statusEl) {
      statusEl.textContent = 'Not generated.';
    }
  } catch (e) {
    const message = String(e?.message || e || 'Unknown error').slice(0, 180);
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
    openReportBuilder(actionEl.dataset.reportPreset || DEFAULT_REPORT_PRESET);
  } else if (action === 'select-all-categories') {
    setReportCategoryChecks(overlay, 'all');
    clearReportBuilderAISummaryForOptionChange(overlay);
  } else if (action === 'select-priority-categories') {
    setReportCategoryChecks(overlay, 'priority');
    clearReportBuilderAISummaryForOptionChange(overlay);
  } else if (action === 'clear-categories') {
    setReportCategoryChecks(overlay, 'clear');
    clearReportBuilderAISummaryForOptionChange(overlay);
  } else if (action === 'generate-ai-summary') {
    await generateReportBuilderAISummary(overlay, actionEl);
  } else if (action === 'clear-ai-summary') {
    setReportBuilderAISummary(overlay, null);
  } else if (action === 'export') {
    const options = collectReportBuilderOptions(overlay);
    const hasCategories = overlay.querySelectorAll('input[data-report-category]').length > 0;
    const hasLabSection = options.sections.some(section => REPORT_LAB_SECTION_IDS.includes(section));
    if (options.sections.length === 0) {
      showNotification('Choose at least one report section', 'error');
    } else if (hasLabSection && hasCategories && options.categoryKeys.length === 0) {
      showNotification('Choose at least one lab category or turn off lab sections', 'error');
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
  document.body.insertAdjacentHTML('beforeend', renderReportBuilder(normalizedPresetId));
  setTimeout(() => {
    const activePreset = /** @type {HTMLElement | null} */ (document.querySelector(`#${REPORT_BUILDER_OVERLAY_ID} .report-preset-btn.active`));
    activePreset?.focus();
  }, 0);
}

export function closeReportBuilder() {
  document.getElementById(REPORT_BUILDER_OVERLAY_ID)?.remove();
}
