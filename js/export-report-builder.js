// @ts-check
// export-report-builder.js — PDF report modal builder

import { state } from './state.js';
import { getErrorMessage, getErrorName } from './caught-error.js';
import { getActiveData } from './data.js';
import { getAllFlaggedMarkers } from './marker-analysis.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  DEFAULT_REPORT_PRESET,
  REPORT_BUILDER_OVERLAY_ID,
  REPORT_DATE_RANGE_OPTIONS,
  REPORT_RANGE_MODE_OPTIONS,
  REPORT_LAB_SECTION_IDS,
  REPORT_PRESETS,
  REPORT_SECTION_DEFS,
  generateReportAISummary,
  buildPreparedReportPayload,
  buildReportContextSections,
  getReportPreset,
} from './export-report.js';
import { startReportProgress, cancelReportProgress } from './export-report-progress.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { exportPDFReport, openReportPreviewWindow } from './export-report-html.js';

let reportBuilderDelegatesInstalled = false;
const reportNoteSnapshots = new WeakMap();
const reportAISnapshots = new WeakMap();
const BUILDER_SECTIONS = REPORT_SECTION_DEFS.filter(section => !['flagged', 'summary', 'trends'].includes(section.id)).map(section => ({ ...section, label: ({ categories: 'Lab results', genetics: 'Genome', context: 'Personal context', nutrition: 'Nutrition and hydration', wearables: 'Body and wearables', light: 'Sun and light sessions', environment: 'Environment', notes: 'Timeline notes' })[section.id] || section.label }));
const HISTORY_SECTIONS = ['categories', 'supplements', 'notes', 'context', 'nutrition', 'wearables', 'light', 'environment'];
function selectedReportSections(overlay) {
  return Array.from(overlay.querySelectorAll('input[data-report-section]:checked')).flatMap(input => input.dataset.reportSection === 'categories' ? REPORT_LAB_SECTION_IDS : [input.dataset.reportSection]);
}

function isReportTemplateCustomized(overlay) {
  const preset = getReportPreset(overlay.dataset.reportPreset);
  const sections = selectedReportSections(overlay);
  const categories = Array.from(overlay.querySelectorAll('[data-report-category]'));
  return overlay.querySelector('#report-date-range')?.value !== preset.dateRange
    || sections.length !== preset.sections.length || sections.some(section => !preset.sections.includes(section))
    || (sections.includes('categories') && categories.some(input => !input.checked));
}

function reportBuilderActionAttrs(action, attrs = {}) {
  const extraAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value != null)
    .map(([name, value]) => ` data-report-${name}="${escapeAttr(String(value))}"`)
    .join('');
  return `data-report-action="${escapeAttr(action)}"${extraAttrs}`;
}

function getReportCategoryOptions(data = getActiveData(), rangeMode = state.rangeMode) {
  const flags = getAllFlaggedMarkers(data, rangeMode);
  const flagCounts = new Map();
  for (const flag of flags) {
    flagCounts.set(flag.categoryKey, (flagCounts.get(flag.categoryKey) || 0) + 1);
  }
  return Object.entries(data.categories || {}).map(([key, cat]) => {
    const markers = Object.values(cat.markers || {}).filter(marker => !marker.hidden);
    const markerCount = markers.filter(marker => marker.values?.some(value => value != null)).length;
    if (markerCount === 0) return null;
    return {
      key,
      label: cat.label || key,
      markerCount,
      flaggedCount: flagCounts.get(key) || 0,
    };
  }).filter(option => option !== null);
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
  return BUILDER_SECTIONS.map(section => `<label class="report-builder-check">
    <input type="checkbox" data-report-section="${escapeAttr(section.id)}" ${selected.has(section.id) ? 'checked' : ''}>
    <span>${escapeHTML(section.label)}</span>
  </label>`).join('');
}

function renderReportNoteReview() {
  const notes = state.importedData.notes || [];
  return `<details class="report-options-details" data-report-for="notes"><summary>Manage notes <span class="report-options-meta">${notes.length} stored</span></summary><div class="report-options-body">
    <p class="report-builder-help">Timeline notes are also in Dashboard → Add widget → Labs → Notes. Older notes do not establish their original author. Turn off Timeline notes above to omit them.</p>
    <p class="report-builder-help">Edit or delete opens the note editor. Reopen Create a report after saving your changes.</p>
    ${notes.map((note, index) => ({ note, index })).sort((a, b) => String(b.note.date || '').localeCompare(String(a.note.date || ''))).map(({ note, index }) => `<div class="report-note-review"><strong>${escapeHTML(note.date || 'Undated')}</strong><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHTML(note.text || '')}</p><button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('edit-note', { index })}>Edit or delete</button></div>`).join('') || '<p>No timeline notes recorded.</p>'}
  </div></details>`;
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
  const aiAvailable = hasAssistantFeatureProvider();
  const rawData = getActiveData();
  const categoryOptions = getReportCategoryOptions(rawData);
  const selectedCategoryKeys = categoryOptions.map(option => option.key);
  const presetButtons = Object.keys(REPORT_PRESETS)
    .map(id => renderReportPresetButton(id, presetId))
    .join('');
  const dateOptions = REPORT_DATE_RANGE_OPTIONS.map(option =>
    `<option value="${escapeAttr(option.value)}" ${preset.dateRange === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`
  ).join('');

  return `<div class="modal-overlay" id="${REPORT_BUILDER_OVERLAY_ID}" data-report-builder-overlay data-report-preset="${escapeAttr(presetId)}">
    <div class="modal gb-form-modal report-builder-modal" role="dialog" aria-modal="true" aria-labelledby="report-builder-title">
      <div class="gb-modal-head"><div class="gb-modal-title" id="report-builder-title">Create a report</div><button type="button" class="modal-close" aria-label="Close" ${reportBuilderActionAttrs('close')}>&times;</button></div>
      <div class="gb-form-body report-builder-body"><div class="report-builder-scroll">
        <p class="report-builder-help report-intro-copy">Choose personal records to review or share. Your PDF preview is created locally.</p>
        <div class="report-builder-section">
          <div class="report-builder-field-head"><span class="report-builder-section-title">Start with a template</span><span class="report-selection-count" data-report-template-customized hidden>Customized</span></div>
          <div class="report-preset-grid">${presetButtons}</div>
          <p class="report-builder-help" data-report-template-description>${escapeHTML(preset.description)}</p>
          <p class="report-builder-help">Templates set sections and dates. Result ranges, questions, detail and AI preferences stay as you choose them.</p>
        </div>
        <div class="report-builder-section">
          <div class="report-builder-two-col">
            <label class="report-builder-field" for="report-date-range"><span class="report-builder-label">Date range</span><select id="report-date-range" class="report-builder-select">${dateOptions}</select></label>
            <label class="report-builder-field" for="report-range-mode"><span class="report-builder-label">Result ranges</span><select id="report-range-mode" class="report-builder-select" aria-describedby="report-range-help">${REPORT_RANGE_MODE_OPTIONS.map(option => `<option value="${option.value}" ${option.value === state.rangeMode ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
          </div>
          <p class="report-builder-help" id="report-range-help">Applies only to this report. Lab ranges use app or custom references when unavailable. Optimal and Both flag against optimal ranges where available; phase-specific reference ranges take precedence.</p>
          <fieldset class="report-detail-options"><legend class="report-builder-label">Report detail</legend><div class="report-section-grid">
            <label class="report-builder-check report-detail-card"><input type="radio" name="report-detail" value="summary" checked><span><strong>Concise summary</strong><small>Key results and averages for a quick review.</small></span></label>
            <label class="report-builder-check report-detail-card"><input type="radio" name="report-detail" value="appendix"><span><strong>Include detailed records</strong><small>Add selected histories and full notes as an appendix.</small></span></label>
          </div></fieldset>
        </div>
        <div class="report-builder-section">
          <div class="report-builder-field-head"><span class="report-builder-section-title">Include in the report</span><span class="report-selection-count" data-report-section-count></span></div>
          <div class="report-section-grid">${renderReportSectionChecks(preset)}</div>
          <p class="report-builder-help">Lab results include ranges, flags and trends. Genome uses the findings choice below.</p>
          <details class="report-options-details" data-report-for="categories"><summary>Lab categories <span class="report-options-meta" data-report-category-count></span></summary><div class="report-options-body">
            <div class="report-category-actions"><button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('select-all-categories')}>All</button><button type="button" class="report-mini-btn" aria-label="Select lab categories with flagged results" ${reportBuilderActionAttrs('select-priority-categories')}>Flagged</button><button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('clear-categories')}>Clear</button></div>
            <div class="report-category-list">${renderReportCategoryChecks(categoryOptions, selectedCategoryKeys)}</div>
          </div></details>
          <div class="report-genome-options" data-report-for="genetics"><label class="report-builder-field" for="report-genome-mode"><span class="report-builder-label">Genome findings</span><select id="report-genome-mode" class="report-builder-select"><option value="risks">Risk associations</option><option value="risks-traits">Risks and traits</option><option value="traits">Traits only</option><option value="all">All findings, including protective and reference calls</option></select></label><p class="report-builder-help">Uses your genotype’s current catalog interpretation. Associations are not diagnoses. Adding an appendix does not expand this selection.</p></div>
          <details class="report-options-details" data-report-for="context"><summary>Personal context <span class="report-options-meta">Choose what to share</span></summary><div class="report-options-body"><div class="report-section-grid">${buildReportContextSections(rawData).map(section => `<label class="report-builder-check"><input type="checkbox" data-report-context="${escapeAttr(section.title)}" checked><span>${escapeHTML(section.title)}</span></label>`).join('') || '<p class="report-builder-help">No personal context recorded.</p>'}</div></div></details>
          ${renderReportNoteReview()}
        </div>
        <div class="report-builder-section">
          <label class="report-builder-field" for="report-purpose"><span class="report-builder-section-title">Reason for sharing / questions <span class="report-optional-label">Optional</span></span><textarea id="report-purpose" class="report-builder-select" rows="3" maxlength="1200" placeholder="What would you like to ask or discuss?"></textarea></label>
          <p class="report-builder-help">Appears at the start of your report and guides the overview, if you generate one.</p>
        </div>
        <div class="report-builder-section report-ai-builder">
          <div class="report-builder-row-head"><div><label class="report-builder-check"><input type="checkbox" id="report-include-ai" ${aiAvailable ? 'checked' : 'disabled'} aria-describedby="report-ai-disclosure"><span>Include AI overview</span></label><p class="report-builder-help">Add an AI-generated opening overview of recorded highlights, context and your questions. It is informational and may be incomplete or incorrect.</p></div></div>
          <p class="report-builder-help" id="report-ai-disclosure">${aiAvailable ? 'Generate AI overview &amp; preview uses your selected AI connection to process the selected report facts and questions. AI can make mistakes; verify the overview before sharing. Any required AI disclosure or destination approval appears before the request. You can turn off the overview to compile this report without a new AI request.' : 'AI is unavailable or paused. PDF preview works without a new AI overview.'}</p>
          <div class="report-ai-actions"><button type="button" class="report-mini-btn report-ai-generate-btn" ${reportBuilderActionAttrs('generate-ai-summary')} hidden>Generate overview</button><button type="button" class="report-mini-btn report-ai-clear-btn" hidden ${reportBuilderActionAttrs('clear-ai-summary')}>Remove overview</button><button type="button" class="report-mini-btn" hidden ${reportBuilderActionAttrs('preview-without-ai')}>Preview without AI</button></div>
          <div class="report-ai-status" data-report-ai-status aria-live="polite">${aiAvailable ? 'Ready to generate with your preview.' : 'Not included.'}</div>
          <textarea id="report-ai-summary-text" class="report-ai-summary-text" aria-label="Editable AI-generated overview" hidden></textarea>
        </div>
      </div><div class="gb-form-actions report-builder-actions"><div class="report-builder-selection-summary" id="report-builder-selection-summary" data-report-selection-summary aria-live="polite"></div><div class="report-builder-footer-buttons"><button type="button" class="import-btn import-btn-secondary" ${reportBuilderActionAttrs('close')}>Cancel</button><button type="button" class="import-btn import-btn-primary report-builder-preview-btn" aria-describedby="report-builder-selection-summary" ${reportBuilderActionAttrs('export')}>Preview PDF</button></div></div></div>
    </div></div>`;
}

function collectReportBuilderOptions(overlay) {
  const previous = reportAISnapshots.get(overlay);
  if (previous && (previous.profile !== state.currentProfile)) {
    setReportBuilderAISummary(overlay, null);
    const status = overlay.querySelector('[data-report-ai-status]');
    if (status) status.textContent = 'Profile data changed. Generate the overview again.';
  }
  const aiText = overlay.querySelector('#report-ai-summary-text')?.value?.trim() || '';
  const sections = selectedReportSections(overlay);
  const options = {
    preset: overlay.dataset.reportPreset || DEFAULT_REPORT_PRESET,
    presetLabel: getReportPreset(overlay.dataset.reportPreset).label + (isReportTemplateCustomized(overlay) ? ' (customized)' : ''),
    dateRange: overlay.querySelector('#report-date-range')?.value || 'current',
    rangeMode: overlay.querySelector('#report-range-mode')?.value || 'optimal',
    purpose: overlay.querySelector('#report-purpose')?.value || '',
    appendixSections: overlay.querySelector('[name="report-detail"]:checked')?.value === 'appendix' ? sections.filter(id => HISTORY_SECTIONS.includes(id)) : [],
    contextTitles: Array.from(overlay.querySelectorAll('[data-report-context]:checked')).map(input => input.dataset.reportContext),
    genomeMode: overlay.querySelector('#report-genome-mode')?.value || 'risks',
    sections,
    categoryKeys: Array.from(overlay.querySelectorAll('input[data-report-category]:checked'))
      .map(input => input.dataset.reportCategory),
  };
  if (aiText && overlay.querySelector('#report-include-ai')?.checked) {
    const aiEl = overlay.querySelector('#report-ai-summary-text');
    options.aiSummary = {
      text: aiText,
      generatedAt: aiEl?.dataset.reportAiGeneratedAt || '',
      model: aiEl?.dataset.reportAiModel || '',
      provider: aiEl?.dataset.reportAiProvider || '',
      modelId: aiEl?.dataset.reportAiModelId || '',
      agentId: aiEl?.dataset.reportAiAgentId || '',
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

function updateReportAIControls(overlay) {
  const enabled = overlay.querySelector('#report-include-ai')?.checked;
  const hasText = !!overlay.querySelector('#report-ai-summary-text')?.value?.trim();
  const busy = overlay.dataset.reportAiBusy === 'true' || overlay.dataset.reportExportBusy === 'true';
  const primary = overlay.querySelector('[data-report-action="export"]');
  if (primary) { primary.disabled = busy; primary.textContent = busy ? 'Generating…' : enabled && !hasText ? 'Generate AI overview & preview' : 'Preview PDF'; }
  const generate = overlay.querySelector('[data-report-action="generate-ai-summary"]');
  if (generate) { generate.disabled = busy; generate.hidden = !enabled || (!hasText && !overlay.dataset.reportAiFailed); generate.textContent = hasText ? 'Regenerate overview' : 'Retry overview'; }
  const fallback = overlay.querySelector('[data-report-action="preview-without-ai"]');
  if (fallback) fallback.hidden = busy || !overlay.dataset.reportAiFailed;
  const editor = overlay.querySelector('#report-ai-summary-text');
  if (editor) editor.hidden = !enabled || !hasText;
}

function updateReportBuilderSelectionState(overlay) {
  updateReportAIControls(overlay);
  const customized = overlay.querySelector('[data-report-template-customized]');
  if (customized) customized.hidden = !isReportTemplateCustomized(overlay);
  const sectionBoxes = Array.from(overlay.querySelectorAll('input[data-report-section]'));
  const categoryBoxes = Array.from(overlay.querySelectorAll('input[data-report-category]'));
  for (const area of overlay.querySelectorAll('[data-report-for]')) {
    area.hidden = !sectionBoxes.some(box => box.dataset.reportSection === area.dataset.reportFor && box.checked);
  }
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
    summary.textContent = `${overlay.querySelector('[name="report-detail"]:checked')?.value === 'appendix' ? 'Summary + detailed records' : 'Concise summary'} · ${selectedSections} section${selectedSections === 1 ? '' : 's'}${!sectionBoxes.some(box => box.dataset.reportSection === 'categories' && box.checked) ? ' · labs not included' : categoryBoxes.length
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
  setReportCategoryChecks(overlay, 'all');
  const description = overlay.querySelector('[data-report-template-description]');
  if (description) description.textContent = preset.description;
  clearReportBuilderAISummaryForOptionChange(overlay);
  updateReportBuilderSelectionState(overlay);
}

function setReportBuilderAISummary(overlay, summary, payload = null) {
  const textEl = overlay.querySelector('#report-ai-summary-text');
  const statusEl = overlay.querySelector('[data-report-ai-status]');
  const clearBtn = overlay.querySelector('[data-report-action="clear-ai-summary"]');
  if (!textEl || !statusEl) return;
  if (!summary?.text) {
    reportAISnapshots.delete(overlay);
    textEl.value = '';
    textEl.hidden = true;
    delete textEl.dataset.reportAiGeneratedAt;
    delete textEl.dataset.reportAiModel;
    delete textEl.dataset.reportAiProvider;
    delete textEl.dataset.reportAiModelId;
    delete textEl.dataset.reportAiAgentId;
    statusEl.textContent = 'Not included.';
    if (clearBtn) clearBtn.hidden = true;
    updateReportAIControls(overlay);
    return;
  }
  reportAISnapshots.set(overlay, { profile: state.currentProfile, payload });
  textEl.value = summary.text;
  textEl.hidden = false;
  textEl.dataset.reportAiGeneratedAt = summary.generatedAt || '';
  textEl.dataset.reportAiModel = summary.model || '';
  textEl.dataset.reportAiProvider = summary.provider || '';
  textEl.dataset.reportAiModelId = summary.modelId || '';
  textEl.dataset.reportAiAgentId = summary.agentId || '';
  statusEl.textContent = `Generated${summary.model ? ` with ${summary.model}` : ''}. Editable before preview.`;
  if (clearBtn) clearBtn.hidden = false;
  delete overlay.dataset.reportAiFailed;
  updateReportAIControls(overlay);
}

function clearReportBuilderAISummaryForOptionChange(overlay) {
  overlay.dataset.reportAiRevision = String(Number(overlay.dataset.reportAiRevision || 0) + 1);
  const textEl = overlay?.querySelector('#report-ai-summary-text');
  if (!textEl?.value) return;
  setReportBuilderAISummary(overlay, null);
  const statusEl = overlay.querySelector('[data-report-ai-status]');
  if (statusEl) statusEl.textContent = 'Report options changed. Generate again for a AI overview.';
}

/** @param {any} overlay @param {ReturnType<typeof startReportProgress> | null} [progress] */
async function generateReportBuilderAISummary(overlay, progress = null) {
  const statusEl = overlay.querySelector('[data-report-ai-status]');
  if (overlay.dataset.reportAiBusy === 'true') return false;
  const ownProgress = !progress;
  progress ||= startReportProgress(overlay);
  const enabled = overlay.querySelector('#report-include-ai')?.checked;
  const revision = overlay.dataset.reportAiRevision;
  overlay.dataset.reportAiBusy = 'true';
  delete overlay.dataset.reportAiFailed;
  updateReportAIControls(overlay);
  if (statusEl) statusEl.textContent = 'Generating AI overview...';
  try {
    const options = collectReportBuilderOptions(overlay);
    const selectionError = getReportBuilderSelectionError(overlay, options);
    if (selectionError) {
      if (statusEl) statusEl.textContent = `${selectionError}.`;
      showNotification(selectionError, 'error');
      return false;
    }
    delete options.aiSummary;
    const profileId = state.currentProfile;
    const selection = JSON.stringify(options);
    const isCurrent = () => {
      const currentOptions = collectReportBuilderOptions(overlay);
      delete currentOptions.aiSummary;
      return overlay.isConnected && revision === overlay.dataset.reportAiRevision && enabled === overlay.querySelector('#report-include-ai')?.checked && profileId === state.currentProfile && selection === JSON.stringify(currentOptions);
    };
    const payload = buildPreparedReportPayload(options);
    const summary = await generateReportAISummary(options, { payload, onProgress: progress.stage, isCurrent });
    if (!isCurrent()) {
      overlay.dataset.reportAiFailed = 'true';
      if (statusEl) statusEl.textContent = 'Report selection changed. Generate the overview again.';
      return false;
    }
    if (summary?.text) {
      setReportBuilderAISummary(overlay, summary, payload);
      showNotification('AI overview generated', 'info', 2200);
      return true;
    } else {
      overlay.dataset.reportAiFailed = 'true';
      if (statusEl) statusEl.textContent = 'Overview unavailable. Retry or preview without AI.';
    }
  } catch (e) {
    const message = String(getErrorMessage(e, e) || 'Unknown error').slice(0, 180);
    overlay.dataset.reportAiFailed = 'true';
    const declined = ['AITransparencyDeclinedError', 'AIRouteConfirmationDeclinedError', 'CloudAIConsentDeclinedError'].includes(getErrorName(e));
    if (statusEl) statusEl.textContent = declined ? 'AI generation cancelled. No report data was sent. You can preview without AI.' : 'Generation failed. Try again or preview without the overview.';
    showNotification(declined ? 'AI generation cancelled. No report data was sent.' : 'AI summary failed: ' + message, declined ? 'info' : 'error');
  } finally {
    if (ownProgress) progress.stop();
    delete overlay.dataset.reportAiBusy;
    updateReportAIControls(overlay);
  }
  return false;
}

async function handleReportBuilderClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const actionEl = target?.closest('[data-report-action]');
  const overlay = actionEl?.closest(`#${REPORT_BUILDER_OVERLAY_ID}`);
  if (!actionEl || !overlay) return;
  const action = actionEl.dataset.reportAction;
  event.preventDefault();
  if ((overlay.dataset.reportAiBusy === 'true' || overlay.dataset.reportExportBusy === 'true') && action !== 'close') return;
  if (action !== 'close' && reportNoteSnapshots.get(overlay)?.profile !== state.currentProfile) {
    showNotification('Profile changed. Reopen Create a report for the current profile.', 'info');
    return;
  }
  if (action === 'close') {
    closeReportBuilder();
  } else if (action === 'edit-note') {
    const snapshot = reportNoteSnapshots.get(overlay);
    const note = snapshot?.notes[Number(actionEl.dataset.reportIndex)];
    const { openNoteEditor } = await import('./notes.js');
    const index = (state.importedData.notes || []).indexOf(note);
    if (!overlay.isConnected || !note || snapshot.profile !== state.currentProfile || snapshot.data !== state.importedData || index < 0) {
      showNotification('Profile or notes changed. Reopen the report to review the current notes.', 'info');
      return;
    }
    closeReportBuilder();
    openNoteEditor(null, index);
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
    await generateReportBuilderAISummary(overlay);
  } else if (action === 'clear-ai-summary') {
    overlay.querySelector('#report-include-ai').checked = false;
    delete overlay.dataset.reportAiFailed;
    setReportBuilderAISummary(overlay, null);
  } else if (action === 'export' || action === 'preview-without-ai') {
    if (action === 'preview-without-ai') {
      overlay.querySelector('#report-include-ai').checked = false;
      setReportBuilderAISummary(overlay, null);
      delete overlay.dataset.reportAiFailed;
      updateReportAIControls(overlay);
    }
    const options = collectReportBuilderOptions(overlay);
    const selectionError = getReportBuilderSelectionError(overlay, options);
    if (selectionError) {
      showNotification(selectionError, 'error');
    } else {
      let reservedPreview = null;
      let progress = null;
      const profileId = state.currentProfile;
      const revision = overlay.dataset.reportAiRevision;
      const isCurrent = () => overlay.isConnected && profileId === state.currentProfile && revision === overlay.dataset.reportAiRevision;
      try {
        reservedPreview = openReportPreviewWindow();
        if (!reservedPreview) { showNotification('Pop-up blocked - please allow pop-ups for this site', 'error'); return; }
        progress = startReportProgress(overlay, reservedPreview);
        overlay.dataset.reportExportBusy = 'true';
        updateReportAIControls(overlay);
        if (overlay.querySelector('#report-include-ai')?.checked && !options.aiSummary) {
          const generated = await generateReportBuilderAISummary(overlay, progress);
          if (!generated || !isCurrent() || reservedPreview.closed) { reservedPreview.close?.(); return; }
        }
        const finalOptions = collectReportBuilderOptions(overlay);
        const payload = finalOptions.aiSummary ? reportAISnapshots.get(overlay)?.payload : null;
        const exported = await exportPDFReport(finalOptions, reservedPreview, payload, { isCurrent, onProgress: progress.stage });
        progress.stop();
        if (exported) closeReportBuilder();
      } catch (e) {
        reservedPreview?.close?.();
        showNotification('Report preview failed. Please try again.', 'error');
      } finally {
        progress?.stop();
        delete overlay.dataset.reportExportBusy;
        updateReportAIControls(overlay);
      }
    }
  } else {
    return;
  }
}

function handleReportBuilderChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  const overlay = target?.closest(`#${REPORT_BUILDER_OVERLAY_ID}`);
  if (!target || !overlay) return;
  if (target.matches('#report-include-ai')) {
    overlay.dataset.reportAiRevision = String(Number(overlay.dataset.reportAiRevision || 0) + 1);
    if (!target.checked) setReportBuilderAISummary(overlay, null);
    delete overlay.dataset.reportAiFailed;
    updateReportAIControls(overlay);
    return;
  }
  if (
    target.matches('#report-date-range, #report-range-mode, #report-purpose, [name="report-detail"], [data-report-context], #report-genome-mode') ||
    target.matches('input[data-report-section]') ||
    target.matches('input[data-report-category]')
  ) {
    if (target.matches('#report-range-mode')) {
      const boxes = Array.from(overlay.querySelectorAll('input[data-report-category]'));
      for (const option of getReportCategoryOptions(getActiveData(), target.value)) {
        const box = boxes.find(input => input.dataset.reportCategory === option.key);
        if (!box) continue;
        box.dataset.reportPriority = String(option.flaggedCount > 0);
        box.closest('label').querySelector('.report-category-meta').textContent = `${option.markerCount} marker${option.markerCount === 1 ? '' : 's'}${option.flaggedCount ? ` · ${option.flaggedCount} flagged` : ''}`;
      }
    }
    clearReportBuilderAISummaryForOptionChange(overlay);
    updateReportBuilderSelectionState(overlay);
  }
}

function installReportBuilderDelegates() {
  if (reportBuilderDelegatesInstalled || typeof document === 'undefined') return;
  reportBuilderDelegatesInstalled = true;
  document.addEventListener('click', handleReportBuilderClick);
  document.addEventListener('change', handleReportBuilderChange);
  document.addEventListener('input', event => { if (event.target instanceof Element && event.target.matches('#report-purpose')) handleReportBuilderChange(event); else if (event.target instanceof Element && event.target.matches('#report-ai-summary-text')) updateReportAIControls(event.target.closest('[data-report-builder-overlay]')); });
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
  reportNoteSnapshots.set(overlay, { profile: state.currentProfile, data: state.importedData, notes: [...(state.importedData.notes || [])] });
  openAppendedModalOverlay(overlay, closeReportBuilder, { initialFocus: '.report-preset-btn.active', focusDelay: 50 });
  updateReportBuilderSelectionState(overlay);
}

export function closeReportBuilder() {
  const overlay = document.getElementById(REPORT_BUILDER_OVERLAY_ID);
  if (overlay) { cancelReportProgress(overlay); removeModalOverlay(overlay); }
}
