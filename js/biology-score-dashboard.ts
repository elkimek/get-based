import { state } from './state.js';
// Dashboard needs deterministic score projection, never the Biology page/AI controller.
import { computeBiologyScores } from './biology-score-compute.js';
import { contextForScores } from './biology-score-data.js';
import type { BiologyContext } from '../types/biology-scores.js';
import { projectBiologyDashboardScore, projectBiologyDashboardCoherence } from './biology-overview-presentation.js';
import { projectBiologySummaryWidget } from './biology-summary-presentation.js';
import { renderHTML as renderDashboardScore } from './components/BiologyDashboardScore.svelte.html.js';
import { renderHTML as renderDashboardCoherence } from './components/BiologyDashboardCoherence.svelte.html.js';
import { renderHTML as renderSummary } from './components/BiologySummaryWidget.svelte.html.js';

export function projectDashboardBiologyScoreWidget(ctx: unknown, scoreId: string) {
  const scoreCtx = contextForScores(ctx) as BiologyContext | null | undefined;
  const score = computeBiologyScores(scoreCtx?.data || {}).find(item => item.id === scoreId);
  return score ? projectBiologyDashboardScore(score) : null;
}

export function projectDashboardBiologicalCoherenceWidget(ctx: unknown) {
  const scoreCtx = contextForScores(ctx) as BiologyContext | null | undefined;
  const score = computeBiologyScores(scoreCtx?.data || {}).find(item => item.id === 'biologicalCoherence');
  return score ? projectBiologyDashboardCoherence(score) : null;
}

export function renderDashboardBiologyScoreWidget(ctx: unknown, scoreId: string) {
  const view = projectDashboardBiologyScoreWidget(ctx, scoreId);
  return view ? renderDashboardScore({ view }) : '';
}

export function renderDashboardBiologicalCoherenceWidget(ctx: unknown) {
  const view = projectDashboardBiologicalCoherenceWidget(ctx);
  return view ? renderDashboardCoherence({ view }) : '';
}

export function renderBiologyScoresWidget(ctx: unknown) {
  const scoreCtx = contextForScores(ctx) as BiologyContext | null | undefined;
  const scores = computeBiologyScores(scoreCtx?.data || {});
  return renderSummary({ view: projectBiologySummaryWidget(scores) });
}

/** One coherent score/Light snapshot per contiguous, synchronous first-party projection segment. */
export function createDashboardBiologyProjectionScope() {
  function owner() {
    try {
      const values: unknown[] = [];
      for (const key of ['currentProfile', 'importedData', 'rangeMode', 'dateRangeFilter', 'profileSex', 'profileDob'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(state, key);
        if (!descriptor || !('value' in descriptor)) return null;
        values.push(descriptor.value);
      }
      if (typeof values[5] !== 'string') return null;
      const now = Date.now(), local = new Date(now);
      return [...values, Math.floor(now / 86400000), local.getFullYear(), local.getMonth(), local.getDate()] as const;
    } catch { return null; }
  }
  type Owner = NonNullable<ReturnType<typeof owner>>;
  type Scores = ReturnType<typeof computeBiologyScores>;
  let cached: {ctx: unknown; data: unknown; owner: Owner; scores: Scores; eligible: boolean | null} | null = null;
  const sameOwner = (previous: Owner, current: Owner) => previous.every((value, index) => Object.is(value, current[index]));
  function ownData(ctx: unknown) {
    try {
      const descriptor = ctx && typeof ctx === 'object' ? Object.getOwnPropertyDescriptor(ctx, 'data') : undefined;
      return descriptor && 'value' in descriptor ? {value: descriptor.value as unknown} : null;
    } catch { return null; }
  }
  function scoresFor(ctx: unknown): Scores {
    let rejected = false;
    if (cached) {
      const current = owner(), data = ownData(ctx);
      const matches = current !== null && cached.ctx === ctx && data !== null
        && cached.data === data.value && sameOwner(cached.owner, current);
      if (matches) {
        // A single/nonadjacent score pays no graph-walk cost. Foreign accessors
        // retain per-call evaluation, including a getter that faults on its next read.
        cached.eligible ??= plainScoreInputs(ctx, current[1]);
        if (cached.eligible) return cached.scores;
        rejected = true;
      }
    }
    cached = null;
    // Keep the original first-call/miss getter and fault order before optional metadata.
    const scoreCtx = contextForScores(ctx) as BiologyContext | null | undefined;
    const beforeData = ownData(ctx), before = owner();
    const scores = computeBiologyScores(scoreCtx?.data || {});
    const data = ownData(ctx), current = owner();
    // Profile readers may synchronously replace the owner while calculating.
    if (beforeData && data && before && current && beforeData.value === data.value && sameOwner(before, current)) {
      cached = {ctx, data: data.value, owner: current, scores, eligible: rejected ? false : null};
    }
    return scores;
  }
  return {
    clear() { cached = null; },
    projectScoreWidget(ctx: unknown, scoreId: string) {
      const score = scoresFor(ctx).find(item => item.id === scoreId);
      return score ? projectBiologyDashboardScore(score) : null;
    },
    projectCoherenceWidget(ctx: unknown) {
      const score = scoresFor(ctx).find(item => item.id === 'biologicalCoherence');
      return score ? projectBiologyDashboardCoherence(score) : null;
    },
  };
}

/** Eligibility only: large/exotic inputs keep their original uncached behavior. */
function plainScoreInputs(...roots: unknown[]): boolean {
  const seen = new WeakSet<object>();
  const pending = [...roots];
  let properties = 0;
  try {
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === 'function') return false;
      if (value === null || typeof value !== 'object' || seen.has(value)) continue;
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null && prototype !== Object.prototype && prototype !== Array.prototype) return false;
      seen.add(value);
      const keys = Reflect.ownKeys(value);
      // This bounds optimization work; exceeding it neither rejects data nor changes scoring.
      properties += keys.length;
      if (properties > 50000) return false;
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor)) return false;
        pending.push(descriptor.value);
      }
    }
    return true;
  } catch { return false; }
}
