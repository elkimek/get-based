// @ts-check
// cycle-runtime.js - Explicit application callbacks for Cycle views.

/** @type {{ closeModal: (() => void) | null, navigate: ((category: string) => void) | null, renderProfileButton: (() => void) | null }} */
const cycleRuntimeDeps = {
  closeModal: null,
  navigate: null,
  renderProfileButton: null,
};

/**
 * @param {{ closeModal?: (() => void) | null, navigate?: ((category: string) => void) | null, renderProfileButton?: (() => void) | null }} deps
 */
export function configureCycleRuntimeDeps(deps = {}) {
  const previous = { ...cycleRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    cycleRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    cycleRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  if (Object.hasOwn(deps, 'renderProfileButton')) {
    cycleRuntimeDeps.renderProfileButton = typeof deps.renderProfileButton === 'function' ? deps.renderProfileButton : null;
  }
  return previous;
}

export function closeCycleModalRuntime() {
  cycleRuntimeDeps.closeModal?.();
}

/** @param {string} category */
export function navigateCycleViewRuntime(category) {
  if (!cycleRuntimeDeps.navigate) return false;
  cycleRuntimeDeps.navigate(category);
  return true;
}

export function renderCycleProfileButtonRuntime() {
  cycleRuntimeDeps.renderProfileButton?.();
}
