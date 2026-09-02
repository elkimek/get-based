// @ts-check
// agent-proposal-ui.js — persisted chat proposal cards for semantic app actions.

import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { escapeAttr, escapeHTML } from './utils.js';

function formatEndedAt(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'When you sent the message';
  return new Date(value).toLocaleString();
}

/**
 * @param {Record<string, any>} proposal
 * @param {number} messageIndex
 */
export function renderAgentProposalCard(proposal, messageIndex) {
  if (!proposal || proposal.actionId !== 'sun.session.log') return '';
  const args = proposal.arguments || {};
  const status = ['pending', 'applying', 'applied', 'dismissed'].includes(proposal.status)
    ? proposal.status
    : 'pending';
  const duration = Number(args.durationMinutes);
  const durationText = Number.isFinite(duration) ? `${duration} minutes` : 'Not specified';
  const notes = typeof args.notes === 'string' && args.notes.trim()
    ? `<div class="agent-proposal-field"><span>Note</span><strong>${escapeHTML(args.notes.trim())}</strong></div>`
    : '';
  const error = proposal.lastError
    ? `<div class="agent-proposal-error" role="alert">${escapeHTML(proposal.lastError)}</div>`
    : '';
  const persistenceWarning = proposal.statusPersistenceError
    ? '<div class="agent-proposal-warning" role="status">The session is saved, but this confirmation may disappear after reload.</div>'
    : '';

  let footer = '';
  if (status === 'pending') {
    footer = `<div class="agent-proposal-actions">
      <button class="agent-proposal-apply" type="button" ${chatMessageActionAttrs('apply-agent-proposal', { index: messageIndex })}>Apply</button>
      <button class="agent-proposal-dismiss" type="button" ${chatMessageActionAttrs('dismiss-agent-proposal', { index: messageIndex })}>Cancel</button>
    </div>`;
  } else if (status === 'applying') {
    footer = '<div class="agent-proposal-status" aria-live="polite">Saving session…</div>';
  } else if (status === 'applied') {
    footer = '<div class="agent-proposal-status agent-proposal-status-success">✓ Saved to Sun sessions</div>';
  } else {
    footer = '<div class="agent-proposal-status">Cancelled — nothing was saved</div>';
  }

  return `<section class="agent-proposal-card" data-agent-proposal-status="${escapeAttr(status)}" aria-label="Proposed app action">
    <div class="agent-proposal-eyebrow">Proposed app action</div>
    <h4>Log completed sunlight session</h4>
    <div class="agent-proposal-grid">
      <div class="agent-proposal-field"><span>Duration</span><strong>${escapeHTML(durationText)}</strong></div>
      <div class="agent-proposal-field"><span>Ended</span><strong>${escapeHTML(formatEndedAt(args.endedAt))}</strong></div>
      ${notes}
    </div>
    ${status === 'pending' ? '<p class="agent-proposal-privacy">Review before anything is saved.</p>' : ''}
    ${error}
    ${persistenceWarning}
    ${footer}
  </section>`;
}
