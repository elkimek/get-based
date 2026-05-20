// recommendation-actions.js - recommendation modal and action handlers

import { escapeHTML } from './utils.js';

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
    modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
      <h3>${escapeHTML(label || 'Recommendation')}</h3>
      <div class="dashboard-widget-empty">Loading options...</div>`;
    overlay.classList.add("show");
    Promise.resolve(window.renderRecommendationSection?.(slotKey, { label: 'Options', maxProducts: 4, markerStatus }))
      .then(html => {
        modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
          <h3>${escapeHTML(label || 'Recommendation')}</h3>
          ${html || '<div class="dashboard-widget-empty">No recommendation details available for this slot.</div>'}`;
      })
      .catch(() => {
        modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
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
