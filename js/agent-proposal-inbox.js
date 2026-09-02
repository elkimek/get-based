// @ts-check
// agent-proposal-inbox.js — review UI for durable external-agent proposals.

import {
  applyStoredAgentProposal,
  dismissStoredAgentProposal,
  isStoredAgentProposalApplying,
} from './agent-access-proposals.js';
import { state } from './state.js';
import { showNotification } from './utils.js';

const inboxDeps = {
  apply: applyStoredAgentProposal,
  dismiss: dismissStoredAgentProposal,
  notify: (message, type = 'info') => showNotification(message, type, 5000),
  refresh: () => document.dispatchEvent(new CustomEvent('getbased-agent-proposals-changed')),
};

/** @param {Partial<typeof inboxDeps>} [deps] */
export function configureAgentProposalInboxDeps(deps = {}) {
  const previous = { ...inboxDeps };
  if (typeof deps.apply === 'function') inboxDeps.apply = deps.apply;
  if (typeof deps.dismiss === 'function') inboxDeps.dismiss = deps.dismiss;
  if (typeof deps.notify === 'function') inboxDeps.notify = deps.notify;
  if (typeof deps.refresh === 'function') inboxDeps.refresh = deps.refresh;
  return previous;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function proposalStatus(proposal) {
  if (proposal.status === 'applied') return 'Applied — saved to this profile';
  if (proposal.status === 'dismissed') return 'Dismissed — nothing was changed';
  if (Date.parse(proposal.expiresAt || '') <= Date.now()) return 'Expired — ask the agent to propose it again';
  return 'Waiting for your approval';
}

function renderProposal(proposal) {
  const pending = proposal.status === 'pending' && Date.parse(proposal.expiresAt || '') > Date.now();
  const applying = isStoredAgentProposalApplying(proposal.id);
  const duration = Number(proposal.arguments?.durationMinutes);
  const title = proposal.actionId === 'sun.session.log' && Number.isFinite(duration)
    ? `Log ${escapeHtml(duration)} minutes of sunlight`
    : escapeHtml(proposal.actionId || 'Unknown action');
  const endedAtValue = proposal.arguments?.endedAt;
  const endedAtMillis = typeof endedAtValue === 'string' ? Date.parse(endedAtValue) : Number.NaN;
  const endedAt = Number.isFinite(endedAtMillis)
    ? `<div class="agent-inbox-card__time">Session ended <time datetime="${escapeHtml(endedAtValue)}">${escapeHtml(new Date(endedAtMillis).toLocaleString())}</time></div>`
    : '';
  const notes = proposal.arguments?.notes
    ? `<div class="agent-inbox-card__notes">${escapeHtml(proposal.arguments.notes)}</div>`
    : '';
  const controls = pending ? `
    <div class="agent-inbox-card__actions">
      <button class="import-btn import-btn-primary" type="button" data-agent-proposal-action="apply" data-proposal-id="${escapeHtml(proposal.id)}"${applying ? ' disabled aria-busy="true"' : ''}>${applying ? 'Applying…' : 'Apply'}</button>
      <button class="import-btn import-btn-secondary" type="button" data-agent-proposal-action="dismiss" data-proposal-id="${escapeHtml(proposal.id)}"${applying ? ' disabled' : ''}>Dismiss</button>
    </div>` : '';
  return `
    <article class="agent-inbox-card agent-inbox-card--${escapeHtml(proposal.status || 'pending')}">
      <div class="agent-inbox-card__eyebrow">From ${escapeHtml(proposal.sourceClient || 'external agent')}</div>
      <h4>${title}</h4>
      ${endedAt}
      ${notes}
      <div class="agent-inbox-card__status">${escapeHtml(proposalStatus(proposal))}</div>
      ${controls}
    </article>`;
}

export function renderAgentProposalInbox() {
  const proposals = Array.isArray(state.importedData.agentProposals)
    ? [...state.importedData.agentProposals]
    : [];
  proposals.sort((a, b) => {
    const pendingDelta = Number(b?.status === 'pending') - Number(a?.status === 'pending');
    if (pendingDelta) return pendingDelta;
    return Date.parse(b?.updatedAt || b?.issuedAt || '') - Date.parse(a?.updatedAt || a?.issuedAt || '');
  });
  const pendingCount = proposals.filter(proposal => proposal?.status === 'pending'
    && Date.parse(proposal.expiresAt || '') > Date.now()).length;
  const body = proposals.length
    ? proposals.slice(0, 10).map(renderProposal).join('')
    : '<p class="agent-inbox-empty">No agent proposals yet. External agents can suggest actions, but only you can Apply them.</p>';
  return `
    <section class="agent-proposal-inbox" aria-labelledby="agent-proposal-inbox-title">
      <div class="agent-proposal-inbox__header">
        <div>
          <span class="context-section-kicker">Agent Access</span>
          <h3 id="agent-proposal-inbox-title">Agent proposals</h3>
        </div>
        ${pendingCount ? `<span class="agent-proposal-inbox__count">${pendingCount} pending</span>` : ''}
      </div>
      <p class="agent-proposal-inbox__intro">Encrypted suggestions from connected agents. Nothing changes until you review and Apply.</p>
      <div class="agent-proposal-inbox__list">${body}</div>
    </section>`;
}

let inboxActionsInstalled = false;
const inboxActionInFlight = new Map();

export function installAgentProposalInboxActions() {
  if (inboxActionsInstalled) return;
  inboxActionsInstalled = true;
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-agent-proposal-action][data-proposal-id]')
      : null;
    if (!(target instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const proposalId = target.dataset.proposalId || '';
    const action = target.dataset.agentProposalAction;
    if (!proposalId || !['apply', 'dismiss'].includes(action || '') || inboxActionInFlight.has(proposalId)) return;
    target.disabled = true;
    target.setAttribute('aria-busy', 'true');
    const task = action === 'apply' ? inboxDeps.apply(proposalId) : inboxDeps.dismiss(proposalId);
    inboxActionInFlight.set(proposalId, task);
    try {
      const result = await task;
      if (!result?.ok) {
        const message = result?.code === 'proposal_expired'
          ? 'This proposal expired. Ask the agent to propose it again.'
          : 'Could not update this proposal.';
        inboxDeps.notify(message, 'error');
      } else if (action === 'apply') {
        inboxDeps.notify('Agent proposal applied.', 'success');
      } else {
        inboxDeps.notify('Agent proposal dismissed.', 'info');
      }
    } catch {
      inboxDeps.notify('Could not update this proposal.', 'error');
    } finally {
      inboxActionInFlight.delete(proposalId);
      inboxDeps.refresh();
    }
  });
}
