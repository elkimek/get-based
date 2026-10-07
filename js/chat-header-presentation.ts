import { state } from './state.js';
import { getActivePersonality } from './chat-personality-models.js';
import { getAIProvider, isVeniceE2EEActive, isPpqPrivateModeActive, isRoutstrPrivateModeActive, supportsWebSearch } from './api.js';
import { getChatBackendDisplay, hasChatResponseBackend, isCodexChatBackend } from './chat-backend-selection.js';
import { getChatProviderAttestation } from './chat-runtime.js';
import { getChatContextView } from './chat-context-status.js';
import { projectChatTitle, projectChatSummary } from './chat-header-contract.js';
import { configureChatHeaderRefresh, renderChatHeader } from './chat-header-view.js';
export function updateSummaryButton() {
  renderChatHeader(projectChatSummary(state.chatHistory, state.chatThreads.find(thread => thread.id === state.currentThreadId)?.summary));
}
export function refreshChatHeaderWebSearch() {
  renderChatHeader({ webSearchVisible: !isCodexChatBackend() && supportsWebSearch(), webSearchEnabled: localStorage.getItem('labcharts-chat-websearch') === 'on' });
}
export function updateChatHeaderModel() {
  const available = hasChatResponseBackend(), provider = getAIProvider();
  const privateMode = available && !isCodexChatBackend() && ((provider === 'venice' && isVeniceE2EEActive()) || (provider === 'ppq' && isPpqPrivateModeActive()) || (provider === 'routstr' && isRoutstrPrivateModeActive()));
  renderChatHeader({ model: available ? getChatBackendDisplay() : '', privateMode, attestation: privateMode ? getChatProviderAttestation(provider) : null, context: getChatContextView() });
  refreshChatHeaderWebSearch();
}
export function updateChatHeaderTitle() {
  renderChatHeader(projectChatTitle(state.chatHistory, getActivePersonality().name));
  updateChatHeaderModel(); updateSummaryButton();
}
configureChatHeaderRefresh(updateChatHeaderTitle);
