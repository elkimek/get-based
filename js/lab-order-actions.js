// lab-order-actions.js — user-confirmed Labshop cart preparation handlers.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { selectProviderForDraft, buildLabOrderDraftFromMarkers } from './lab-order-intent.js';
import { createPersistentNclpCache, enrichMarkersWithNclpCandidates } from './lab-standards/nclp-cache.js';

const labPlanNclpCache = createPersistentNclpCache();
const labPlanComparisonInFlight = new Set();

function handoffFailureResult(providerName, checkoutUrl, err) {
  const reason = err?.message || `${providerName} handoff failed.`;
  return {
    ok: false,
    message: `getbased prepared the order preview, but the partner-lab handoff did not complete: ${reason} This is the handoff boundary — final booking/payment stays on ${providerName}.`,
    checkoutUrl,
    boundary: 'partner_handoff_required',
  };
}

function getDraftForMessage(msgIndex) {
  const msg = state.chatHistory[Number(msgIndex)];
  return msg?.labOrderDraft ? { msg, draft: msg.labOrderDraft } : null;
}

function getPlanForMessage(msgIndex) {
  const msg = state.chatHistory[Number(msgIndex)];
  return msg?.labPlanDraft ? { msg, plan: msg.labPlanDraft } : null;
}

async function saveAndRenderLabOrderState() {
  try {
    await saveChatHistory();
  } catch (err) {
    console.warn('Lab order state save failed.', err);
    showNotification('Lab order changes could not be saved locally', 'error');
  }
  renderChatMessages();
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
    draft.result = handoffFailureResult('Labshop', 'https://www.labshop.cz/kosik/prehled', err);
    showNotification('Labshop handoff needs manual checkout', 'error');
  }
  await saveAndRenderLabOrderState();
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
    draft.result = handoffFailureResult('Unilabs Online', 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni', err);
    showNotification('Unilabs handoff needs manual checkout', 'error');
  }
  await saveAndRenderLabOrderState();
}

async function selectProvider(msgIndex, providerId) {
  const found = getDraftForMessage(msgIndex);
  if (!found || !providerId) return;
  found.msg.labOrderDraft = selectProviderForDraft(found.draft, providerId);
  showNotification(providerId === 'cz.unilabs' ? 'Unilabs tests shown' : 'Labshop tests shown', 'success');
  await saveAndRenderLabOrderState();
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
  await saveAndRenderLabOrderState();
}

async function cancelOrder(msgIndex) {
  const found = getDraftForMessage(msgIndex);
  if (!found) return;
  found.draft.status = 'cancelled';
  found.draft.result = { ok: true, message: 'Order draft cancelled.' };
  await saveAndRenderLabOrderState();
}

export async function compareLabsFromPlan(msgIndex) {
  const messageIndex = Number(msgIndex);
  const found = getPlanForMessage(messageIndex);
  if (!found) return;
  const flightKey = found.plan.id || String(messageIndex);
  if (labPlanComparisonInFlight.has(flightKey) || found.plan.status === 'mapping_nclp' || found.plan.status === 'comparing_labs') {
    return;
  }
  if (found.plan.status === 'compared' || found.msg.labOrderDraft) {
    found.plan.status = 'compared';
    delete found.plan.statusMessage;
    await saveAndRenderLabOrderState();
    return;
  }

  labPlanComparisonInFlight.add(flightKey);
  const originalMarkers = found.plan.markers || [];
  let markersForComparison = originalMarkers;
  found.plan.status = 'mapping_nclp';
  found.plan.statusMessage = 'Checking available lab tests…';
  renderChatMessages();
  try {
    try {
      markersForComparison = await enrichMarkersWithNclpCandidates(originalMarkers, { cache: labPlanNclpCache });
      found.plan.markers = markersForComparison;
    } catch (err) {
      console.warn('NČLP live lookup failed; comparing with existing marker mappings only.', err);
      markersForComparison = originalMarkers;
    }

    const current = getPlanForMessage(messageIndex);
    if (!current || (current.plan.id || String(messageIndex)) !== flightKey) {
      showNotification('Lab comparison changed before it finished; please retry', 'info');
      return;
    }
    current.plan.markers = markersForComparison;

    // A second click/tab should not create a second comparison card if another
    // in-flight run completed while this async lookup was waiting.
    if (!current.msg.labOrderDraft) {
      current.msg.labOrderDraft = buildLabOrderDraftFromMarkers(markersForComparison, {
        userRequest: current.plan.userPrompt || current.msg.content || '',
      });
      showNotification('Lab coverage compared', 'success');
    }
    current.plan.status = 'compared';
    delete current.plan.statusMessage;
    await saveAndRenderLabOrderState();
  } catch (err) {
    found.plan.status = 'suggested';
    delete found.plan.statusMessage;
    showNotification(`Lab comparison failed: ${err?.message || 'coverage error'}`, 'error');
    renderChatMessages();
  } finally {
    labPlanComparisonInFlight.delete(flightKey);
  }
}

async function dismissLabPlan(msgIndex) {
  const found = getPlanForMessage(msgIndex);
  if (!found) return;
  found.plan.status = 'dismissed';
  found.msg.labPlanDraft = null;
  showNotification('Lab plan hidden', 'success');
  await saveAndRenderLabOrderState();
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
