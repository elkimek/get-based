// @ts-check
// recommendation-actions.js - recommendation modal and action handlers

import { escapeAttr, escapeHTML } from './utils.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  closeRecommendationsModal,
  openRecommendationsChatPanel,
  renderRecommendationsDetailSection,
} from './recommendations-runtime.js';

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
    closeRecommendationsModal();
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
  function openRecommendationDetail(slotKey, label = 'Tip', markerStatus = '') {
    const modal = setDetailModalShell('recommendation-detail-modal');
    const overlay = document.getElementById("modal-overlay");
    if (!modal || !overlay) return;
    modal.innerHTML = `<button type="button" class="modal-close" aria-label="Close" ${recommendationDetailActionAttrs('close')}>&times;</button>
      <h3>${escapeHTML(label || 'Tip')}</h3>
      <div class="dashboard-widget-empty">Loading options...</div>`;
    openModalOverlay(overlay);
    Promise.resolve(renderRecommendationsDetailSection(slotKey, { label: 'Options', maxProducts: 4, markerStatus }))
      .then(html => {
        modal.innerHTML = `<button type="button" class="modal-close" aria-label="Close" ${recommendationDetailActionAttrs('close')}>&times;</button>
          <h3>${escapeHTML(label || 'Tip')}</h3>
          ${html || '<div class="dashboard-widget-empty">No tip details are available for this topic.</div>'}`;
      })
      .catch(() => {
        modal.innerHTML = `<button type="button" class="modal-close" aria-label="Close" ${recommendationDetailActionAttrs('close')}>&times;</button>
          <h3>${escapeHTML(label || 'Tip')}</h3>
          <div class="dashboard-widget-empty">Could not load tip details.</div>`;
      });
  }

  function discussRecommendation(id) {
    const catalog = getCachedRecommendationsCatalog();
    const ctx = buildDashboardWidgetContext(getActiveData());
    const candidate = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true }).find(c => c.id === id);
    const prompt = candidate
      ? `Help me understand this general-information tip from getbased.\nSource: ${candidate.source}\nTip topic: ${candidate.label}\nWhy it appeared: ${candidate.reason}\nExample shown: ${candidate.primaryAction || 'none listed'}\nExplain the evidence limits, relevant safety factors, questions to discuss with a qualified healthcare professional, and non-product alternatives. Do not turn this into a diagnosis or treatment plan.`
      : 'Help me understand the general-information tips currently shown in getbased. Explain their evidence limits, safety factors, and useful questions for a qualified healthcare professional. Do not rank them as treatment priorities or turn them into a care plan.';
    openRecommendationsChatPanel(prompt);
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
