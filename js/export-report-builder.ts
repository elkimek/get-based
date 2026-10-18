// export-report-builder.js — PDF report modal builder

import { state } from './state.js';
import {renderHTML as renderReportBuilderPresentation} from './components/ReportBuilderPresentation.svelte.html.js';
import {projectReportBuilder} from './report-builder-presentation.js';
import { getErrorMessage, getErrorName } from './caught-error.js';
import { getActiveData } from './data.js';
import { getAllFlaggedMarkers } from './marker-analysis.js';
import { showNotification } from './utils.js';
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
import type { PreparedReportPayload, ReportAISummary } from './export-report.js';
import type { ReportBuilderOptions, ReportNoteReader, ReportNoteSnapshot, ReportAISnapshot } from '../types/export-report-builder.js';

let reportBuilderDelegatesInstalled = false;
const reportNoteSnapshots = new WeakMap<HTMLElement, ReportNoteSnapshot>();
const reportAISnapshots = new WeakMap<HTMLElement, ReportAISnapshot>();
const reportAIRequests = new WeakMap<HTMLElement, AbortController>();
const BUILDER_SECTIONS = REPORT_SECTION_DEFS.filter(section => !['flagged', 'summary', 'trends'].includes(section.id)).map(section => ({ ...section, label: ({ categories: 'Lab results', genetics: 'Genome', context: 'Personal context', nutrition: 'Nutrition and hydration', wearables: 'Body and wearables', light: 'Sun and light sessions', environment: 'Environment', notes: 'Timeline notes' } as Record<string, string>)[section.id] || section.label }));
const HISTORY_SECTIONS = ['categories', 'supplements', 'notes', 'context', 'nutrition', 'wearables', 'light', 'environment'];
function selectedReportSections(overlay: HTMLElement) {
  return Array.from(overlay.querySelectorAll<HTMLInputElement>('input[data-report-section]:checked')).flatMap(input => input.dataset.reportSection === 'categories' ? REPORT_LAB_SECTION_IDS : [input.dataset.reportSection]);
}

function isReportTemplateCustomized(overlay: HTMLElement) {
  const preset = getReportPreset(overlay.dataset.reportPreset);
  const sections = selectedReportSections(overlay);
  const categories = Array.from(overlay.querySelectorAll<HTMLInputElement>('[data-report-category]'));
  return overlay.querySelector<HTMLSelectElement>('#report-date-range')?.value !== preset.dateRange
    || sections.length !== (preset.sections as Array<string | undefined>).length || sections.some(section => !(preset.sections as Array<string | undefined>).includes(section))
    || (sections.includes('categories') && categories.some(input => !input.checked));
}

function getReportCategoryOptions(data = getActiveData(), rangeMode = state.rangeMode) {
  const flags = getAllFlaggedMarkers(data, rangeMode);
  const flagCounts = new Map<string, number>();
  for (const flag of flags) {
    flagCounts.set(flag.categoryKey, (flagCounts.get(flag.categoryKey) || 0) + 1);
  }
  return Object.entries(data.categories || {}).map(([key, cat]) => {
    const markers = Object.values(cat.markers || {}).filter(marker => !marker.hidden);
    const markerCount = markers.filter(marker => marker.values?.some(value => value != null)).length;
    if (markerCount === 0) return null;
    return {
      key,
      label: (cat as {label?: unknown}).label || key,
      markerCount,
      flaggedCount: flagCounts.get(key) || 0,
    };
  }).filter(option => option !== null);
}


function formatSelectionCount(selected: number, total: number, noun: string) {
  const label = total === 1
    ? noun
    : (noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`);
  return `${selected} of ${total} ${label}`;
}

function renderReportBuilder(presetId: unknown = DEFAULT_REPORT_PRESET) {
  const preset = getReportPreset(presetId as string);
  const aiAvailable = hasAssistantFeatureProvider();
  const rawData = getActiveData();
  const categoryOptions = getReportCategoryOptions(rawData);
  const view = projectReportBuilder({
    overlayId: REPORT_BUILDER_OVERLAY_ID,
    presetId,
    preset,
    presets: Object.keys(REPORT_PRESETS).map(id => {
      const option = getReportPreset(id);
      return {id, label: option.label, subtitle: option.subtitle};
    }),
    dateOptions: REPORT_DATE_RANGE_OPTIONS,
    rangeOptions: REPORT_RANGE_MODE_OPTIONS,
    rangeMode: state.rangeMode,
    sections: BUILDER_SECTIONS,
    categories: categoryOptions,
    selectedCategoryKeys: categoryOptions.map(option => option.key),
    contextTitles: buildReportContextSections(rawData).map(section => section.title),
    notes: (state.importedData as {notes?: ReportNoteReader[]}).notes || [],
    aiAvailable,
  });
  return renderReportBuilderPresentation({view});
}

function collectReportBuilderOptions(overlay: HTMLElement): ReportBuilderOptions {
  const previous = reportAISnapshots.get(overlay);
  if (previous && (previous.profile !== state.currentProfile)) {
    setReportBuilderAISummary(overlay, null);
    const status = overlay.querySelector<HTMLElement>('[data-report-ai-status]');
    if (status) status.textContent = 'Profile data changed. Generate the overview again.';
  }
  const aiText = overlay.querySelector<HTMLTextAreaElement>('#report-ai-summary-text')?.value?.trim() || '';
  const sections = selectedReportSections(overlay);
  const options: ReportBuilderOptions = {
    preset: overlay.dataset.reportPreset || DEFAULT_REPORT_PRESET,
    presetLabel: getReportPreset(overlay.dataset.reportPreset).label + (isReportTemplateCustomized(overlay) ? ' (customized)' : ''),
    dateRange: overlay.querySelector<HTMLSelectElement>('#report-date-range')?.value || 'current',
    rangeMode: overlay.querySelector<HTMLSelectElement>('#report-range-mode')?.value || 'optimal',
    purpose: overlay.querySelector<HTMLTextAreaElement>('#report-purpose')?.value || '',
    appendixSections: overlay.querySelector<HTMLInputElement>('[name="report-detail"]:checked')?.value === 'appendix' ? sections.filter(id => HISTORY_SECTIONS.includes(id as string)) : [],
    contextTitles: Array.from(overlay.querySelectorAll<HTMLInputElement>('[data-report-context]:checked')).map(input => input.dataset.reportContext),
    genomeMode: overlay.querySelector<HTMLSelectElement>('#report-genome-mode')?.value || 'risks',
    sections,
    categoryKeys: Array.from(overlay.querySelectorAll<HTMLInputElement>('input[data-report-category]:checked'))
      .map(input => input.dataset.reportCategory),
  };
  if (aiText && overlay.querySelector<HTMLInputElement>('#report-include-ai')?.checked) {
    const aiEl = overlay.querySelector<HTMLTextAreaElement>('#report-ai-summary-text');
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

function getReportBuilderSelectionError(overlay: HTMLElement, options: ReportBuilderOptions) {
  if (options.sections.length === 0) return 'Choose at least one report section';
  const hasCategories = overlay.querySelectorAll<HTMLInputElement>('input[data-report-category]').length > 0;
  const hasLabSection = options.sections.some(section => REPORT_LAB_SECTION_IDS.includes(section as string));
  if (hasLabSection && hasCategories && options.categoryKeys.length === 0) {
    return 'Choose at least one lab category or turn off lab sections';
  }
  return '';
}

function setReportCategoryChecks(overlay: HTMLElement, mode: string) {
  const boxes = Array.from(overlay.querySelectorAll<HTMLInputElement>('input[data-report-category]'));
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

function updateReportAIControls(overlay: HTMLElement) {
  const enabled = overlay.querySelector<HTMLInputElement>('#report-include-ai')?.checked;
  const hasText = !!overlay.querySelector<HTMLTextAreaElement>('#report-ai-summary-text')?.value?.trim();
  const busy = overlay.dataset.reportAiBusy === 'true' || overlay.dataset.reportExportBusy === 'true';
  const primary = overlay.querySelector<HTMLButtonElement>('[data-report-action="export"]');
  if (primary) {
    primary.disabled = busy;
    const label = busy ? 'Generating…' : enabled && !hasText ? 'Generate AI overview & preview' : 'Preview PDF';
    // Preserve the pressed text node when a field's blur repeats an unchanged label.
    if (primary.textContent !== label) primary.textContent = label;
  }
  const generate = overlay.querySelector<HTMLButtonElement>('[data-report-action="generate-ai-summary"]');
  if (generate) {
    generate.disabled = busy;
    generate.hidden = !enabled || (!hasText && !overlay.dataset.reportAiFailed);
    const label = hasText ? 'Regenerate overview' : 'Retry overview';
    if (generate.textContent !== label) generate.textContent = label;
  }
  const fallback = overlay.querySelector<HTMLElement>('[data-report-action="preview-without-ai"]');
  if (fallback) fallback.hidden = busy || !overlay.dataset.reportAiFailed;
  const editor = overlay.querySelector<HTMLTextAreaElement>('#report-ai-summary-text');
  if (editor) editor.hidden = !enabled || !hasText;
}

function updateReportBuilderSelectionState(overlay: HTMLElement) {
  updateReportAIControls(overlay);
  const customized = overlay.querySelector<HTMLElement>('[data-report-template-customized]');
  if (customized) customized.hidden = !isReportTemplateCustomized(overlay);
  const sectionBoxes = Array.from(overlay.querySelectorAll<HTMLInputElement>('input[data-report-section]'));
  const categoryBoxes = Array.from(overlay.querySelectorAll<HTMLInputElement>('input[data-report-category]'));
  for (const area of overlay.querySelectorAll<HTMLElement>('[data-report-for]')) {
    area.hidden = !sectionBoxes.some(box => box.dataset.reportSection === area.dataset.reportFor && box.checked);
  }
  const selectedSections = sectionBoxes.filter(box => box.checked).length;
  const selectedCategories = categoryBoxes.filter(box => box.checked).length;
  const sectionCount = overlay.querySelector<HTMLElement>('[data-report-section-count]');
  const categoryCount = overlay.querySelector<HTMLElement>('[data-report-category-count]');
  const summary = overlay.querySelector<HTMLElement>('[data-report-selection-summary]');
  if (sectionCount) sectionCount.textContent = formatSelectionCount(selectedSections, sectionBoxes.length, 'section');
  if (categoryCount) {
    categoryCount.textContent = categoryBoxes.length
      ? formatSelectionCount(selectedCategories, categoryBoxes.length, 'category')
      : 'No lab data';
  }
  if (summary) {
    summary.textContent = `${overlay.querySelector<HTMLInputElement>('[name="report-detail"]:checked')?.value === 'appendix' ? 'Summary + detailed records' : 'Concise summary'} · ${selectedSections} section${selectedSections === 1 ? '' : 's'}${!sectionBoxes.some(box => box.dataset.reportSection === 'categories' && box.checked) ? ' · labs not included' : categoryBoxes.length
      ? ` · ${selectedCategories} lab categor${selectedCategories === 1 ? 'y' : 'ies'}`
      : ' · no lab data'}`;
  }
}

function applyReportPreset(overlay: HTMLElement, presetId: string) {
  const normalizedPresetId = (REPORT_PRESETS as Record<PropertyKey, unknown>)[presetId as PropertyKey] ? presetId : DEFAULT_REPORT_PRESET;
  const preset = getReportPreset(normalizedPresetId);
  overlay.dataset.reportPreset = normalizedPresetId;
  overlay.querySelectorAll<HTMLElement>('[data-report-action="set-preset"]').forEach(button => {
    const active = button.dataset.reportPreset === normalizedPresetId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const range = overlay.querySelector<HTMLSelectElement>('#report-date-range');
  if (range) (range as {value: unknown}).value = preset.dateRange;
  const selectedSections = new Set<string | undefined>(preset.sections);
  overlay.querySelectorAll<HTMLInputElement>('input[data-report-section]').forEach(box => {
    box.checked = selectedSections.has(box.dataset.reportSection);
  });
  setReportCategoryChecks(overlay, 'all');
  const description = overlay.querySelector<HTMLElement>('[data-report-template-description]');
  if (description) (description as {textContent: unknown}).textContent = preset.description;
  clearReportBuilderAISummaryForOptionChange(overlay);
  updateReportBuilderSelectionState(overlay);
}

function setReportBuilderAISummary(overlay: HTMLElement, summary: ReportAISummary | null | undefined, payload: PreparedReportPayload | null = null) {
  const textEl = overlay.querySelector<HTMLTextAreaElement>('#report-ai-summary-text');
  const statusEl = overlay.querySelector<HTMLElement>('[data-report-ai-status]');
  const clearBtn = overlay.querySelector<HTMLElement>('[data-report-action="clear-ai-summary"]');
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
  (textEl.dataset as Record<string, unknown>).reportAiGeneratedAt = summary.generatedAt || '';
  (textEl.dataset as Record<string, unknown>).reportAiModel = summary.model || '';
  (textEl.dataset as Record<string, unknown>).reportAiProvider = summary.provider || '';
  (textEl.dataset as Record<string, unknown>).reportAiModelId = summary.modelId || '';
  (textEl.dataset as Record<string, unknown>).reportAiAgentId = summary.agentId || '';
  statusEl.textContent = `Generated${summary.model ? ` with ${summary.model}` : ''}. Editable before preview.`;
  if (clearBtn) clearBtn.hidden = false;
  delete overlay.dataset.reportAiFailed;
  updateReportAIControls(overlay);
}

function clearReportBuilderAISummaryForOptionChange(overlay: HTMLElement) {
  overlay.dataset.reportAiRevision = String(Number(overlay.dataset.reportAiRevision || 0) + 1);
  const textEl = overlay?.querySelector<HTMLTextAreaElement>('#report-ai-summary-text');
  if (!textEl?.value) return;
  setReportBuilderAISummary(overlay, null);
  const statusEl = overlay.querySelector<HTMLElement>('[data-report-ai-status]');
  if (statusEl) statusEl.textContent = 'Report options changed. Generate again for a AI overview.';
}

async function generateReportBuilderAISummary(overlay: HTMLElement, progress: ReturnType<typeof startReportProgress> | null = null) {
  const statusEl = overlay.querySelector<HTMLElement>('[data-report-ai-status]');
  if (overlay.dataset.reportAiBusy === 'true') return false;
  const ownProgress = !progress;
  const controller = new AbortController();
  reportAIRequests.set(overlay, controller);
  progress ||= startReportProgress(overlay);
  const enabled = overlay.querySelector<HTMLInputElement>('#report-include-ai')?.checked;
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
      return overlay.isConnected && revision === overlay.dataset.reportAiRevision && enabled === overlay.querySelector<HTMLInputElement>('#report-include-ai')?.checked && profileId === state.currentProfile && selection === JSON.stringify(currentOptions);
    };
    const payload = buildPreparedReportPayload(options);
    const summary = await generateReportAISummary(options, { payload, onProgress: progress.stage, isCurrent, signal: controller.signal });
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
    if (controller.signal.aborted && !overlay.isConnected) return false;
    const message = String(getErrorMessage(e, e) || 'Unknown error').slice(0, 180);
    overlay.dataset.reportAiFailed = 'true';
    const declined = ['AITransparencyDeclinedError', 'AIRouteConfirmationDeclinedError', 'CloudAIConsentDeclinedError'].includes(getErrorName(e));
    if (statusEl) statusEl.textContent = declined ? 'AI generation cancelled. No report data was sent. You can preview without AI.' : 'Generation failed. Try again or preview without the overview.';
    showNotification(declined ? 'AI generation cancelled. No report data was sent.' : 'AI summary failed: ' + message, declined ? 'info' : 'error');
  } finally {
    if (reportAIRequests.get(overlay) === controller) reportAIRequests.delete(overlay);
    if (ownProgress) progress.stop();
    delete overlay.dataset.reportAiBusy;
    updateReportAIControls(overlay);
  }
  return false;
}

async function handleReportBuilderClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const actionEl = target?.closest<HTMLElement>('[data-report-action]');
  const overlay = actionEl?.closest<HTMLElement>(`#${REPORT_BUILDER_OVERLAY_ID}`);
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
    const index = ((state.importedData as {notes?: unknown[]}).notes || []).indexOf(note);
    if (!overlay.isConnected || !note || snapshot!.profile !== state.currentProfile || snapshot!.data !== state.importedData || index < 0) {
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
    overlay.querySelector<HTMLInputElement>('#report-include-ai')!.checked = false;
    delete overlay.dataset.reportAiFailed;
    setReportBuilderAISummary(overlay, null);
  } else if (action === 'export' || action === 'preview-without-ai') {
    if (action === 'preview-without-ai') {
      overlay.querySelector<HTMLInputElement>('#report-include-ai')!.checked = false;
      setReportBuilderAISummary(overlay, null);
      delete overlay.dataset.reportAiFailed;
      updateReportAIControls(overlay);
    }
    const options = collectReportBuilderOptions(overlay);
    const selectionError = getReportBuilderSelectionError(overlay, options);
    if (selectionError) {
      showNotification(selectionError, 'error');
    } else {
      let reservedPreview: ReturnType<typeof openReportPreviewWindow> = null;
      let progress: ReturnType<typeof startReportProgress> | null = null;
      const profileId = state.currentProfile;
      const revision = overlay.dataset.reportAiRevision;
      const isCurrent = () => overlay.isConnected && profileId === state.currentProfile && revision === overlay.dataset.reportAiRevision;
      try {
        reservedPreview = openReportPreviewWindow();
        if (!reservedPreview) { showNotification('Pop-up blocked - please allow pop-ups for this site', 'error'); return; }
        progress = startReportProgress(overlay, reservedPreview);
        overlay.dataset.reportExportBusy = 'true';
        updateReportAIControls(overlay);
        if (overlay.querySelector<HTMLInputElement>('#report-include-ai')?.checked && !options.aiSummary) {
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

function handleReportBuilderChange(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  const overlay = target?.closest<HTMLElement>(`#${REPORT_BUILDER_OVERLAY_ID}`);
  if (!target || !overlay) return;
  if (target.matches('#report-include-ai')) {
    overlay.dataset.reportAiRevision = String(Number(overlay.dataset.reportAiRevision || 0) + 1);
    if (!(target as HTMLInputElement).checked) setReportBuilderAISummary(overlay, null);
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
      const boxes = Array.from(overlay.querySelectorAll<HTMLInputElement>('input[data-report-category]'));
      for (const option of getReportCategoryOptions(getActiveData(), (target as HTMLSelectElement).value)) {
        const box = boxes.find(input => input.dataset.reportCategory === option.key);
        if (!box) continue;
        box.dataset.reportPriority = String(option.flaggedCount > 0);
        box.closest('label')!.querySelector<HTMLElement>('.report-category-meta')!.textContent = `${option.markerCount} marker${option.markerCount === 1 ? '' : 's'}${option.flaggedCount ? ` · ${option.flaggedCount} flagged` : ''}`;
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
  document.addEventListener('input', event => { if (event.target instanceof Element && event.target.matches('#report-purpose')) handleReportBuilderChange(event); else if (event.target instanceof Element && event.target.matches('#report-ai-summary-text')) updateReportAIControls(event.target.closest<HTMLElement>('[data-report-builder-overlay]')!); });
}

export function openReportBuilder(presetId: unknown = DEFAULT_REPORT_PRESET) {
  if (typeof document === 'undefined') return;
  const normalizedPresetId = (REPORT_PRESETS as Record<PropertyKey, unknown>)[presetId as PropertyKey] ? presetId : DEFAULT_REPORT_PRESET;
  closeReportBuilder();
  installReportBuilderDelegates();
  const template = document.createElement('template');
  template.innerHTML = renderReportBuilder(normalizedPresetId).trim();
  const overlay = template.content.firstElementChild;
  if (!(overlay instanceof HTMLElement)) return;
  reportNoteSnapshots.set(overlay, { profile: state.currentProfile, data: state.importedData, notes: [...((state.importedData as {notes?: unknown[]}).notes || [])] });
  openAppendedModalOverlay(overlay, closeReportBuilder, { initialFocus: '.report-preset-btn.active', focusDelay: 50 });
  updateReportBuilderSelectionState(overlay);
}

export function closeReportBuilder() {
  const overlay = document.getElementById(REPORT_BUILDER_OVERLAY_ID);
  if (overlay) {
    reportAIRequests.get(overlay)?.abort(new DOMException('Report generation cancelled.', 'AbortError'));
    reportAIRequests.delete(overlay);
    cancelReportProgress(overlay); removeModalOverlay(overlay);
  }
}
