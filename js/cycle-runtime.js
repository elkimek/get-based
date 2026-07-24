// @ts-check
// cycle-runtime.js - Explicit application callbacks for Cycle views.

/** @type {{ closeModal: (() => void) | null, loadImportStylesheet: (() => Promise<unknown>) | null, navigate: ((category: string) => void) | null, openEditor: (() => void) | null, renderProfileButton: (() => void) | null }} */
const cycleRuntimeDeps = {
  closeModal: null,
  loadImportStylesheet: null,
  navigate: null,
  openEditor: null,
  renderProfileButton: null,
};

/**
 * @param {{ closeModal?: (() => void) | null, loadImportStylesheet?: (() => Promise<unknown>) | null, navigate?: ((category: string) => void) | null, openEditor?: (() => void) | null, renderProfileButton?: (() => void) | null }} deps
 */
export function configureCycleRuntimeDeps(deps = {}) {
  const previous = { ...cycleRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    cycleRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'loadImportStylesheet')) {
    cycleRuntimeDeps.loadImportStylesheet = typeof deps.loadImportStylesheet === 'function' ? deps.loadImportStylesheet : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    cycleRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  if (Object.hasOwn(deps, 'openEditor')) {
    cycleRuntimeDeps.openEditor = typeof deps.openEditor === 'function' ? deps.openEditor : null;
  }
  if (Object.hasOwn(deps, 'renderProfileButton')) {
    cycleRuntimeDeps.renderProfileButton = typeof deps.renderProfileButton === 'function' ? deps.renderProfileButton : null;
  }
  return previous;
}

export function closeCycleModalRuntime() {
  cycleRuntimeDeps.closeModal?.();
}

export async function loadCycleImportStylesheetRuntime() {
  await cycleRuntimeDeps.loadImportStylesheet?.();
}

/** @param {string} category */
export function navigateCycleViewRuntime(category) {
  if (!cycleRuntimeDeps.navigate) return false;
  cycleRuntimeDeps.navigate(category);
  return true;
}

export function openCycleEditorRuntime() {
  if (!cycleRuntimeDeps.openEditor) return false;
  cycleRuntimeDeps.openEditor();
  return true;
}

export function renderCycleProfileButtonRuntime() {
  cycleRuntimeDeps.renderProfileButton?.();
}
