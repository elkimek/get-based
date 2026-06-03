// lab-order-actions.js — user-confirmed Labshop cart preparation handlers.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { selectProviderForDraft } from './lab-order-intent.js';

function getDraftForMessage(msgIndex) {
  const msg = state.chatHistory[Number(msgIndex)];
  return msg?.labOrderDraft ? { msg, draft: msg.labOrderDraft } : null;
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

async function cancelOrder(msgIndex) {
  const found = getDraftForMessage(msgIndex);
  if (!found) return;
  found.draft.status = 'cancelled';
  found.draft.result = { ok: true, message: 'Order draft cancelled.' };
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
  if (action === 'prepare-cart') void prepareCart(msgIndex);
  if (action === 'prepare-unilabs-cart') void prepareUnilabsCart(msgIndex);
  if (action === 'cancel') void cancelOrder(msgIndex);
}

export function bindLabOrderActions(root = document) {
  root.addEventListener('click', handleLabOrderClick);
}

Object.assign(window, { handleLabOrderClick });
