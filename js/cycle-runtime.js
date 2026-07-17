// @ts-check
// cycle-runtime.js - Explicit application callbacks for Cycle views.

/** @type {{ closeModal: (() => void) | null, navigate: ((category: string) => void) | null }} */
const cycleRuntimeDeps = {
  closeModal: null,
  navigate: null,
};

/**
 * @param {{ closeModal?: (() => void) | null, navigate?: ((category: string) => void) | null }} deps
 */
export function configureCycleRuntimeDeps(deps = {}) {
  const previous = { ...cycleRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    cycleRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    cycleRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  return previous;
}

export function closeCycleModalRuntime() {
  cycleRuntimeDeps.closeModal?.();
}

/** @param {string} category */
export function navigateCycleViewRuntime(category) {
  cycleRuntimeDeps.navigate?.(category);
}
