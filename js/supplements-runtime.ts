import { configureRuntimeCallbacks } from './runtime-callbacks.js';

export interface SupplementsRuntimeCallbacks {
  closeModal: (() => void) | null;
  navigate: ((category: string) => void) | null;
}

// supplements-runtime.js - Explicit application callbacks for Supplements views.

const supplementsRuntimeDeps: SupplementsRuntimeCallbacks = {
  closeModal: null,
  navigate: null,
};

export function configureSupplementsRuntimeDeps(deps: Partial<SupplementsRuntimeCallbacks> = {}): SupplementsRuntimeCallbacks {
  return configureRuntimeCallbacks(supplementsRuntimeDeps, deps);
}

export function closeSupplementsModalRuntime() {
  supplementsRuntimeDeps.closeModal?.();
}

export function navigateSupplementsViewRuntime(category: string) {
  supplementsRuntimeDeps.navigate?.(category);
}
