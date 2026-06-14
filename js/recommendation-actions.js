// @ts-check
// recommendation-actions.js - recommendation modal and action handlers

import { escapeAttr, escapeHTML } from './utils.js';
import { openModalOverlay } from './modal-lifecycle.js';

let recommendationDetailDelegatesInstalled = false;

function recommendationDetailActionAttrs(action) {
  return `data-recommendation-detail-action="${escapeAttr(action)}"`;
}

function handleRecommendationDetailClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-recommendation-detail-action]'));
  if (!actionEl || !actionEl.closest('#detail-modal')) return;
  if (actionEl.dataset.recommendationDetailAction === 'close') {
    event.preventDefault();
    window.closeModal?.();
  }
}

function initRecommendationDetailDelegates() {
  if (recommendationDetailDelegatesInstalled) return;
  document.addEventListener('click', handleRecommendationDetailClick);
  recommendationDetailDelegatesInstalled = true;
}

function setDetailModalShell(...classes) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

export function createRecommendationActions({
  getActiveData,
  buildDashboardWidgetContext,
  getCachedRecommendationsCatalog,
  getGlobalRecommendationCandidates,
  setRecommendationState,
}) {
  function openRecommendationDetail(slotKey, label = 'Recommendation', markerStatus = '') {
    const modal = setDetailModalShell('recommendation-detail-modal');
    const overlay = document.getElementById("modal-overlay");
    if (!modal || !overlay) return;
    modal.innerHTML = `<button type="button" class="modal-close" aria-label="Close" ${recommendationDetailActionAttrs('close')}>&times;</button>
      <h3>${escapeHTML(label || 'Recommendation')}</h3>
      <div class="dashboard-widget-empty">Loading options...</div>`;
    openModalOverlay(overlay);
    Promise.resolve(window.renderRecommendationSection?.(slotKey, { label: 'Options', maxProducts: 4, markerStatus }))
      .then(html => {
        modal.innerHTML = `<button type="button" class="modal-close" aria-label="Close" ${recommendationDetailActionAttrs('close')}>&times;</button>
          <h3>${escapeHTML(label || 'Recommendation')}</h3>
          ${html || '<div class="dashboard-widget-empty">No recommendation details available for this slot.</div>'}`;
      })
      .catch(() => {
        modal.innerHTML = `<button type="button" class="modal-close" aria-label="Close" ${recommendationDetailActionAttrs('close')}>&times;</button>
          <h3>${escapeHTML(label || 'Recommendation')}</h3>
          <div class="dashboard-widget-empty">Could not load recommendation details.</div>`;
      });
  }

  function discussRecommendation(id) {
    const catalog = getCachedRecommendationsCatalog();
    const ctx = buildDashboardWidgetContext(getActiveData());
    const candidate = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true }).find(c => c.id === id);
    const prompt = candidate
      ? `Help me evaluate this recommendation from getbased.\nSource: ${candidate.source}\nRecommendation: ${candidate.label}\nReason: ${candidate.reason}\nSuggested first action: ${candidate.primaryAction || 'none listed'}\nWhat are the pros, cons, and safer non-product alternatives?`
      : 'Help me evaluate my current getbased recommendations. Which should I prioritize and why?';
    window.openChatPanel?.(prompt);
  }

  function saveRecommendation(id, on = true) {
    setRecommendationState('saved', id, !!on);
  }

  function dismissRecommendation(id, on = true) {
    setRecommendationState('dismissed', id, !!on);
  }

  return {
    openRecommendationDetail,
    discussRecommendation,
    saveRecommendation,
    dismissRecommendation,
  };
}

initRecommendationDetailDelegates();
