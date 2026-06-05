// @ts-check
// chat-actions.js — message action bar rendering and handlers

import { state } from './state.js';
import { escapeHTML, showNotification } from './utils.js';
import { CHAT_ICON_COPY, CHAT_ICON_REFRESH, setIconButtonContent } from './chat-icons.js';
import { saveChatHistory } from './chat-history.js';
import { buildLabOrderCopyText, buildLabPlanCopyText } from './lab-order-render.js';
import { hasAIProvider } from './api.js';
import { buildAILabPlanFromThread } from './lab-plan-ai.js';

export function buildActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'assistant') return '';
  const isLast = msgIndex === state.chatHistory.length - 1;

  let html = '<div class="chat-action-bar">';
  if (isLast) {
    html += `<button class="chat-action-btn" onclick="regenerateLastMessage()" title="Regenerate response">${CHAT_ICON_REFRESH}<span>Regenerate</span></button>`;
  }
  html += `<button class="chat-action-btn" onclick="copyMessage(${msgIndex})" id="chat-copy-btn-${msgIndex}" title="Copy to clipboard">${CHAT_ICON_COPY}<span>Copy</span></button>`;
  html += '</div>';

  if (msg.context && msg.context.length > 0) {
    html += `<div class="chat-context-toggle" onclick="toggleContextDetails(${msgIndex})">`;
    html += `<span class="chat-toggle-arrow" id="chat-ctx-arrow-${msgIndex}">\u25B8</span> Context used (${msg.context.length} area${msg.context.length !== 1 ? 's' : ''})`;
    html += '</div>';
    html += `<div class="chat-context-details" id="chat-ctx-details-${msgIndex}" style="display:none">`;
    for (const area of msg.context) {
      html += `<span class="chat-context-item">\u2713 ${escapeHTML(area.label)}${area.detail ? ' (' + escapeHTML(area.detail) + ')' : ''}</span>`;
    }
    html += '</div>';
  }

  return html;
}

export function regenerateLastMessage() {
  if (state.chatHistory.length < 2) return;
  if (window.isChatStreaming?.()) return;
  const renderChatMessages = window.renderChatMessages;
  const sendChatMessage = window.sendChatMessage;
  if (typeof renderChatMessages !== 'function' || typeof sendChatMessage !== 'function') return;

  state.chatHistory.pop();
  const lastUserMsg = state.chatHistory[state.chatHistory.length - 1];
  if (!lastUserMsg || lastUserMsg.role !== 'user') return;
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  if (input) input.value = lastUserMsg.content;
  state.chatHistory.pop();
  void saveChatHistory();
  renderChatMessages();
  sendChatMessage();
}

export function buildMessageCopyText(msg) {
  if (!msg) return '';
  const sections = [msg.content || ''];
  const planText = msg.labOrderDraft ? '' : buildLabPlanCopyText(msg.labPlanDraft);
  const orderText = buildLabOrderCopyText(msg.labOrderDraft);
  if (planText) sections.push(planText);
  if (orderText) sections.push(orderText);
  return sections.filter(Boolean).join('\n\n');
}

export function copyMessage(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg) return;
  const btn = document.getElementById(`chat-copy-btn-${msgIndex}`);
  if (!navigator.clipboard) {
    if (btn) {
      setIconButtonContent(btn, 'x', 'Not supported');
      setTimeout(() => { setIconButtonContent(btn, 'copy', 'Copy'); }, 1500);
    }
    return;
  }
  navigator.clipboard.writeText(buildMessageCopyText(msg)).then(() => {
    if (btn) {
      setIconButtonContent(btn, 'check', 'Copied');
      setTimeout(() => { setIconButtonContent(btn, 'copy', 'Copy'); }, 1500);
    }
  }).catch(() => {
    if (btn) {
      setIconButtonContent(btn, 'x', 'Failed');
      setTimeout(() => { setIconButtonContent(btn, 'copy', 'Copy'); }, 1500);
    }
  });
}

export function toggleContextDetails(msgIndex) {
  const details = document.getElementById(`chat-ctx-details-${msgIndex}`);
  const arrow = document.getElementById(`chat-ctx-arrow-${msgIndex}`);
  if (!details) return;
  const open = details.style.display !== 'none';
  details.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.textContent = open ? '\u25B8' : '\u25BE';
}

function setLabPlanButtonBusy(isBusy) {
  const btn = document.querySelector('[data-chat-action="build-lab-plan"]');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.disabled = !!isBusy;
  btn.classList.toggle('is-loading', !!isBusy);
  btn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  btn.title = isBusy ? 'Building lab plan…' : 'Build lab plan from this conversation';
  btn.setAttribute('aria-label', isBusy ? 'Building lab plan' : 'Build lab plan');
  const label = btn.querySelector('.chat-lab-plan-btn-label');
  if (label) label.textContent = isBusy ? 'Building lab plan…' : 'Build lab plan';
}

export async function buildLabPlanFromThreadAction() {
  if (!Array.isArray(state.chatHistory) || state.chatHistory.length === 0) {
    showNotification('No conversation to turn into a lab plan yet', 'info');
    return;
  }
  if (!hasAIProvider()) {
    window.renderChatMessages?.();
    return;
  }
  setLabPlanButtonBusy(true);
  try {
    const result = await buildAILabPlanFromThread(state.chatHistory);
    const plan = result.plan;
    const rationale = plan.rationale ? `\n\nLogic: ${plan.rationale}` : '';
    const usage = result.usage && (result.usage.inputTokens || result.usage.outputTokens)
      ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
      : null;
    state.chatHistory.push({
      role: 'assistant',
      content: `I built a focused next-blood-draw plan from this conversation.${rationale}\n\nReview/edit the tests, then use Compare labs to check verified online offers.`,
      provider: result.provider,
      modelId: result.modelId,
      modelDisplay: result.modelDisplay || 'AI lab planner',
      usage,
      labPlanDraft: plan,
    });
    window.renderChatMessages?.();
    await saveChatHistory();
    showNotification('AI lab plan created', 'success');
  } catch (err) {
    showNotification(`Lab plan failed: ${err?.message || 'AI planner error'}`, 'error');
  } finally {
    setLabPlanButtonBusy(false);
  }
}

Object.assign(window, {
  regenerateLastMessage,
  copyMessage,
  toggleContextDetails,
  buildLabPlanFromThreadAction,
});
