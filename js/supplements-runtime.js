// @ts-check
// supplements-runtime.js - Explicit application callbacks for Supplements views.

/** @type {{ closeModal: (() => void) | null, navigate: ((category: string) => void) | null }} */
const supplementsRuntimeDeps = {
  closeModal: null,
  navigate: null,
};

/**
 * @param {{ closeModal?: (() => void) | null, navigate?: ((category: string) => void) | null }} deps
 */
export function configureSupplementsRuntimeDeps(deps = {}) {
  const previous = { ...supplementsRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    supplementsRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    supplementsRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  return previous;
}

export function closeSupplementsModalRuntime() {
  supplementsRuntimeDeps.closeModal?.();
}

/** @param {string} category */
export function navigateSupplementsViewRuntime(category) {
  supplementsRuntimeDeps.navigate?.(category);
}
