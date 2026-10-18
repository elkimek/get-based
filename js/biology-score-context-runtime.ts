// Lightweight dependency owner shared by the app shell and the lazy context review implementation.
import { isAIPaused } from './api.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from './ai-feature-routing.js';

export interface ContextAIDeps {
  callClaudeAPI: typeof callAssistantFeatureAI; hasAIProvider: typeof hasAssistantFeatureProvider;
  isAIPaused: typeof isAIPaused; navigate: ((route?: string) => void) | null;
}

export const biologyScoreContextAIDeps: ContextAIDeps = {
  callClaudeAPI: callAssistantFeatureAI,
  hasAIProvider: hasAssistantFeatureProvider,
  isAIPaused,
  navigate: null,
};

export function configureBiologyScoreContextAIDeps(deps: Partial<ContextAIDeps> = {}) {
  const previous = { ...biologyScoreContextAIDeps };
  if (typeof deps.callClaudeAPI === 'function') biologyScoreContextAIDeps.callClaudeAPI = deps.callClaudeAPI;
  if (typeof deps.hasAIProvider === 'function') biologyScoreContextAIDeps.hasAIProvider = deps.hasAIProvider;
  if (typeof deps.isAIPaused === 'function') biologyScoreContextAIDeps.isAIPaused = deps.isAIPaused;
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    biologyScoreContextAIDeps.navigate = deps.navigate!;
  }
  return previous;
}

