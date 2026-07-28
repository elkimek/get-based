// @ts-check
// cycle-import-loader.js - cold-safe Cycle import runtime facade

import { upgradeMenstrualCycleProfile } from './cycle-summary.js';
import { escapeAttr, escapeHTML, showNotification } from './utils.js';

/** @typedef {typeof import('./cycle-import.js')} CycleImportModule */
/** @type {Promise<CycleImportModule> | null} */
let cycleImportModulePromise = null;
/** @type {CycleImportModule | null} */
let cycleImportModule = null;
let useCycleImportRetryUrl = false;
let cycleImportLoaderDelegatesInstalled = false;

const CYCLE_IMPORT_ACTION = 'data-cycle-import-action';
const CYCLE_IMPORT_ACCEPT = '.csv,.json,.cluedata,.xml,.zip,text/csv,application/json,application/xml,text/xml,application/zip';
const CYCLE_IMPORT_SOURCE_LABELS = {
  apple_health: 'Apple Health',
  drip: 'Drip',
  clue: 'Clue',
  flo: 'Flo',
  natural_cycles: 'Natural Cycles',
  kindara: 'Kindara',
  ovuview: 'OvuView',
  femm: 'FEMM',
  fertility_friend: 'Fertility Friend',
  tempdrop: 'Tempdrop',
  manual: 'Manual',
};

function cycleImportActionAttrs(action, data = {}) {
  const attrs = [`${CYCLE_IMPORT_ACTION}="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    const attrKey = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    if (value != null && value !== '') {
      attrs.push(`data-cycle-import-${attrKey}="${escapeAttr(String(value))}"`);
    }
  }
  return attrs.join(' ');
}

function cycleImportSourceLabel(source) {
  return CYCLE_IMPORT_SOURCE_LABELS[source] || source;
}

export function renderCycleImportPickerControls() {
  return `<button type="button" class="cycle-icon-btn" ${cycleImportActionAttrs('pick-file')} title="Import cycle data" aria-label="Import cycle data"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path></svg></button>
    <input type="file" class="cycle-import-file-input" ${cycleImportActionAttrs('select-file')} accept="${CYCLE_IMPORT_ACCEPT}" hidden aria-label="Choose a cycle export">`;
}

export function renderCycleImportSummarySection(mc) {
  const upgraded = upgradeMenstrualCycleProfile(mc);
  const coverage = upgraded?.coverage;
  if (!coverage || (!coverage.periodCount && !coverage.observationCount && !Object.keys(coverage.sources || {}).length)) return '';
  const sourceRows = Object.entries(coverage.sources || {})
    .filter(([, info]) => (info?.periods || 0) > 0 || (info?.observations || 0) > 0)
    .map(([source, info]) => {
      const periodImportIds = (upgraded.periods || [])
        .filter(period => period.source === source && period.importId)
        .map(period => period.importId);
      const importIds = Array.from(new Set([...(info.importIds || []), ...periodImportIds]));
      const batchButtons = importIds
        .map((id, idx) => `<button type="button" class="cycle-mini-action" ${cycleImportActionAttrs('delete-import', { importId: id })}>Remove batch ${idx + 1}</button>`)
        .join('');
      const sourceLabel = cycleImportSourceLabel(source);
      return `<div class="cycle-source-row">
        <div class="cycle-source-main">
          <strong>${escapeHTML(sourceLabel)}</strong>
          <span>${info.periods || 0} periods / ${info.observations || 0} local observations${info.importedAt ? ` / ${escapeHTML(String(info.importedAt).slice(0, 10))}` : ''}</span>
          ${batchButtons ? `<div class="cycle-import-batches">${batchButtons}</div>` : ''}
        </div>
        ${source !== 'manual' ? `<button type="button" class="cycle-icon-btn cycle-delete-btn" ${cycleImportActionAttrs('delete-source', { source })} title="Remove ${escapeAttr(sourceLabel)}" aria-label="Remove ${escapeAttr(sourceLabel)} cycle data">x</button>` : ''}
      </div>`;
    }).join('');
  return `<section class="cycle-editor-section cycle-import-summary-section">
    <div class="cycle-editor-section-title">Import Coverage</div>
    <div class="cycle-import-coverage">
      <span>${coverage.periodCount || 0} observed periods</span>
      <span>${coverage.observationCount || 0} local daily observations</span>
      ${coverage.firstDate || coverage.lastDate ? `<span>${escapeHTML(coverage.firstDate || '?')} - ${escapeHTML(coverage.lastDate || '?')}</span>` : ''}
    </div>
    ${sourceRows ? `<div class="cycle-source-list">${sourceRows}</div>` : ''}
  </section>`;
}

export function isCycleImportModuleLoaded() {
  return cycleImportModule !== null;
}

function loadCycleImportRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./cycle-import.js?lazy-retry=1');
}

/** @returns {Promise<CycleImportModule>} */
export function loadCycleImportModule() {
  if (!cycleImportModulePromise) {
    const load = useCycleImportRetryUrl
      ? loadCycleImportRetryModule()
      : import('./cycle-import.js');
    cycleImportModulePromise = load
      .then(module => (cycleImportModule = module))
      .catch(error => {
        cycleImportModulePromise = null;
        cycleImportModule = null;
        useCycleImportRetryUrl = true;
        throw error;
      });
  }
  return cycleImportModulePromise;
}

/**
 * @param {keyof CycleImportModule} name
 * @param {any[]} args
 */
function runCycleImportAction(name, args) {
  const run = (/** @type {CycleImportModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Cycle import action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  try {
    if (cycleImportModule) return run(cycleImportModule);
    return loadCycleImportModule()
      .then(run)
      .catch(error => {
        console.error(`[cycle-import] Could not run ${String(name)}:`, error);
        showNotification('Cycle import tools could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (error) {
    console.error(`[cycle-import] Could not run ${String(name)}:`, error);
    showNotification('Cycle import tools could not be loaded. Try again.', 'error');
    return false;
  }
}

/**
 * @param {Blob} blob
 * @param {string} fileName
 * @param {((event: any) => void) | null} [onProgress]
 * @returns {Promise<any>}
 */
export function parseAppleHealthCycleBlob(blob, fileName, onProgress = null) {
  return runCycleImportAction('parseAppleHealthCycleBlob', [blob, fileName, onProgress]);
}

export function showCycleImportPreview(parsed) {
  return runCycleImportAction('showCycleImportPreview', [parsed]);
}

export function clearCycleProfileData() {
  return runCycleImportAction('clearCycleProfileData', []);
}

/** @param {Event} event */
function handleDeferredCycleImportAction(event) {
  const target = event.target instanceof Element
    ? event.target.closest('[data-cycle-import-action]')
    : null;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.cycleImportAction || '';
  const expectsChange = action === 'select-file' || action === 'conflict-mode';
  if ((expectsChange && event.type !== 'change') || (!expectsChange && event.type !== 'click')) return;
  if (cycleImportModule) {
    void cycleImportModule.handleCycleImportAction(event)
      .catch(error => {
        console.error('[cycle-import] Deferred action failed:', error);
        showNotification(`Cycle action failed: ${error.message}`, 'error');
      });
    return;
  }
  event.preventDefault();
  void loadCycleImportModule()
    .then(module => module.handleCycleImportAction(event))
    .catch(error => {
      console.error('[cycle-import] Deferred action failed:', error);
      showNotification(
        isCycleImportModuleLoaded()
          ? `Cycle action failed: ${error.message}`
          : 'Cycle import tools could not be loaded. Try again.',
        'error',
      );
    });
}

export function installCycleImportLoaderDelegates() {
  if (cycleImportLoaderDelegatesInstalled || typeof document === 'undefined') return;
  cycleImportLoaderDelegatesInstalled = true;
  document.addEventListener('click', handleDeferredCycleImportAction);
  document.addEventListener('change', handleDeferredCycleImportAction);
}

installCycleImportLoaderDelegates();
