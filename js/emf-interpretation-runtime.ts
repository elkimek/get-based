// EMF dependency configuration stays available before its optional interpretation UI.
import { callAssistantFeatureAI } from './ai-feature-routing.js';
import type { RuntimeConfigInput } from '../types/emf-interpretation.js';

const emfInterpretationRuntimeDeps: {callClaudeAPI: unknown;closeModal: unknown;openChatPanel: unknown} = {
  callClaudeAPI: callAssistantFeatureAI,
  closeModal: null,
  openChatPanel: null,
};

export function configureEMFInterpretationRuntimeDeps(deps: unknown = {}) {
  const previous = { ...emfInterpretationRuntimeDeps };
  if (typeof (deps as RuntimeConfigInput).callClaudeAPI === 'function') emfInterpretationRuntimeDeps.callClaudeAPI = (deps as RuntimeConfigInput).callClaudeAPI;
  if (Object.hasOwn(deps as object, 'closeModal')) {
    emfInterpretationRuntimeDeps.closeModal = typeof (deps as RuntimeConfigInput).closeModal === 'function'
      ? (deps as RuntimeConfigInput).closeModal
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')) {
    emfInterpretationRuntimeDeps.openChatPanel = typeof (deps as RuntimeConfigInput).openChatPanel === 'function'
      ? (deps as RuntimeConfigInput).openChatPanel
      : null;
  }
  return previous;
}

export function getEMFInterpretationRuntimeDeps() {
  return emfInterpretationRuntimeDeps;
}

let closeLoadedInterpretation: (() => void) | null = null;

/** The loaded implementation remains the sole abort, overlay and focus owner. */
export function registerEMFInterpretationCloseHandler(close: () => void): void {
  closeLoadedInterpretation = close;
}

/** Closing unrelated UI must never fetch or open the optional EMF feature. */
export function closeEMFInterpretation(): void {
  closeLoadedInterpretation?.();
}
