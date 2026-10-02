import { CYCLE_IMPORT_ACTION, cycleImportActionAttrs as importActionAttrs, cycleImportSourceLabel as sourceLabel, renderCycleImportPicker, renderCycleImportSummary } from './cycle-import-rendering.js';
// cycle-import.js - menstrual-cycle import adapters, preview, commit, deletion.

import type { CycleFlow, CyclePeriod } from './cycle-summary.js';
import type { CycleImportObservation } from './cycle-import-adapters.js';
import type { CycleImportData } from './cycle-import-mutations.js';
import type { CycleFileContext, CycleZipEntry } from './cycle-import-file.js';

type ParsedCycleImport = NonNullable<ReturnType<typeof parseDripCycleCsv>>;
type CycleImportPreviewData = CycleImportData & Partial<Pick<ParsedCycleImport, 'sourceLabel' | 'warnings' | 'detectedRange'>>;
type CycleCommitResult = Awaited<ReturnType<typeof commitCycleImport>>;
interface PendingCycleImport {
  parsed: CycleImportPreviewData;
  conflictMode: string;
  isCurrent: () => boolean;
  committing: boolean;
  resolve: (value: CycleCommitResult | null) => void;
}
interface CycleImportAdapter {
  id: string;
  sourceLabel: string;
  detect: (context: CycleFileContext) => boolean;
  parse: (context: CycleFileContext) => Promise<ParsedCycleImport | null>;
}

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { buildCycleImportPlan, commitCycleImport, deleteCycleImportFromProfile, deleteCycleSourceFromProfile } from './cycle-import-mutations.js';
export { buildCycleImportPlan, commitCycleImport, deleteCycleImportFromProfile, deleteCycleSourceFromProfile, clearCycleProfileData } from './cycle-import-mutations.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { endTour } from './tour.js';
import { escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import {
  loadCycleImportStylesheetRuntime, navigateCycleViewRuntime, openCycleEditorRuntime,
} from './cycle-runtime.js';
import {
  stitchCyclePeriodsFromObservations,
} from './cycle-summary.js';
import {
  resultImportId,
  looksLikeClueCycleJson,
  looksLikeNaturalCyclesCsv,
  parseClueCycleJson,
  parseDripCycleCsv,
  parseNaturalCyclesCsv,
  parseNaturalCyclesCsvBundle,
} from './cycle-import-adapters.js';
import {
  appleHealthArchiveEntry,
  buildCycleFileContext,
  clueArchiveEntries,
  cycleFileKind,
  naturalCyclesArchiveEntries,
} from './cycle-import-file.js';

let pendingCycleImport: PendingCycleImport | null = null;
let previewGeneration = 0;
function cycleViewOwner() {
  const profileId = state.currentProfile;
  const data = state.importedData;
  return () => state.currentProfile === profileId && state.importedData === data;
}

function navigateCycleImportView(category: string) {
  return navigateCycleViewRuntime(category);
}

async function openCycleEditorFromImport() {
  openCycleEditorRuntime();
}

export function renderCycleImportPickerControls() {
  return renderCycleImportPicker();
}

function isoDateFromApple(value: unknown) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
function dateRangeForObservations(observations: readonly Pick<CycleImportObservation, 'date'>[]) {
  const dates = observations.map(row => row.date).filter(Boolean).sort();
  return { firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null };
}

const APPLE_FLOW: Record<string, CycleFlow | null> = {
  HKCategoryValueMenstrualFlowUnspecified: 'moderate',
  HKCategoryValueMenstrualFlowLight: 'light',
  HKCategoryValueMenstrualFlowMedium: 'moderate',
  HKCategoryValueMenstrualFlowHeavy: 'heavy',
  HKCategoryValueMenstrualFlowNone: null,
};
const APPLE_OVULATION: Record<string, string> = {
  HKCategoryValueOvulationTestResultPositive: 'positive',
  HKCategoryValueOvulationTestResultNegative: 'negative',
  HKCategoryValueOvulationTestResultIndeterminate: 'indeterminate',
  HKCategoryValueOvulationTestResultLuteinizingHormoneSurge: 'positive',
};
const APPLE_FLOW_PRIORITY: Record<string, number> = { spotting: 0, light: 1, moderate: 2, heavy: 3 };
const RECORD_RE = /<Record\b([^>]*?)\/?>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseAppleAttrs(raw: string) {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(raw)) !== null) attrs[match[1]!] = match[2]!;
  return attrs;
}
function addObservation(map: Map<string, CycleImportObservation>, source: string, date: string | null, patch: Partial<CycleImportObservation>) {
  if (!date) return;
  const key = `${source}|${date}`;
  const row = map.get(key) || { source, date };
  const next = { ...row, ...patch };
  if (patch.bleeding) {
    const previous = row.bleeding;
    const previousPriority = previous && !previous.excluded ? APPLE_FLOW_PRIORITY[previous.flow as string] ?? -1 : -1;
    const nextPriority = !patch.bleeding.excluded ? APPLE_FLOW_PRIORITY[patch.bleeding.flow as string] ?? -1 : -1;
    next.bleeding = !previous || nextPriority >= previousPriority ? { ...previous, ...patch.bleeding } : previous;
  }
  map.set(key, next);
}
function processAppleCycleRecord(attrsRaw: string, byKey: Map<string, CycleImportObservation>) {
  if (!/HKCategoryTypeIdentifier(MenstrualFlow|IntermenstrualBleeding|OvulationTestResult|CervicalMucusQuality)/.test(attrsRaw)) return;
  const attrs = parseAppleAttrs(attrsRaw);
  const date = isoDateFromApple(attrs.startDate || attrs.creationDate);
  if (!date) return;
  if (attrs.type === 'HKCategoryTypeIdentifierMenstrualFlow') {
    if (Object.prototype.hasOwnProperty.call(APPLE_FLOW, attrs.value!)) {
      const flow = APPLE_FLOW[attrs.value!];
      if (flow) addObservation(byKey, 'apple_health', date, { bleeding: { flow, excluded: false, intermenstrual: false } });
    }
  } else if (attrs.type === 'HKCategoryTypeIdentifierIntermenstrualBleeding') {
    addObservation(byKey, 'apple_health', date, { bleeding: { flow: 'spotting', excluded: true, intermenstrual: true } });
  } else if (attrs.type === 'HKCategoryTypeIdentifierOvulationTestResult') {
    addObservation(byKey, 'apple_health', date, { ovulationTest: APPLE_OVULATION[attrs.value!] || String(attrs.value || '').replace('HKCategoryValueOvulationTestResult', '').toLowerCase() });
  } else if (attrs.type === 'HKCategoryTypeIdentifierCervicalMucusQuality') {
    addObservation(byKey, 'apple_health', date, { cervicalMucus: { quality: String(attrs.value || '').replace('HKCategoryValueCervicalMucusQuality', '').toLowerCase() } });
  }
}
function finalizeAppleHealthCycleImport(byKey: Map<string, CycleImportObservation>, fileName: string) {
  const observations = Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length === 0) return null;
  const importId = resultImportId('apple_health', fileName);
  const periods = stitchCyclePeriodsFromObservations(observations, {
    source: 'apple_health',
    importId,
    updatedAt: new Date().toISOString(),
  });
  return {
    source: 'apple_health',
    sourceLabel: 'Apple Health',
    sourceFile: fileName,
    importId,
    observations: observations.map(row => ({ ...row, importId })),
    periods,
    warnings: periods.length === 0 ? ['Apple Health had cycle observations, but no menstrual-flow episodes were derived.'] : [],
    detectedRange: dateRangeForObservations(observations),
  };
}

export function parseAppleHealthCycleXml(xmlText: string, fileName = 'apple-health-export.xml') {
  const byKey = new Map<string, CycleImportObservation>();
  RECORD_RE.lastIndex = 0;
  let match;
  while ((match = RECORD_RE.exec(xmlText)) !== null) processAppleCycleRecord(match[1]!, byKey);
  return finalizeAppleHealthCycleImport(byKey, fileName);
}
export async function parseAppleHealthCycleBlob(blob: Blob, fileName = 'apple-health-export.xml', onProgress: ((progress: { stage: string; pct: number }) => void) | null = null) {
  const byKey = new Map<string, CycleImportObservation>();
  const reader = blob.stream()
    .pipeThrough(new TextDecoderStream('utf-8'))
    .getReader();
  let buffer = '';
  let bytesRead = 0;
  const totalSize = blob.size || 0;

  const flushLine = (line: string) => {
    if (line.indexOf('<Record') === -1) return;
    RECORD_RE.lastIndex = 0;
    let match;
    while ((match = RECORD_RE.exec(line)) !== null) processAppleCycleRecord(match[1]!, byKey);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    bytesRead += value.length;
    let nlIdx;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      flushLine(buffer.slice(0, nlIdx));
      buffer = buffer.slice(nlIdx + 1);
    }
    if (totalSize && onProgress) onProgress({ stage: 'parsing-cycle', pct: Math.round((bytesRead / totalSize) * 35 + 40) });
  }
  if (buffer.length) flushLine(buffer);
  return finalizeAppleHealthCycleImport(byKey, fileName);
}

export function isAppleHealthCycleFile(file: Parameters<typeof cycleFileKind>[0]) {
  return cycleFileKind(file) === 'xml';
}

export const CYCLE_IMPORT_ADAPTERS = Object.freeze<CycleImportAdapter[]>([
  {
    id: 'apple_health',
    sourceLabel: 'Apple Health',
    detect: context => context.kind === 'xml' || !!appleHealthArchiveEntry(context),
    parse: async context => {
      const blob = context.kind === 'xml' ? context.file : await appleHealthArchiveEntry(context)?.async('blob');
      return blob ? parseAppleHealthCycleBlob(blob, context.file.name || 'apple-health-export.xml') : null;
    },
  },
  {
    id: 'clue',
    sourceLabel: 'Clue',
    detect: context => context.kind === 'json'
      ? looksLikeClueCycleJson(context.text)
      : context.kind === 'zip' && clueArchiveEntries(context).length > 0,
    parse: async context => {
      if (context.kind === 'json') return parseClueCycleJson(context.text, context.file.name || 'clue-data.json');
      for (const entry of clueArchiveEntries(context)) {
        const parsed = parseClueCycleJson(await entry.async('text'), context.file.name || entry.name);
        if (parsed) return parsed;
      }
      return null;
    },
  },
  {
    id: 'natural_cycles',
    sourceLabel: 'Natural Cycles',
    detect: context => context.kind === 'csv'
      ? looksLikeNaturalCyclesCsv(context.text!, context.file.name)
      : context.kind === 'zip' && naturalCyclesArchiveEntries(context).length > 0,
    parse: async context => {
      if (context.kind === 'csv') return parseNaturalCyclesCsv(context.text!, context.file.name || 'tracking_data.csv');
      const files: Array<{ name: string | undefined; text: string }> = [];
      for (const entry of naturalCyclesArchiveEntries(context)) {
        files.push({ name: entry.name, text: await entry.async('text') });
      }
      return parseNaturalCyclesCsvBundle(files, context.file.name || 'natural-cycles-export.zip');
    },
  },
  {
    id: 'drip',
    sourceLabel: 'Drip',
    detect: context => context.kind === 'csv' || context.kind === 'text',
    parse: async context => parseDripCycleCsv(context.text!, context.file.name || 'drip.csv'),
  },
]);

export async function isCycleImportFile(file: File) {
  const kind = cycleFileKind(file);
  if (kind === 'xml' || kind === 'zip' || String(file?.name || '').toLowerCase().endsWith('.cluedata')) return true;
  if (kind !== 'json') return false;
  try { return looksLikeClueCycleJson(await file.text()); } catch { return false; }
}

export async function parseCycleImportFile(file: File | null | undefined) {
  if (!file) return null;
  const context = await buildCycleFileContext(file);
  return parseCycleImportContext(context);
}

async function parseCycleImportContext(context: CycleFileContext) {
  for (const adapter of CYCLE_IMPORT_ADAPTERS) {
    if (!await adapter.detect(context)) continue;
    const parsed = await adapter.parse(context);
    if (parsed) return parsed;
  }
  return null;
}

export { parseClueCycleJson, parseDripCycleCsv, parseNaturalCyclesCsv, parseNaturalCyclesCsvBundle } from './cycle-import-adapters.js';

function conflictSummary(plan: ReturnType<typeof buildCycleImportPlan>) {
  const count = plan.conflicts.length;
  return `${count} imported period${count !== 1 ? 's' : ''} overlap${count === 1 ? 's' : ''} existing entries.`;
}
function renderPeriodRows(periods: readonly CyclePeriod[], conflictStarts: ReadonlySet<string>, conflictMode: string) {
  return periods.slice(0, 18).map(period => {
    const hasConflict = conflictStarts.has(period.startDate);
    const status = hasConflict
      ? conflictMode === 'replace-overlapping' ? 'Overlap · replace' : 'Overlap · skip'
      : 'Ready';
    return `<tr data-import-status="${hasConflict ? 'unmatched' : 'matched'}">
      <td class="cycle-import-status-cell" data-label="Status"><span class="cycle-import-row-status ${hasConflict ? 'cycle-import-row-status-conflict' : 'cycle-import-row-status-ready'}">${status}</span></td>
      <td data-label="Start">${escapeHTML(period.startDate || '')}</td><td data-label="End">${escapeHTML(period.endDate || period.startDate || '')}</td>
      <td data-label="Flow">${escapeHTML(period.flow || 'moderate')}</td><td data-label="Symptoms">${escapeHTML((period.symptoms || []).join(', '))}</td>
    </tr>`;
  }).join('');
}

function renderCycleImportPreview(parsed: CycleImportPreviewData, conflictMode = 'keep-existing') {
  const plan = buildCycleImportPlan(parsed, state.importedData.menstrualCycle, conflictMode);
  const source = parsed.sourceLabel || sourceLabel(parsed.source);
  const observationCount = parsed.observations?.length || 0;
  const conflictStarts = new Set(plan.conflicts.map(item => item.period.startDate));
  const importCount = plan.importedToApply.length;
  const confirmLabel = importCount ? `Import ${importCount} period${importCount !== 1 ? 's' : ''}`
    : observationCount ? `Import ${observationCount} daily observation${observationCount !== 1 ? 's' : ''}` : 'Complete import';
  return `<div class="gb-modal-head import-preview-head">
      <div><div class="gb-modal-kicker">Cycle import · ${escapeHTML(source)}</div><div class="gb-modal-title">Review cycle import</div></div>
      <button type="button" class="modal-close" ${importActionAttrs('close')} aria-label="Close import preview">&times;</button>
    </div>
    <div class="gb-form-body import-review-body">
      <div class="import-review-summary">
        <div class="import-review-file"><span class="import-review-label">File</span><strong>${escapeHTML(parsed.sourceFile || source)}</strong></div>
        <div class="import-review-file"><span class="import-review-label">Range</span><strong>${escapeHTML(parsed.detectedRange?.firstDate || '?')} - ${escapeHTML(parsed.detectedRange?.lastDate || '?')}</strong></div>
        <div class="import-review-stats" aria-label="Cycle import summary">
          <span class="import-review-stat"><strong>${observationCount}</strong> daily observations</span><span class="import-review-stat import-review-stat-matched"><strong>${plan.importedPeriods.length}</strong> periods found</span>
          ${plan.conflicts.length ? `<span class="import-review-stat import-review-stat-unmatched"><strong>${plan.conflicts.length}</strong> overlap${plan.conflicts.length !== 1 ? 's' : ''}</span>
          <span class="import-review-stat import-review-stat-new"><strong>${importCount}</strong> will import</span>` : ''}
        </div>
      </div>
      ${plan.conflicts.length ? `<div class="import-review-warning cycle-import-conflict-warning" role="alert"><strong>${escapeHTML(conflictSummary(plan))}</strong><span>Choose how to handle the overlapping periods below.</span></div>` : ''}
      ${parsed.warnings?.length ? `<div class="import-review-warning" role="alert">${parsed.warnings.map(escapeHTML).join('<br>')}</div>` : ''}
      ${plan.conflicts.length ? `<div class="cycle-import-conflicts" role="radiogroup" aria-label="Cycle import conflict handling">
        ${[['keep-existing', 'Keep existing', 'Import non-overlapping periods and leave conflicts unchanged.'],
          ['replace-overlapping', 'Replace overlaps', 'Replace overlapping existing period entries with imported periods.']]
          .map(([value, label, desc]) => `<label class="cycle-import-conflict-option">
          <input type="radio" name="cycle-import-conflict" value="${value}" ${conflictMode === value ? 'checked' : ''} ${importActionAttrs('conflict-mode')}><span><strong>${label}</strong><small>${desc}</small></span>
        </label>`).join('')}
      </div>` : ''}
      <div class="cycle-import-table-heading"><strong>${plan.importedPeriods.length ? 'Periods found' : 'No periods found'}</strong><span>${plan.importedPeriods.length ? 'Check the dates and details before importing.' : 'Daily observations can still be saved on this device.'}</span></div>
      ${plan.importedPeriods.length ? `<div class="import-table-wrap cycle-import-table-wrap">
        <table class="import-table import-review-table cycle-import-table" aria-label="Periods detected in this import">
          <thead><tr><th class="cycle-import-status-heading">Status</th><th>Start</th><th>End</th><th>Flow</th><th>Symptoms</th></tr></thead><tbody>${renderPeriodRows(plan.importedPeriods, conflictStarts, conflictMode)}</tbody>
        </table>
      </div>` : ''}
      ${plan.importedPeriods.length > 18 ? `<div class="cycle-import-more">Showing 18 of ${plan.importedPeriods.length} periods.</div>` : ''}
      <div class="cycle-import-privacy-note">
        <span class="cycle-import-privacy-icon" aria-hidden="true">&#128274;</span><span><strong>Daily details stay on this device.</strong><small>Period summaries can sync across devices when cross-device sync is enabled.</small></span>
      </div>
    </div>
    <div class="import-review-actions">
      <button type="button" class="import-btn import-btn-secondary" ${importActionAttrs('close')}>Cancel</button>
      <button type="button" class="import-btn import-btn-primary" ${importActionAttrs('confirm')}>${confirmLabel}</button>
    </div>`;
}

export async function showCycleImportPreview(parsed: CycleImportPreviewData | null | undefined) {
  if (!parsed || (!parsed.observations?.length && !parsed.periods?.length)) {
    showNotification('No cycle data found in this file', 'info');
    return null;
  }
  const isCurrent = cycleViewOwner();
  const generation = ++previewGeneration;
  pendingCycleImport?.resolve(null);
  pendingCycleImport = null;
  try {
    await loadCycleImportStylesheetRuntime();
  } catch (err) {
    console.error('[cycle-import] Could not load import stylesheet:', err);
    showNotification('Could not load import review. Reload the app to finish updating, then try again.', 'error');
    return null;
  }
  if (!isCurrent() || generation !== previewGeneration) return null;
  return new Promise<CycleCommitResult | null>(resolve => {
    endTour({ openEmptyChat: false });
    pendingCycleImport = { parsed, conflictMode: 'keep-existing', resolve, isCurrent, committing: false };
    const overlay = document.getElementById('import-modal-overlay');
    const modal = document.getElementById('import-modal');
    if (!overlay || !modal) {
      commitCycleImport(parsed).then(resolve).catch(err => {
        showNotification(`Cycle import failed: ${err.message}`, 'error');
        resolve(null);
      });
      return;
    }
    modal.className = 'modal import-preview-modal cycle-import-preview-modal';
    modal.innerHTML = renderCycleImportPreview(parsed);
    openModalOverlay(overlay, { initialFocus: '[data-cycle-import-action="confirm"]', focusDelay: 50 });
  });
}

function closeCycleImportPreview(value: CycleCommitResult | null = null) {
  previewGeneration++;
  const pending = pendingCycleImport;
  pendingCycleImport = null;
  closeModalOverlay('import-modal-overlay');
  pending?.resolve?.(value);
}

export async function handleCycleImportAction(event: Pick<Event, 'target'> & Partial<Pick<Event, 'type'>>) {
  const target = event.target instanceof Element ? event.target.closest(`[${CYCLE_IMPORT_ACTION}]`) : null;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute(CYCLE_IMPORT_ACTION) || '';
  if (action === 'pick-file') {
    const input = target.closest('.cycle-section')?.querySelector('.cycle-import-file-input');
    if (!(input instanceof HTMLInputElement)) {
      showNotification('Cycle import is not available on this screen.', 'error');
      return;
    }
    input.value = '';
    input.click();
  } else if (action === 'select-file' && event.type === 'change' && target instanceof HTMLInputElement) {
    const file = target.files?.[0];
    target.value = '';
    if (file) await handleCycleImportFile(file);
  } else if (action === 'close') {
    closeCycleImportPreview(null);
  } else if (action === 'conflict-mode' && pendingCycleImport && target instanceof HTMLInputElement) {
    pendingCycleImport.conflictMode = target.value || 'keep-existing';
    const modal = document.getElementById('import-modal');
    if (modal) modal.innerHTML = renderCycleImportPreview(pendingCycleImport.parsed, pendingCycleImport.conflictMode);
  } else if (action === 'confirm' && pendingCycleImport) {
    const pending = pendingCycleImport;
    if (pending.committing || !pending.isCurrent()) return;
    pending.committing = true;
    target.setAttribute('disabled', 'true');
    try {
      let allowProfileSexChange = false;
      if (state.profileSex && state.profileSex !== 'female') {
        const sexLabel = state.profileSex.charAt(0).toUpperCase() + state.profileSex.slice(1);
        allowProfileSexChange = await showConfirmDialog(`This profile is set to ${sexLabel}. Cycle interpretation uses female reference ranges. Change the profile to Female and continue?`);
        if (!allowProfileSexChange) return;
      }
      if (pendingCycleImport !== pending || !pending.isCurrent()) return;
      const result = await commitCycleImport(pending.parsed, {
        conflictMode: pending.conflictMode, allowProfileSexChange,
      });
      if (pendingCycleImport !== pending) return;
      if (!pending.isCurrent()) { pendingCycleImport = null; pending.resolve(result); return; }
      showNotification(`Cycle import complete - ${result.periods} periods, ${result.observations} local observations`, 'success', 1200);
      closeCycleImportPreview(result);
      const didNavigate = navigateCycleImportView('body');
      setTimeout(() => {
        if (pending.isCurrent()) openCycleEditorFromImport().catch(error => showNotification(`Could not reopen cycle history: ${error.message}`, 'error'));
      }, didNavigate ? 1550 : 0);
    } catch (err) {
      if (pendingCycleImport === pending && pending.isCurrent()) showNotification(`Cycle import failed: ${getErrorMessage(err)}`, 'error');
    } finally {
      pending.committing = false;
      target.removeAttribute('disabled');
    }
  } else if (action === 'delete-source') {
    const isCurrent = cycleViewOwner();
    const source = target.dataset.cycleImportSource || '';
    if (!source || !await showConfirmDialog(`Remove all ${sourceLabel(source)} cycle data from this profile?`)) return;
    if (!isCurrent()) return;
    await deleteCycleSourceFromProfile(source);
    if (!isCurrent()) return;
    showNotification(`${sourceLabel(source)} cycle data removed`, 'info');
    await openCycleEditorFromImport();
  } else if (action === 'delete-import') {
    const isCurrent = cycleViewOwner();
    const importId = target.dataset.cycleImportImportId || '';
    if (!importId || !await showConfirmDialog('Remove this imported cycle batch?')) return;
    if (!isCurrent()) return;
    await deleteCycleImportFromProfile(importId);
    if (!isCurrent()) return;
    showNotification('Imported cycle batch removed', 'info');
    await openCycleEditorFromImport();
  }
}

export async function handleCycleImportFile(file: File) {
  const isCurrent = cycleViewOwner();
  let parsed: ParsedCycleImport | null = null;
  let importLabel = 'Cycle';
  try {
    const context = await buildCycleFileContext(file);
    if (!isCurrent()) return false;
    const appleHealthEntry = context.kind === 'zip' ? appleHealthArchiveEntry(context) : null;
    if (context.kind === 'xml' || appleHealthEntry) {
      importLabel = 'Apple Health';
      const xmlBlob = context.kind === 'xml' ? context.file : await (appleHealthEntry as CycleZipEntry).async('blob');
      const { importAppleHealthFile } = await import('./wearables-apple-health.js');
      if (!isCurrent()) return false;
      showNotification('Importing Apple Health data...', 'info', 1600);
      const result = await importAppleHealthFile(file, null, { xmlBlob });
      if (!isCurrent()) return true;
      const cycleSuffix = result.cycleImport ? ` + ${result.cycleImport.periods} cycle periods` : '';
      showNotification(`Apple Health imported - ${result.rows} days${cycleSuffix}`, 'success', 3000);
      if (result.cycleError) showNotification(`Cycle import skipped: ${result.cycleError}`, 'info', 5000);
      navigateCycleImportView('dashboard');
      return true;
    }
    parsed = await parseCycleImportContext(context);
  } catch (err) {
    showNotification(`${importLabel} import failed: ${getErrorMessage(err)}`, 'error');
    return false;
  }
  if (!isCurrent()) return false;
  if (!parsed) {
    showNotification('No cycle data found in this file', 'info');
    return false;
  }
  await showCycleImportPreview(parsed);
  return true;
}

export async function maybeHandleCycleTextImport(file: File, text: string) {
  const parsed = parseNaturalCyclesCsv(text, file.name || 'tracking_data.csv')
    || parseDripCycleCsv(text, file.name || 'cycle.csv');
  if (!parsed) return false;
  await showCycleImportPreview(parsed);
  return true;
}

export function renderCycleImportSummarySection(mc: unknown) {
  return renderCycleImportSummary(mc, source => () => sourceLabel(source));
}
