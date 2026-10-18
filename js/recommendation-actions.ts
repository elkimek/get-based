import {initRecommendationDetailDelegates} from './recommendation-action-delegates.js';
import { renderHTML as renderTipsDetailHTML } from './components/TipsDetail.svelte.html.js';
import { tipsText } from './tips-presentation.js';
export interface RecommendationActionCandidate {
  id: string;
  source: unknown;
  label: unknown;
  reason: unknown;
  primaryAction?: unknown;
}
interface RecommendationActionsDeps<Data, Context, Catalog> {
  getActiveData: () => Data;
  buildDashboardWidgetContext: (data: Data) => Context;
  getCachedRecommendationsCatalog: () => Catalog;
  getGlobalRecommendationCandidates: (context: Context, catalog: Catalog, options: { includeDismissed: boolean }) => RecommendationActionCandidate[];
  setRecommendationState: (kind: 'saved' | 'dismissed', id: string, on: boolean) => unknown;
}

// recommendation-actions.js - recommendation modal and action handlers

import { openModalOverlay } from './modal-lifecycle.js';
import {
  openRecommendationsChatPanel,
  getRecommendationsDetailSectionView,
} from './recommendations-runtime.js';

function setDetailModalShell(...classes: string[]) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

export function createRecommendationActions<Data, Context, Catalog>({
  getActiveData,
  buildDashboardWidgetContext,
  getCachedRecommendationsCatalog,
  getGlobalRecommendationCandidates,
  setRecommendationState,
}: RecommendationActionsDeps<Data, Context, Catalog>) {
  function openRecommendationDetail(slotKey: string, label = 'Tip', markerStatus = '') {
    const modal = setDetailModalShell('recommendation-detail-modal');
    const overlay = document.getElementById("modal-overlay");
    if (!modal || !overlay) return;
    modal.innerHTML = renderTipsDetailHTML({label: tipsText(label || 'Tip'), state: 'loading', section: null});
    openModalOverlay(overlay);
    Promise.resolve(getRecommendationsDetailSectionView(slotKey, { label: 'Options', maxProducts: 4, markerStatus }))
      .then(section => {
        modal.innerHTML = renderTipsDetailHTML({label: tipsText(label || 'Tip'), state: 'loaded', section});
      })
      .catch(() => {
        modal.innerHTML = renderTipsDetailHTML({label: tipsText(label || 'Tip'), state: 'error', section: null});
      });
  }

  function discussRecommendation(id: string) {
    const catalog = getCachedRecommendationsCatalog();
    const ctx = buildDashboardWidgetContext(getActiveData());
    const candidate = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true }).find(c => c.id === id);
    const prompt = candidate
      ? `Help me understand this general-information tip from getbased.\nSource: ${candidate.source}\nTip topic: ${candidate.label}\nWhy it appeared: ${candidate.reason}\nExample shown: ${candidate.primaryAction || 'none listed'}\nExplain the evidence limits, relevant safety factors, questions to discuss with a qualified healthcare professional, and non-product alternatives. Do not turn this into a diagnosis or treatment plan.`
      : 'Help me understand the general-information tips currently shown in getbased. Explain their evidence limits, safety factors, and useful questions for a qualified healthcare professional. Do not rank them as treatment priorities or turn them into a care plan.';
    openRecommendationsChatPanel(prompt);
  }

  function saveRecommendation(id: string, on = true) {
    setRecommendationState('saved', id, !!on);
  }

  function dismissRecommendation(id: string, on = true) {
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
