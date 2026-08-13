// @ts-check
// chat-context-status.js - Unified AI Context state in the chat header.

import { hasAIProvider } from './api.js';
import { openChatContextModalRuntime } from './chat-runtime.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { getLensStatus, getLensSummary } from './lens.js';
import { state } from './state.js';
import { escapeHTML } from './utils.js';

function isGenomeLookupContextActive() {
  try { return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY); }
  catch { return false; }
}

function getAIContextHeaderState() {
  const active = [];
  const pending = [];
  let knowledgeError = '';
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

function ensureChatContextStatus(el) {
  const parent = el.parentElement;
  if (!parent) return null;
  let status = parent.querySelector('.chat-context-status');
  if (!status) {
    status = document.createElement('button');
    status.type = 'button';
    status.className = 'chat-context-status';
    status.addEventListener('click', () => openChatContextModalRuntime());
    parent.appendChild(status);
  }
  return status;
}

export function updateChatContextStatus() {
  const modelEl = document.querySelector('.chat-header-model');
  if (!modelEl) return;
  const status = ensureChatContextStatus(modelEl);
  if (!status) return;
  const live = document.getElementById('chat-context-live-status');
  const clearStatus = () => {
    status.textContent = '';
    status.hidden = true;
    status.removeAttribute('aria-label');
    status.removeAttribute('title');
    status.classList.remove('chat-context-status-pending', 'chat-context-status-error');
    if (live) live.textContent = '';
  };
  if (!hasAIProvider()) {
    clearStatus();
    return;
  }
  const contextState = getAIContextHeaderState();
  const parts = [...contextState.active, ...contextState.pending];
  if (parts.length === 0) {
    clearStatus();
    return;
  }
  const pendingOnly = contextState.active.length === 0 && contextState.pending.length > 0;
  const label = `AI Context: ${parts.join(' + ')}`;
  const hasKnowledgeError = !!contextState.knowledgeError;
  const ariaSuffix = hasKnowledgeError
    ? `The Knowledge Base could not be searched for the last answer: ${contextState.knowledgeError}. Click to manage Context.`
    : pendingOnly
      ? 'Knowledge Base is enabled but no library is indexed yet. Click to manage Context.'
      : 'Click to manage Context.';
  status.hidden = false;
  status.classList.toggle('chat-context-status-pending', pendingOnly);
  status.classList.toggle('chat-context-status-error', hasKnowledgeError);
  status.setAttribute('aria-label', `${label}. ${ariaSuffix}`);
  status.title = ariaSuffix;
  status.innerHTML = `<span class="chat-context-dot" aria-hidden="true"></span><span>${escapeHTML(label)}</span>`;
  if (live) {
    const announcement = hasKnowledgeError ? ariaSuffix : '';
    if (live.textContent !== announcement) live.textContent = announcement;
  }
}
