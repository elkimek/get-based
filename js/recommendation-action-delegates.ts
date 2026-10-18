// One eager, shared delegate guard for canonical and retry Tips factories.
import {closeRecommendationsModal} from './recommendations-runtime.js';

let recommendationDetailDelegatesInstalled = false;


function handleRecommendationDetailClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = target.closest('[data-recommendation-detail-action]') as HTMLElement | null;
  if (!actionEl || !actionEl.closest('#detail-modal')) return;
  if (actionEl.dataset.recommendationDetailAction === 'close') {
    event.preventDefault();
    closeRecommendationsModal();
  }
}

export function initRecommendationDetailDelegates() {
  if (recommendationDetailDelegatesInstalled) return;
  document.addEventListener('click', handleRecommendationDetailClick);
  recommendationDetailDelegatesInstalled = true;
}

