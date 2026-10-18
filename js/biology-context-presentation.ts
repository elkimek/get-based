import type {BiologyContextReview} from './biology-score-context-contract.js';
import type {getBiologyProfileContext} from './profile-context.js';

export interface BiologyContextField {
  id: string;
  label: string;
  checked: boolean;
}
export interface BiologyContextReviewInput {
  fields: BiologyContextField[];
  review: BiologyContextReview | null | undefined;
  current: boolean;
  female: boolean;
}
export interface BiologyContextSuggestionView {
  flag: string;
  label: string;
  confidence: string;
  confidenceLabel: string;
  active: boolean;
  reason: string;
  evidence: string[];
  affects: string | null;
}
export interface BiologyContextReviewView {
  current: boolean;
  buttonLabel: string;
  timing: string;
  status: string;
  summary: string;
  fields: BiologyContextField[];
  suggestions: BiologyContextSuggestionView[];
}
export interface BiologyContextSectionView {
  labels: string[];
  review: BiologyContextReviewView;
}
export type BiologyContextProps =
  | {kind: 'panel'; view: BiologyContextReviewView}
  | {kind: 'section'; view: BiologyContextSectionView};

// Match the legacy text boundary without carrying HTML into the view model.
const text = (value: unknown): string => value == null ? '' : String(value);

export function projectBiologyContextReview(input: BiologyContextReviewInput): BiologyContextReviewView {
  const {review, fields, current, female} = input;
  const hasReview = !!review?.updatedAt;
  const available = new Map(fields.map(field => [field.id, field]));
  const suggestions = Array.isArray(review?.suggestions) ? review.suggestions : [];
  return {
    current,
    buttonLabel: hasReview ? 'Refresh AI review' : 'Review context with AI',
    timing: female ? 'Sample timing and cycle phase belong' : 'Sample timing belongs',
    status: current ? 'Context is up to date.' : hasReview
      ? 'Context changed. Refresh recommended; your scores stay available.'
      : 'Optional AI review; scores already use your saved profile and collection context.',
    summary: review?.summary ? text(review.summary) : '',
    fields: fields.map(field => ({...field})),
    suggestions: suggestions.filter(suggestion => available.has(suggestion.flag)).map(suggestion => {
      const field = available.get(suggestion.flag)!;
      return {
        flag: suggestion.flag,
        label: field.label,
        confidence: text(suggestion.confidence),
        confidenceLabel: `${text(suggestion.confidence)} confidence${field.checked ? ' · active' : ''}`,
        active: field.checked,
        reason: text(suggestion.reason || 'AI suggested this context modifier.'),
        evidence: suggestion.evidence?.length ? suggestion.evidence.map(text) : [],
        affects: suggestion.affects?.length ? suggestion.affects.join(', ') : null,
      };
    }),
  };
}

export function projectBiologyContextLabels(pc: ReturnType<typeof getBiologyProfileContext>): string[] {
  return [
    [pc.lowMuscleMass, 'Low muscle / creatinine unreliable'],
    [pc.hormoneTherapy, 'Hormone therapy context'],
    [pc.cycleStatus && pc.cycleStatus !== 'regular', `Cycle: ${pc.cycleStatus}`],
    [pc.recentHardTraining, 'Recent hard training'],
    [pc.acuteInflammationContext, 'Acute illness/injury'],
    [Number.isFinite(pc.ageYears), `Age: ${pc.ageYears}y`],
  ].filter(item => item[0]).map(item => String(item[1]));
}
