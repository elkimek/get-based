// @ts-check
// chat-render.js — chat transcript rendering

import { state } from './state.js';
import { calculateCost, formatCost } from './schema.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
import {
  getAIProvider, getActiveModelDisplay, getActiveModelId,
} from './api.js';
import { renderMarkdown } from './markdown.js';
import {
  buildActionBar, buildForkSourceNotice, buildUserActionBar, chatMessageActionAttrs,
} from './chat-actions.js';
import { responseLimitNote } from './chat-continuation.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import { updateChatHeaderTitle } from './chat-personalities.js';
import { updateChatInputState } from './chat-panel.js';
import { updateDiscussButton } from './chat-discussion.js';
import { renderEmptyChatState } from './chat-empty-state.js';
import { isChatRenderProductRecsEnabled, renderChatRecommendationSections } from './chat-render-runtime.js';
import { sanitizeChatThumbnailUrl } from './chat-storage-safety.js';
import { recommendationSummaryHTML } from './chat-recommendation-disclosure.js';
import {
  followChatLatest, initChatScrollControls, notifyChatContentAdded,
} from './chat-scroll.js';
import {
  expandChatRenderWindow,
  getChatRenderStart,
  resetChatRenderWindow,
  revealChatRenderIndex,
} from './chat-render-range.js';
import {
  applyRenderedChatMessageAvatars, shouldShowChatPersonaLabel,
} from './chat-message-avatars.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';

export { _getNoDataPrompts } from './chat-empty-state.js';

function bindRenderedChatContainClicks(container) {
  container.querySelectorAll('[data-chat-message-action="contain-click"]').forEach(el => {
    el.addEventListener('click', event => event.stopPropagation());
  });
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

/** @param {{ preserveScroll?: boolean }} [options] */
export function renderChatMessages({ preserveScroll = false } = {}) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  initChatScrollControls();
  const panel = document.getElementById('chat-panel');
  panel?.classList.remove('chat-onboarding-active');

  if (state.chatHistory.length === 0) {
    resetChatRenderWindow(state.currentThreadId);
    renderEmptyChatState(container, panel);
    followChatLatest(container, { behavior: 'auto' });
    updateDiscussButton();
    return;
  }
  const renderStart = getChatRenderStart(state.currentThreadId, state.chatHistory.length);
  let html = buildForkSourceNotice();
  html += renderStart > 0
    ? `<div class="chat-history-window"><button type="button" class="chat-history-earlier" ${chatMessageActionAttrs('show-earlier-messages')}>Show earlier messages <span>(${renderStart} remaining)</span></button></div>`
    : '';
  let lastPersonaName = null;
  for (let i = renderStart; i < state.chatHistory.length; i++) {
    const msg = state.chatHistory[i];
    const cls = msg.role === 'user' ? 'chat-user' : 'chat-ai';
    // "Joined" system messages
    if (msg.joined) {
      html += `<div class="chat-persona-joined">${escapeHTML(msg.joinIcon || '')} ${escapeHTML(msg.joinName || '')} joined the discussion</div>`;
      continue;
    }
    // Hidden auto messages (instruction sent to API but not shown)
    if (msg.hidden) continue;
    // Show persona label when personality changes between AI messages
    if (msg.role === 'assistant' && shouldShowChatPersonaLabel(msg) && msg.personalityName !== lastPersonaName) {
      html += `<div class="chat-persona-label">${escapeHTML(msg.personalityIcon || '')} ${escapeHTML(msg.personalityName)}</div>`;
    }
    if (msg.role === 'assistant') lastPersonaName = msg.personalityName || null;
    const autoClass = msg.auto ? ' chat-msg-auto' : '';
    const stoppedNote = msg.stopped ? '<div class="chat-stopped-note">[stopped]</div>' : '';
    let imageBadge = '';
    if (msg.hasImages) {
      const thumbnails = Array.isArray(msg.thumbnails)
        ? msg.thumbnails.map(sanitizeChatThumbnailUrl).filter(Boolean)
        : [];
      if (thumbnails.length > 0) {
        imageBadge = '<div class="chat-image-thumbs">' + thumbnails.map(t =>
          `<img src="${escapeAttr(t)}" class="chat-image-thumb" alt="attached image" ${chatMessageActionAttrs('open-image-lightbox')}>`
        ).join('') + '</div>';
      } else {
        const imageCount = Number.isFinite(Number(msg.imageCount))
          ? Math.max(0, Math.trunc(Number(msg.imageCount)))
          : 0;
        imageBadge = `<div class="chat-image-badge">\uD83D\uDDBC ${imageCount} image${imageCount !== 1 ? 's' : ''} attached</div>`;
      }
    }
    const messageBody = msg.error
      ? `<span style="color:var(--red)">${escapeHTML(msg.content)}</span>`
      : renderMarkdown(msg.content);
    const messageLabel = msg.role === 'user' ? 'You' : msg.personalityName || 'AI response';
    html += `<div class="chat-msg ${cls}${autoClass}" id="chat-msg-${i}" role="article" aria-label="${escapeAttr(messageLabel)}">${imageBadge}${messageBody}${stoppedNote}`;
    if (msg.role === 'user') html += buildUserActionBar(i);
    if (msg.role === 'assistant' && msg.truncated) html += responseLimitNote();
    if (msg.role === 'assistant') {
      const usageProvider = msg.provider || (msg.modelId ? (msg.modelId.includes('/') ? 'openrouter' : getAIProvider()) : getAIProvider());
      if (msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens) && !shouldHideAppExtensionAIUsage(usageProvider)) {
        const mId = msg.modelId || getActiveModelId();
        const mProvider = usageProvider;
        const cost = calculateCost(mProvider, mId, msg.usage.inputTokens, msg.usage.outputTokens);
        const totalTokens = Math.max(0, Number(msg.usage.inputTokens) || 0)
          + Math.max(0, Number(msg.usage.outputTokens) || 0);
        const mName = msg.modelDisplay || getActiveModelDisplay();
        const webTag = msg.webSearch ? ' \u00b7 \ud83c\udf10 web' : '';
        const e2eeTag = msg.e2ee ? e2eeLockFootnote(msg.attestation) : '';
        html += `<div class="chat-cost-footnote">${escapeHTML(mName)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}</div>`;
      }
      const attribution = getAIOutputAttribution(msg);
      if (attribution) html += `<div class="chat-provider-attribution">${escapeHTML(attribution)}</div>`;
      html += buildActionBar(i);
      // Lens citations — show which excerpts the AI received with this question.
      // Persisted on the message so re-rendering or switching threads keeps
      // the sources visible. Collapsed by default to keep the chat scannable;
      // user can expand any time to verify what grounded the response.
      if (msg.lensSources?.length) {
        html += _renderLensSources(msg.lensSources, msg.lensSourceName);
      }
      // EMF hint (persisted, single-line link to assessment editor)
      if (msg.emfHint && isChatRenderProductRecsEnabled()) {
        html += `<div class="chat-emf-hint"><span aria-hidden="true">💡</span> Curious about your EMF environment? <a href="#" ${chatMessageActionAttrs('open-emf-assessment')} data-umami-event="emf-nudge-chat">Open the assessment →</a></div>`;
      }
      // Rec slots (persisted on message, rendered from catalog)
      if (msg.recSlots?.length) {
        const recSections = renderChatRecommendationSections(msg.recSlots);
        if (recSections.length) {
          const openAttr = msg.recOpen ? ' open' : '';
          const unseenClass = msg.recNew ? ' rec-chat-unseen' : '';
          html += `<details class="rec-chat-wrapper${unseenClass}" ${chatMessageActionAttrs('contain-click', { index: i })}${openAttr}><summary class="rec-chat-summary">${recommendationSummaryHTML(recSections.length, Boolean(msg.recNew))}</summary>`;
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
  applyRenderedChatMessageAvatars(container, state.chatHistory, renderStart);
  bindRenderedChatContainClicks(container);
  if (preserveScroll) notifyChatContentAdded(container);
  else followChatLatest(container, { behavior: 'auto' });
  updateDiscussButton();
  updateChatHeaderTitle();
  updateChatInputState();
}

export function showEarlierChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container || !state.currentThreadId) return false;
  const previousHeight = container.scrollHeight;
  const previousTop = container.scrollTop;
  const nextStart = expandChatRenderWindow(state.currentThreadId, state.chatHistory.length);
  renderChatMessages({ preserveScroll: true });
  requestAnimationFrame(() => {
    container.scrollTop = previousTop + Math.max(0, container.scrollHeight - previousHeight);
    if (nextStart > 0) /** @type {HTMLElement | null} */ (
      container.querySelector('.chat-history-earlier')
    )?.focus();
  });
  return true;
}

/** @param {number} index */
export function revealChatMessage(index) {
  if (!state.currentThreadId) return false;
  const changed = revealChatRenderIndex(state.currentThreadId, index, state.chatHistory.length);
  if (changed) renderChatMessages({ preserveScroll: true });
  return changed;
}
