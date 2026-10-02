import { cycleImportSourceLabel, renderCycleImportPicker, renderCycleImportSummary } from './cycle-import-rendering.js';

// cycle-import-loader.js - cold-safe Cycle import runtime facade

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { showNotification } from './utils.js';

type CycleImportModule = typeof import('./cycle-import.js');
type CycleActionName = 'parseAppleHealthCycleBlob' | 'showCycleImportPreview' | 'clearCycleProfileData';

const cycleImportModuleLoader = createRetryingModuleLoader<CycleImportModule>(
  retry => retry ? loadCycleImportRetryModule() : import('./cycle-import.js'),
);

let cycleImportLoaderDelegatesInstalled = false;

export function renderCycleImportPickerControls() {
  return renderCycleImportPicker();
}

export function renderCycleImportSummarySection(mc: unknown) {
  return renderCycleImportSummary(mc, source => {
    const label = cycleImportSourceLabel(source);
    return () => label;
  });
}

export function isCycleImportModuleLoaded() {
  return cycleImportModuleLoader.module !== null;
}

function loadCycleImportRetryModule(): Promise<CycleImportModule> {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./cycle-import.js?lazy-retry=1');
}

export function loadCycleImportModule() {
  return cycleImportModuleLoader.load();
}

function runCycleImportAction<K extends CycleActionName>(name: K, args: Parameters<CycleImportModule[K]>) {
  const run = (module: CycleImportModule) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Cycle import action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args) as ReturnType<CycleImportModule[K]>;
  };
  return invokeCachedModule(cycleImportModuleLoader, loadCycleImportModule, run, (error): false => {
    console.error(`[cycle-import] Could not run ${String(name)}:`, error);
    showNotification('Cycle import tools could not be loaded. Try again.', 'error');
    return false;
  });
}

export function parseAppleHealthCycleBlob(blob: Parameters<CycleImportModule['parseAppleHealthCycleBlob']>[0], fileName: string, onProgress: Parameters<CycleImportModule['parseAppleHealthCycleBlob']>[2] = null) {
  return runCycleImportAction('parseAppleHealthCycleBlob', [blob, fileName, onProgress]);
}

export function showCycleImportPreview(parsed: Parameters<CycleImportModule['showCycleImportPreview']>[0]) {
  return runCycleImportAction('showCycleImportPreview', [parsed]);
}

export function clearCycleProfileData() {
  return runCycleImportAction('clearCycleProfileData', []);
}

function handleDeferredCycleImportAction(event: Event) {
  const target = event.target instanceof Element
    ? event.target.closest('[data-cycle-import-action]')
    : null;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.cycleImportAction || '';
  const expectsChange = action === 'select-file' || action === 'conflict-mode';
  if ((expectsChange && event.type !== 'change') || (!expectsChange && event.type !== 'click')) return;
  if (cycleImportModuleLoader.module) {
    void cycleImportModuleLoader.module.handleCycleImportAction(event)
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
