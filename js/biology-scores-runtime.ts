// biology-scores-runtime.js - Browser runtime adapters for Biology Scores UI hooks.

import { configureRuntimeCallbacks, scheduleRuntimeTask } from './runtime-callbacks.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getActiveData } from './data.js';
import { showNotification } from './utils.js';

interface BiologyScoresRuntimeDeps {
  prepareContext: (() => Promise<unknown>) | null;
  getActiveData: typeof getActiveData | null;
  navigate: ((route: string) => unknown) | null;
  openChatPanel: ((prompt?: string) => unknown) | null;
  showDetailModal: ((markerId: string) => unknown) | null;
  showNotification: typeof showNotification | null;
  useChatPrompt: ((prompt: string) => unknown) | null;
}

const biologyScoresRuntimeDeps: BiologyScoresRuntimeDeps = {
  prepareContext: null,
  getActiveData: getActiveData,
  navigate: null,
  openChatPanel: null,
  showDetailModal: null,
  showNotification: showNotification,
  useChatPrompt: null,
};

export function configureBiologyScoresRuntimeDeps(deps: Partial<BiologyScoresRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(biologyScoresRuntimeDeps, deps, 'inherited');
}


export function navigateBiologyScoresRoute(route: string = 'biology-scores') {
  biologyScoresRuntimeDeps.navigate?.(route || 'biology-scores');
}

export function canOpenBiologyScoresChatPanel() {
  return Boolean(biologyScoresRuntimeDeps.openChatPanel);
}

export function openBiologyScoresChatPanel(prompt?: string) {
  const openChatPanel = biologyScoresRuntimeDeps.openChatPanel;
  if (!openChatPanel) return false;
  if (prompt === undefined) openChatPanel();
  else openChatPanel(prompt);
  return true;
}

export function useBiologyScoresChatPrompt(prompt: string) {
  biologyScoresRuntimeDeps.useChatPrompt?.(prompt);
}

export function showBiologyScoresNotification(message: string, type = 'info') {
  biologyScoresRuntimeDeps.showNotification?.(message, type);
}

export function hasBiologyScoresAIProvider() {
  try {
    return Boolean(hasAssistantFeatureProvider());
  } catch {
    return false;
  }
}

export function getBiologyScoresActiveData() {
  return biologyScoresRuntimeDeps.getActiveData?.() || {};
}

export function openBiologyScoreMarkerDetail(markerId: string) {
  if (!markerId) return false;
  const showDetailModal = biologyScoresRuntimeDeps.showDetailModal;
  if (!showDetailModal) return false;
  showDetailModal(markerId);
  return true;
}

export function scheduleBiologyScoresTask(callback: () => void, delayMs = 0) {
  return scheduleRuntimeTask(callback, delayMs);
}

export async function prepareBiologyScoresContext() {
  await biologyScoresRuntimeDeps.prepareContext?.();
}
