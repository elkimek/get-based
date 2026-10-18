// Synchronous Biology action/delegate owner; rendering and paid AI remain first-use controllers.
import { filterDatesByRange } from './data.js';
import { computeBiologyScores } from './biology-score-compute.js';
import { state } from './state.js';
import { routeRevision } from './route-lifecycle.js';
import { createNewThread } from './chat-loader.js';
import { buildBiologyScoreCoveragePlannerModel, formatBiologyScoreCoveragePlannerPrompt } from './biology-score-coverage-planner.js';
import {
  canOpenBiologyScoresChatPanel, getBiologyScoresActiveData, hasBiologyScoresAIProvider,
  navigateBiologyScoresRoute, navigateBiologyScoresRouteAndWait, openBiologyScoreMarkerDetail,
  openBiologyScoresChatPanel, scheduleBiologyScoresTask, showBiologyScoresNotification, useBiologyScoresChatPrompt,
} from './biology-scores-runtime.js';

interface BiologyScoreNavigationDeps {
  retrySavedInsights: (() => Promise<unknown>) | null;
  loadInsights: ((options: { force: boolean }) => Promise<unknown>) | null;
  runEmbeddedAI: ((element: HTMLElement) => Promise<unknown>) | null;
  reconcile: (() => void) | null;
}
const biologyScoreNavigationDeps: BiologyScoreNavigationDeps = {
  retrySavedInsights: null, loadInsights: null, runEmbeddedAI: null, reconcile: null,
};
/** The loaded compatibility facade registers its original synchronous controller ports. */
export function configureBiologyScoreNavigation(deps: BiologyScoreNavigationDeps) {
  Object.assign(biologyScoreNavigationDeps, deps);
  installBiologyScoreDelegates();
}

let biologyScoreDelegatesInstalled = false;
export function installBiologyScoreDelegates() {
  if (biologyScoreDelegatesInstalled || typeof document === 'undefined') return;
  biologyScoreDelegatesInstalled = true;
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const summary = target?.closest('.biology-score-compact > .biology-score-summary');
    const actionEl = target?.closest('[data-biology-score-action]');
    if (summary?.parentElement instanceof HTMLElement && (!actionEl || actionEl.getAttribute('data-biology-score-action') === 'toggle-score')) {
      event.preventDefault();
      const top = summary.getBoundingClientRect().top;
      setScoreExpanded(summary.parentElement, !summary.parentElement.hasAttribute('open'));
      // Closing another row must not move this toggle away from the pointer.
      document.defaultView?.scrollBy({ top: summary.getBoundingClientRect().top - top, behavior: 'instant' });
      return;
    }
    if (!actionEl) return;
    const el = (actionEl as HTMLElement);
    const action = el.dataset.biologyScoreAction;
    if (action === 'open-lens') {
      navigateBiologyScoresRoute('biology-scores');
      event.preventDefault();
    } else if (action === 'interpret-lens') {
      openBiologyScoresChatPanel();
      scheduleBiologyScoresTask(() => {
        useBiologyScoresChatPrompt('Interpret my Biology Scores. Focus on the strongest and most strained patterns, any stale or mixed-date scores that need retesting, and the most useful next checks. Treat the scores as deterministic pattern summaries, not diagnoses.');
      }, 250);
      event.preventDefault();
    } else if (action === 'plan-coverage-chat') {
      if (!canOpenBiologyScoresChatPanel()) {
        showBiologyScoresNotification('Chat is not available on this screen.', 'error');
        event.preventDefault();
        return;
      }
      if (hasBiologyScoresAIProvider() === false) {
        showBiologyScoresNotification('Connect an AI provider before making a lab plan.', 'error');
        openBiologyScoresChatPanel();
        event.preventDefault();
        return;
      }
      const rawData = getBiologyScoresActiveData();
      const scoreData = filterDatesByRange(rawData, { fallbackToAll: false });
      const scores = computeBiologyScores(scoreData);
      const detailScores = scores.filter((score) => score.id !== 'biologicalCoherence');
      const coherence = scores.find((score) => score.id === 'biologicalCoherence');
      const planner = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
      createNewThread();
      openBiologyScoresChatPanel(formatBiologyScoreCoveragePlannerPrompt(planner));
      event.preventDefault();
    } else if (action === 'read-score-ai') {
      event.preventDefault();
      const scoreId = el.dataset.biologyScoreId || '';
      const card = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
      if (card?.matches('.biology-score-compact')) setScoreExpanded(card, true);
      else card?.querySelector('.biology-coherence-interpretation')?.setAttribute('open', '');
      const answer = card?.querySelector('.biology-score-ai');
      answer?.setAttribute('tabindex', '-1');
      if (answer instanceof HTMLElement) answer.focus({ preventScroll: true });
      answer?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (action === 'retry-save-score-insights') {
      event.preventDefault();
      void biologyScoreNavigationDeps.retrySavedInsights?.().catch(err => showBiologyScoresNotification(err.message, 'error'));
    } else if (action === 'update-score-insights') {
      event.preventDefault();
      void biologyScoreNavigationDeps.loadInsights?.({ force: true });
    } else if (action === 'interpret-score-ai') {
      event.preventDefault();
      biologyScoreNavigationDeps.runEmbeddedAI?.(el).catch((err) => {
        showBiologyScoresNotification(err?.message || 'Could not generate Biology Score answer', 'error');
      });
    } else if (action === 'jump-to-domain') {
      const scoreId = el.dataset.biologyScoreId;
      if (!scoreId) return;
      event.preventDefault();
      if (state.currentView === 'biology-scores') {
        jumpToScore(scoreId);
      } else {
        const profileId = state.currentProfile;
        const importedData = state.importedData;
        const pending = navigateBiologyScoresRouteAndWait('biology-scores');
        const revision = routeRevision();
        const ownsRequest = () => state.currentProfile === profileId && state.importedData === importedData
          && state.currentView === 'biology-scores' && routeRevision() === revision;
        const startJump = () => {
          if (!ownsRequest()) return;
          const main = document.getElementById('main-content');
          const body = main?.firstElementChild;
          const ownsJump = () => ownsRequest() && !!main?.isConnected
            && document.getElementById('main-content') === main && main.firstElementChild === body;
          if (ownsJump()) jumpToScoreWhenReady(scoreId, 30, ownsJump);
        };
        // A cold page import can outlast the old frame-poll deadline; navigation
        // resolves only after that page is usable. Capture its actual DOM owner then.
        if (pending && typeof (pending as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(pending).then(result => {
            if (result !== false) startJump();
          }).catch(() => {});
        } else startJump();
      }
    } else if (action === 'open-marker') {
      const markerId = el.dataset.biologyMarkerId;
      if (markerId) {
        openBiologyScoreMarkerDetail(markerId);
        event.preventDefault();
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target : null;
    const el = (target?.closest('[data-biology-score-action]') as HTMLElement | null);
    if (el?.dataset.biologyScoreAction !== 'jump-to-domain') return;
    event.preventDefault();
    el.click();
  });
  document.addEventListener('toggle', event => {
    if (event.target instanceof Element && event.target.matches('.biology-score-unavailable-group')) alignBiologyScoreCards();
  }, true);
}
installBiologyScoreDelegates();

function setScoreExpanded(target: Element, open: boolean) {
  if (open) {
    const group = target.closest('.biology-score-unavailable-group');
    if (group instanceof HTMLDetailsElement) group.open = true;
    alignBiologyScoreCards();
  }
  if (open) document.querySelectorAll('.biology-score-compact[open]').forEach(other => {
    if (other !== target) setScoreExpanded(other, false);
  });
  target.toggleAttribute('open', open);
  target.querySelector('[data-biology-score-action=toggle-score]')?.setAttribute('aria-expanded', String(open));
}

function jumpToScore(scoreId: string) {
  const target = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
  if (target?.matches('.biology-score-compact')) setScoreExpanded(target, true);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToScoreWhenReady(scoreId: string, maxAttempts = 30, ownsJump: () => boolean = () => true) {
  let attempts = 0;
  function tryScroll() {
    if (!ownsJump()) return;
    const target = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
    if (target) {
      if (target?.matches('.biology-score-compact')) setScoreExpanded(target, true);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (++attempts < maxAttempts) {
      requestAnimationFrame(tryScroll);
    }
  }
  requestAnimationFrame(tryScroll);
}

// Expanded reading panels are deliberately excluded from row measurements.
// Each row follows its longest natural summary; mobile cards size individually.
export function alignBiologyScoreCards() {
  if (typeof document === 'undefined') return;
  const cards = [...document.querySelectorAll<HTMLElement>('.biology-score-compact > .biology-score-summary')];
  cards.forEach(card => (card as HTMLElement).style.removeProperty('--biology-summary-height'));
  const rows = new Map<number, HTMLElement[]>();
  for (const card of cards) {
    if (!card.getClientRects().length) continue;
    const top = Math.round(card.getBoundingClientRect().top);
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top)!.push(card);
  }
  for (const row of rows.values()) {
    const height = Math.max(...row.map(card => card.getBoundingClientRect().height));
    row.forEach(card => card.style.setProperty('--biology-summary-height', `${height}px`));
  }
}



if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-sync-applied', () => biologyScoreNavigationDeps.reconcile?.());
  globalThis.addEventListener('resize', alignBiologyScoreCards);
}
