// @ts-check
// agent-proposal-inbox.js — generic confirmation inbox for proposals from chat or Agent Access.

import { escapeAttr, escapeHTML, showNotification } from './utils.js';
import { state } from './state.js';
import { applyStoredAgentProposal, dismissStoredAgentProposal, listStoredAgentProposals } from './agent-access-proposals.js';

const INBOX_ACTION_ATTR = 'data-agent-proposal-inbox-action';
const INBOX_ID_ATTR = 'data-agent-proposal-inbox-id';
const INBOX_SELECTOR = `[${INBOX_ACTION_ATTR}]`;
let inboxShowHistory = false;

function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

function actionAttrs(action, id) {
  return `${INBOX_ACTION_ATTR}="${escapeAttr(action)}" ${INBOX_ID_ATTR}="${escapeAttr(id)}"`;
}

function proposalTitle(item) {
  if (item.agentProposal?.surface === 'context') return 'Profile context update';
  if (item.agentProposal?.surface === 'supplements') return 'Supplement log update';
  if (item.labPlanDraft) return item.labPlanDraft.title || 'Draft lab plan';
  if (item.scoreInvestigation) return item.scoreInvestigation.title || 'Biology Score investigation';
  return item.actionId || 'Agent proposal';
}

function proposalSummary(item) {
  return item.summary || item.agentProposal?.summary || item.labPlanDraft?.summary || item.actionId || '';
}

function proposalDetails(item) {
  const payload = item.agentProposal || item.labPlanDraft || item.scoreInvestigation || {};
  const text = JSON.stringify(payload, (key, value) => key === 'sourceText' ? undefined : value, 2);
  return `<details class="agent-proposal-details"><summary>Details</summary><pre>${escapeHTML(text)}</pre></details>`;
}

export function renderAgentProposalInbox(opts = {}) {
  const importedData = importedFrom(opts);
  const all = Array.isArray(importedData.agentProposals) ? importedData.agentProposals : [];
  const pending = listStoredAgentProposals({ importedData });
  const showHistory = opts.showHistory ?? inboxShowHistory;
  const visible = showHistory ? all : pending;
  const rows = visible.map(item => `<article class="agent-proposal-inbox-card agent-proposal-status-${escapeAttr(item.status || 'pending')}" data-agent-proposal-id="${escapeAttr(item.id)}">
    <div class="agent-proposal-kicker">${escapeHTML(item.source || 'agent')} · ${escapeHTML(item.actionId || '')} · ${escapeHTML(item.status || 'pending')}</div>
    <strong>${escapeHTML(proposalTitle(item))}</strong>
    ${proposalSummary(item) ? `<p>${escapeHTML(proposalSummary(item))}</p>` : ''}
    ${proposalDetails(item)}
    ${item.status === 'pending' ? `<div class="agent-proposal-actions">
      <button type="button" class="chat-action-btn" ${actionAttrs('apply', item.id)}>Apply</button>
      <button type="button" class="chat-action-btn" ${actionAttrs('dismiss', item.id)}>Dismiss</button>
    </div>` : ''}
  </article>`).join('');
  const countText = `${pending.length} pending`;
  return `<section class="agent-proposal-inbox" aria-label="Agent proposals">
    <div class="agent-proposal-kicker">Agent proposals <span class="agent-proposal-count">${escapeHTML(countText)}</span></div>
    <h3>Agent proposals</h3>
    <button type="button" class="chat-action-btn" ${actionAttrs('toggle-history', '')}>${showHistory ? 'Hide history' : 'Show history'}</button>
    ${rows || '<p class="agent-proposal-empty">No pending agent proposals.</p>'}
  </section>`;
}

function rerenderProfileContext() {
  const appWindow = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
  if (typeof appWindow.buildSidebar === 'function') {
    try { appWindow.buildSidebar(); } catch (err) { console.warn('[agent-proposal-inbox] sidebar refresh failed', err); }
  }
  const contextHubOpen = typeof document !== 'undefined' && document.getElementById('context-hub-overlay')?.classList.contains('show');
  if (contextHubOpen && typeof appWindow.openContextModal === 'function') return appWindow.openContextModal();
  if (typeof appWindow.renderContextCards === 'function') return appWindow.renderContextCards();
  if (typeof appWindow.renderProfileContextCards === 'function') {
    const main = typeof document !== 'undefined' ? document.querySelector('main') : null;
    if (main) main.innerHTML = appWindow.renderProfileContextCards();
  }
}

async function handleInboxClick(event) {
  const el = event.target?.closest?.(INBOX_SELECTOR);
  if (!el) return;
  event.preventDefault();
  const action = el.getAttribute(INBOX_ACTION_ATTR);
  const id = el.getAttribute(INBOX_ID_ATTR) || '';
  try {
    if (action === 'toggle-history') {
      inboxShowHistory = !inboxShowHistory;
    } else if (action === 'apply') {
      await applyStoredAgentProposal(id);
      showNotification?.('Agent proposal applied', 'success');
    } else if (action === 'dismiss') {
      await dismissStoredAgentProposal(id);
      showNotification?.('Agent proposal dismissed', 'info');
    } else return;
    rerenderProfileContext();
  } catch (err) {
    console.error('[agent-proposal-inbox] action failed', err);
    showNotification?.('Could not update agent proposal', 'error');
  }
}

let installed = false;
export function installAgentProposalInbox(root = typeof document !== 'undefined' ? document : null) {
  if (!root || installed) return;
  installed = true;
  root.addEventListener('click', handleInboxClick);
}

installAgentProposalInbox();

const proposalInboxWindow = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
proposalInboxWindow.renderAgentProposalInbox = renderAgentProposalInbox;
