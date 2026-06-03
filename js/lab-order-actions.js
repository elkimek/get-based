// lab-order-actions.js — user-confirmed Labshop cart preparation handlers.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { selectProviderForDraft, buildLabOrderDraftFromMarkers } from './lab-order-intent.js';

function getDraftForMessage(msgIndex) {
  const msg = state.chatHistory[Number(msgIndex)];
  return msg?.labOrderDraft ? { msg, draft: msg.labOrderDraft } : null;
}

function getPlanForMessage(msgIndex) {
  const msg = state.chatHistory[Number(msgIndex)];
  return msg?.labPlanDraft ? { msg, plan: msg.labPlanDraft } : null;
}

async function prepareCart(msgIndex) {
  const found = getDraftForMessage(msgIndex);
  if (!found) return;
  const { draft } = found;
  draft.status = 'preparing';
  renderChatMessages();
  try {
    const resp = await fetch('/api/labshop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_cart_preview',
        products: draft.products.map(p => ({ idProduct: p.providerProductId, quantity: 1 })),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `Labshop API returned ${resp.status}`);
    draft.status = 'cart_created';
    draft.result = {
      ok: true,
      message: data.message || 'Preview cart prepared. Continue checkout on Labshop.',
      checkoutUrl: data.checkoutUrl || 'https://www.labshop.cz/kosik/prehled',
      boundary: data.boundary || 'checkout_handoff_required',
      items: data.items || [],
    };
    showNotification('Labshop cart preview ready', 'success');
  } catch (err) {
    draft.status = 'failed';
    draft.result = { ok: false, message: err?.message || 'Labshop cart preparation failed.' };
    showNotification('Labshop cart preview failed', 'error');
  }
  await saveChatHistory();
  renderChatMessages();
}

async function prepareUnilabsCart(msgIndex) {
  const found = getDraftForMessage(msgIndex);
  if (!found) return;
  const { draft } = found;
  draft.status = 'preparing';
  renderChatMessages();
  try {
    const resp = await fetch('/api/unilabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_cart_preview',
        products: draft.products.map(p => ({ productId: p.providerProductId, quantity: 1 })),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `Unilabs API returned ${resp.status}`);
    draft.status = 'cart_created';
    draft.result = {
      ok: true,
      message: data.message || 'Unilabs cart preview prepared. Continue on Unilabs Online to choose collection site/slot.',
      checkoutUrl: data.checkoutUrl || 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni',
      boundary: data.boundary || 'checkout_handoff_required',
      items: data.items || [],
      totalCzk: data.totalCzk || null,
    };
    showNotification('Unilabs cart preview ready', 'success');
  } catch (err) {
    draft.status = 'failed';
    draft.result = { ok: false, message: err?.message || 'Unilabs cart preparation failed.' };
    showNotification('Unilabs cart preview failed', 'error');
  }
  await saveChatHistory();
  renderChatMessages();
}

async function selectProvider(msgIndex, providerId) {
  const found = getDraftForMessage(msgIndex);
  if (!found || !providerId) return;
  found.msg.labOrderDraft = selectProviderForDraft(found.draft, providerId);
  showNotification(providerId === 'cz.unilabs' ? 'Unilabs tests shown' : 'Labshop tests shown', 'success');
  await saveChatHistory();
  renderChatMessages();
}

async function changeProvider(msgIndex) {
  const found = getDraftForMessage(msgIndex);
  if (!found) return;
  found.msg.labOrderDraft = {
    ...found.draft,
    provider: 'provider_selection',
    providerId: null,
    providerName: null,
    status: 'provider_selection',
    offers: [],
    products: [],
    totalEstimateCzk: null,
    result: null,
    safetyBoundary: 'Choose a lab first. getbased will show tests/offers for the selected lab and keep booking/payment user-in-loop.',
  };
  showNotification('Choose another lab', 'success');
  await saveChatHistory();
  renderChatMessages();
}

async function cancelOrder(msgIndex) {
  const found = getDraftForMessage(msgIndex);
  if (!found) return;
  found.draft.status = 'cancelled';
  found.draft.result = { ok: true, message: 'Order draft cancelled.' };
  await saveChatHistory();
  renderChatMessages();
}

async function compareLabsFromPlan(msgIndex) {
  const found = getPlanForMessage(msgIndex);
  if (!found) return;
  found.msg.labOrderDraft = buildLabOrderDraftFromMarkers(found.plan.markers || [], {
    userRequest: found.plan.userPrompt || found.msg.content || '',
  });
  found.plan.status = 'compared';
  showNotification('Lab coverage compared', 'success');
  await saveChatHistory();
  renderChatMessages();
}

async function dismissLabPlan(msgIndex) {
  const found = getPlanForMessage(msgIndex);
  if (!found) return;
  found.plan.status = 'dismissed';
  found.msg.labPlanDraft = null;
  showNotification('Lab plan hidden', 'success');
  await saveChatHistory();
  renderChatMessages();
}

export function handleLabOrderClick(event) {
  const btn = event.target?.closest?.('[data-lab-order-action]');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  const action = btn.dataset.labOrderAction;
  const msgIndex = btn.dataset.msgIndex;
  if (action === 'select-provider') void selectProvider(msgIndex, btn.dataset.labProviderId);
  if (action === 'compare-labs-from-plan') void compareLabsFromPlan(msgIndex);
  if (action === 'dismiss-lab-plan') void dismissLabPlan(msgIndex);
  if (action === 'prepare-cart') void prepareCart(msgIndex);
  if (action === 'prepare-unilabs-cart') void prepareUnilabsCart(msgIndex);
  if (action === 'change-provider') void changeProvider(msgIndex);
  if (action === 'cancel') void cancelOrder(msgIndex);
}

export function bindLabOrderActions(root = document) {
  root.addEventListener('click', handleLabOrderClick);
}

Object.assign(window, { handleLabOrderClick });
