import type {RecRenderCandidate} from '../types/dashboard-recommendation-widget.js';

/** Literal card data. Candidate scoring, catalog loading and saved state stay in the controller. */
export interface RecommendationCardView {
  id: string;
  actionId: string | undefined;
  source: string;
  label: string;
  actionLabel: string | undefined;
  slotKey: string | undefined;
  markerStatus: string | undefined;
  markerId: string | undefined;
  hasMarker: boolean;
  reason: string;
  meta: string;
  hasMeta: boolean;
  primaryAction: string;
  hasPrimaryAction: boolean;
  saved: boolean;
  dismissed: boolean;
  compact: boolean;
}
export interface RecommendationEmptyView {message: string}
export type RecommendationPresentationView =
  | {kind: 'card'; card: RecommendationCardView}
  | {kind: 'empty'; empty: RecommendationEmptyView}
  | {kind: 'loading'}
  | {kind: 'disabled'}
  | {kind: 'widget'; cards: RecommendationCardView[]}
  | {kind: 'list'; cards: RecommendationCardView[]};

const text = (value: unknown): string => value == null ? '' : String(value);
// actionAttributes omits missing/empty values but retains false and zero.
const actionValue = (value: unknown): string | undefined => value == null || value === '' ? undefined : String(value);

export function projectRecommendationCard(candidate: RecRenderCandidate, compact: unknown = false): RecommendationCardView {
  return {
    id: text(candidate.id),
    actionId: actionValue(candidate.id),
    source: text(candidate.source),
    label: text(candidate.label),
    actionLabel: actionValue(candidate.label),
    slotKey: actionValue(candidate.slotKey),
    markerStatus: actionValue(candidate.markerStatus || ''),
    markerId: actionValue(candidate.markerId),
    hasMarker: Boolean(candidate.markerId),
    reason: text(candidate.reason || ''),
    meta: text(candidate.meta),
    hasMeta: Boolean(candidate.meta),
    primaryAction: text(candidate.primaryAction),
    hasPrimaryAction: Boolean(candidate.primaryAction),
    saved: Boolean(candidate.saved),
    dismissed: Boolean(candidate.dismissed),
    compact: Boolean(compact),
  };
}

export function projectRecommendationEmpty(message: unknown = 'No data-linked tips yet.'): RecommendationEmptyView {
  return {message: text(message)};
}

export function projectRecommendationList(candidates: readonly RecRenderCandidate[], compact: unknown = false): RecommendationCardView[] {
  return candidates.map(candidate => projectRecommendationCard(candidate, compact));
}
