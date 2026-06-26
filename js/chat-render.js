// @ts-check
// chat-render.js — chat transcript rendering

import { state } from './state.js';
import { calculateCost, formatCost } from './schema.js';
import { escapeAttr, escapeHTML } from './utils.js';
import {
  getAIProvider, getActiveModelDisplay, getActiveModelId,
} from './api.js';
import { renderMarkdown } from './markdown.js';
import { buildActionBar, chatMessageActionAttrs } from './chat-actions.js';
import { responseLimitNote } from './chat-continuation.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import { updateChatHeaderTitle } from './chat-personalities.js';
import { updateChatInputState } from './chat-panel.js';
import { updateDiscussButton } from './chat-discussion.js';
import { renderEmptyChatState } from './chat-empty-state.js';

export { _getNoDataPrompts } from './chat-empty-state.js';

function bindRenderedChatContainClicks(container) {
  container.querySelectorAll('[data-chat-message-action="contain-click"]').forEach(el => {
    el.addEventListener('click', event => event.stopPropagation());
  });
}

function renderAgentProposalChangeRow(change, index, proposal) {
  if (proposal.editing && proposal.surface === 'supplements') {
    const name = `<input class="agent-proposal-input" data-agent-proposal-change-index="${index}" data-agent-proposal-field="name" value="${escapeAttr(change.name || '')}" aria-label="Supplement name">`;
    if (change.action === 'add_or_update') {
      return `<li class="agent-proposal-edit-grid"><span>+</span>${name}<input class="agent-proposal-input" data-agent-proposal-change-index="${index}" data-agent-proposal-field="dosage" value="${escapeAttr(change.dosage || '')}" placeholder="Dose" aria-label="Dose"><input class="agent-proposal-input" data-agent-proposal-change-index="${index}" data-agent-proposal-field="schedule" value="${escapeAttr(change.schedule || '')}" placeholder="Schedule" aria-label="Schedule"><input class="agent-proposal-input" type="date" data-agent-proposal-change-index="${index}" data-agent-proposal-field="startDate" value="${escapeAttr(change.startDate || '')}" aria-label="Start date"></li>`;
    }
    return `<li class="agent-proposal-edit-grid"><span>~</span>${name}<input class="agent-proposal-input" type="date" data-agent-proposal-change-index="${index}" data-agent-proposal-field="endDate" value="${escapeAttr(change.endDate || '')}" aria-label="Stop date"></li>`;
  }
  if (change.action === 'add_or_update') {
    const meta = [change.dosage, change.schedule, change.startDate ? `Start ${change.startDate}` : ''].filter(Boolean).join(' · ');
    return `<li><strong>+ ${escapeHTML(change.name)}</strong>${meta ? ` <span>${escapeHTML(meta)}</span>` : ''}</li>`;
  }
  if (change.action === 'end') {
    return `<li><strong>~ ${escapeHTML(change.name)}</strong> <span>Stop ${escapeHTML(change.endDate || 'now')}</span></li>`;
  }
  if (proposal.surface === 'context') {
    if (change.field === 'healthGoals') return `<li><strong>+ Health goals</strong> <span>${escapeHTML(change.item?.text || '')}</span></li>`;
    const details = Object.entries(change.patch || {}).filter(([key]) => key !== 'updatedAt').map(([key, value]) => `${key}: ${value}`).join(' · ');
    return `<li><strong>~ ${escapeHTML(change.label || change.field)}</strong>${details ? ` <span>${escapeHTML(details)}</span>` : ''}</li>`;
  }
  return '';
}

function renderAgentProposalCard(proposal, msgIndex) {
  if (!proposal || !['supplements', 'context'].includes(proposal.surface) || !Array.isArray(proposal.changes)) return '';
  const status = proposal.status || 'pending';
  const rows = proposal.changes.map((change, index) => renderAgentProposalChangeRow(change, index, proposal)).filter(Boolean).join('');
  const actions = status === 'pending'
    ? proposal.editing
      ? `<div class="agent-proposal-actions">
        <button type="button" class="chat-action-btn" data-chat-message-action="save-agent-proposal-edits" data-chat-message-index="${msgIndex}">Save edits</button>
        <button type="button" class="chat-action-btn" data-chat-message-action="dismiss-agent-proposal" data-chat-message-index="${msgIndex}">Dismiss</button>
      </div>`
      : `<div class="agent-proposal-actions">
        <button type="button" class="chat-action-btn" data-chat-message-action="apply-agent-proposal" data-chat-message-index="${msgIndex}">Apply changes</button>
        ${proposal.surface === 'supplements' ? `<button type="button" class="chat-action-btn" data-chat-message-action="edit-agent-proposal" data-chat-message-index="${msgIndex}">Edit</button>` : ''}
        <button type="button" class="chat-action-btn" data-chat-message-action="dismiss-agent-proposal" data-chat-message-index="${msgIndex}">Dismiss</button>
      </div>`
    : `<div class="agent-proposal-status">${status === 'applied' ? 'Applied' : 'Dismissed'}</div>`;
  return `<section class="agent-proposal-card" data-agent-proposal-message-index="${msgIndex}" aria-label="Agent proposed update">
    <div class="agent-proposal-kicker">Proposed update</div>
    <strong>${proposal.surface === 'context' ? 'Profile context' : 'Supplements &amp; meds'}</strong>
    <ul>${rows}</ul>
    ${actions}
  </section>`;
}

function renderLabPlanDraftCard(plan, msgIndex) {
  if (!plan || !Array.isArray(plan.bundles)) return '';
  const bundles = plan.bundles.map(bundle => {
    const markers = (bundle.markers || []).map(marker => `<li>${escapeHTML(marker)}</li>`).join('');
    return `<div class="agent-lab-plan-bundle">
      <strong>${escapeHTML(bundle.label || '')}</strong>
      ${bundle.rationale ? `<p>${escapeHTML(bundle.rationale)}</p>` : ''}
      <ul>${markers}</ul>
    </div>`;
  }).join('');
  return `<section class="agent-lab-plan-card" data-agent-lab-plan-message-index="${msgIndex}" aria-label="Draft lab plan">
    <div class="agent-proposal-kicker">Draft lab plan</div>
    <strong>${escapeHTML(plan.title || 'Draft lab plan')}</strong>
    <p>${escapeHTML(plan.safetyNote || 'Draft only — nothing is ordered, saved, or sent anywhere.')}</p>
    ${bundles}
    <div class="agent-proposal-actions">
      <button type="button" class="chat-action-btn" data-chat-message-action="copy-lab-plan-draft" data-chat-message-index="${msgIndex}">Copy plan</button>
    </div>
  </section>`;
}

/**
 * Render the collapsible "Sources" block under an assistant message.
 * Shows the excerpts the lens returned for this question — filename, score,
 * and the actual chunk text. Lets users verify what the AI was grounded on
 * (or not, if its answer drifts from the cited sources). Collapsed by
 * default so the chat stays scannable.
 */
export function _renderLensSources(chunks, sourceName) {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';
  const sourceLabel = sourceName ? escapeHTML(sourceName) : 'knowledge base';
  const items = chunks.map((c, i) => {
    const src = c.source || `excerpt ${i + 1}`;
    const score = typeof c.score === 'number'
      ? `<span class="chat-lens-source-score" title="Cosine similarity">${c.score.toFixed(2)}</span>`
      : '';
    const text = c.text ? escapeHTML(c.text).replace(/\n/g, '<br>') : '';
    return `<details class="chat-lens-source" ${chatMessageActionAttrs('contain-click')}>
      <summary class="chat-lens-source-summary">
        <span class="chat-lens-source-name">${escapeHTML(src)}</span>
        ${score}
      </summary>
      <div class="chat-lens-source-text">${text}</div>
    </details>`;
  }).join('');
  return `<details class="chat-lens-sources" ${chatMessageActionAttrs('contain-click')}>
    <summary class="chat-lens-sources-summary">📎 ${chunks.length} excerpt${chunks.length !== 1 ? 's' : ''} from ${sourceLabel}</summary>
    <div class="chat-lens-sources-body">${items}</div>
  </details>`;
}

export function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const panel = document.getElementById('chat-panel');
  panel?.classList.remove('chat-onboarding-active');

  if (state.chatHistory.length === 0) {
    renderEmptyChatState(container, panel);
    updateDiscussButton();
    return;
  }
  let html = '';
  let lastPersonaName = null;
  for (let i = 0; i < state.chatHistory.length; i++) {
    const msg = state.chatHistory[i];
    const cls = msg.role === 'user' ? 'chat-user' : 'chat-ai';
    // "Joined" system messages
    if (msg.joined) {
      html += `<div class="chat-persona-joined">${msg.joinIcon || ''} ${escapeHTML(msg.joinName || '')} joined the discussion</div>`;
      continue;
    }
    // Hidden auto messages (instruction sent to API but not shown)
    if (msg.hidden) continue;
    // Show persona label when personality changes between AI messages
    if (msg.role === 'assistant' && msg.personalityName && msg.personalityName !== lastPersonaName) {
      html += `<div class="chat-persona-label">${msg.personalityIcon || ''} ${escapeHTML(msg.personalityName)}</div>`;
    }
    if (msg.role === 'assistant') lastPersonaName = msg.personalityName || null;
    const autoClass = msg.auto ? ' chat-msg-auto' : '';
    const stoppedNote = msg.stopped ? '<div class="chat-stopped-note">[stopped]</div>' : '';
    let imageBadge = '';
    if (msg.hasImages) {
      if (msg.thumbnails && msg.thumbnails.length > 0) {
        imageBadge = '<div class="chat-image-thumbs">' + msg.thumbnails.map(t =>
          `<img src="${t}" class="chat-image-thumb" alt="attached image" ${chatMessageActionAttrs('open-image-lightbox')}>`
        ).join('') + '</div>';
      } else {
        imageBadge = `<div class="chat-image-badge">\uD83D\uDDBC ${msg.imageCount} image${msg.imageCount !== 1 ? 's' : ''} attached</div>`;
      }
    }
    html += `<div class="chat-msg ${cls}${autoClass}" id="chat-msg-${i}">${imageBadge}${renderMarkdown(msg.content)}${stoppedNote}`;
    if (msg.role === 'assistant' && msg.agentProposal) html += renderAgentProposalCard(msg.agentProposal, i);
    if (msg.role === 'assistant' && msg.labPlanDraft) html += renderLabPlanDraftCard(msg.labPlanDraft, i);
    if (msg.role === 'assistant' && msg.truncated) html += responseLimitNote();
    if (msg.role === 'assistant') {
      if (msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens)) {
        const mId = msg.modelId || getActiveModelId();
        const mProvider = msg.provider || (msg.modelId ? (msg.modelId.includes('/') ? 'openrouter' : getAIProvider()) : getAIProvider());
        const cost = calculateCost(mProvider, mId, msg.usage.inputTokens, msg.usage.outputTokens);
        const totalTokens = (msg.usage.inputTokens || 0) + (msg.usage.outputTokens || 0);
        const mName = msg.modelDisplay || getActiveModelDisplay();
        const webTag = msg.webSearch ? ' \u00b7 \ud83c\udf10 web' : '';
        const e2eeTag = msg.e2ee ? e2eeLockFootnote(msg.attestation) : '';
        html += `<div class="chat-cost-footnote">${escapeHTML(mName)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}</div>`;
      }
      html += buildActionBar(i);
      // Lens citations — show which excerpts the AI received with this question.
      // Persisted on the message so re-rendering or switching threads keeps
      // the sources visible. Collapsed by default to keep the chat scannable;
      // user can expand any time to verify what grounded the response.
      if (msg.lensSources?.length) {
        html += _renderLensSources(msg.lensSources, msg.lensSourceName);
      }
      // EMF hint (persisted, single-line link to assessment editor)
      if (msg.emfHint && window.isProductRecsEnabled?.()) {
        html += `<div class="chat-emf-hint"><span aria-hidden="true">💡</span> Curious about your EMF environment? <a href="#" ${chatMessageActionAttrs('open-emf-assessment')} data-umami-event="emf-nudge-chat">Open the assessment →</a></div>`;
      }
      // Rec slots (persisted on message, rendered from catalog)
      if (msg.recSlots?.length && window.isProductRecsEnabled?.() && window.renderRecommendationSectionSync && window._cachedCatalog?.slots) {
        const recSections = msg.recSlots.map(slot => {
          const slotLabel = window._cachedCatalog.slots[slot]?.label || slot.split('.').pop();
          return window.renderRecommendationSectionSync(slot, { label: slotLabel, maxProducts: 2 });
        }).filter(Boolean);
        if (recSections.length) {
          html += `<details class="rec-chat-wrapper" ${chatMessageActionAttrs('contain-click')}><summary class="rec-chat-summary">What can help</summary>`;
          let recBody = recSections.map(s => s.replace('rec-section-header', 'rec-chat-subheading')).join('');
          // Deduplicate disclosure banners (each renderRecommendationSectionSync prepends one)
          let bannerCount = 0;
          recBody = recBody.replace(/<div class="rec-disclosure-banner">[\s\S]*?<\/div>/g, m => ++bannerCount > 1 ? '' : m);
          html += recBody;
          html += `</details>`;
        }
      }
    }
    html += '</div>';
  }
  container.innerHTML = html;
  bindRenderedChatContainClicks(container);
  container.scrollTop = container.scrollHeight;
  updateDiscussButton();
  updateChatHeaderTitle();
  updateChatInputState();
}
