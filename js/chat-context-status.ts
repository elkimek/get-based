// chat-context-status.js - Unified AI Context state in the chat header.

import { hasChatResponseBackend } from './chat-backend-selection.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { getLensStatus, getLensSummary } from './lens.js';
import { state } from './state.js';
import { projectChatContext } from './chat-header-contract.js';
import { renderChatHeader } from './chat-header-view.js';

function isGenomeLookupContextActive() {
  try { return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY); }
  catch { return false; }
}

function getAIContextHeaderState() {
  const active: unknown[] = [];
  const pending: string[] = [];
  let knowledgeError: unknown = '';
  if ((state.importedData?.interpretiveLens || '').trim()) active.push('Lens');
  try {
    const kb = getLensSummary();
    if (kb?.configured) {
      active.push(kb.displayName || 'Knowledge Base');
      const status = getLensStatus();
      if (status?.state === 'error') knowledgeError = status.lastError || 'unknown error';
    } else if (kb?.enabled) {
      pending.push('KB empty');
    }
  } catch { /* Knowledge Base not initialised yet. */ }
  if (isGenomeLookupContextActive()) active.push('Genome lookup');
  return { active, pending, knowledgeError };
}

export function getChatContextView() {
  const context = getAIContextHeaderState();
  return projectChatContext(context.active, context.pending, context.knowledgeError, hasChatResponseBackend());
}
export function updateChatContextStatus() { renderChatHeader({ context: getChatContextView() }); }
