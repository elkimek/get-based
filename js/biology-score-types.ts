import type { ActiveData, ActiveMarker } from './data-view-types.js';
import type { LabCollectionContext } from '../types/lab-data.js';
import type { ProfileContextOptions, getBiologyProfileContext } from './profile-context.js';

/** Inputs share one contract across computation, core coverage and the lab planner. */
export interface ScoreInput {
  key: string;
  label: string;
  weight: number;
  paths: string | string[];
  core?: boolean;
  coreGroup?: string;
  coreGroupLabel?: string;
  coreSex?: Array<'male' | 'female'>;
  sexWeightScale?: Partial<Record<'male' | 'female', number>>;
  recencyRequired?: boolean;
  fastingRequired?: boolean;
  evidenceGroup?: string;
  contextOnly?: string;
  plannerOptional?: boolean;
  profileContext?: string;
}
export interface ScoreDefinition {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  evidence: string;
  panelTier: string;
  coherenceDomain: string;
  coherenceWeight: number;
  inputs: ScoreInput[];
  panelLabel?: string;
  panelRoute?: string;
}
export interface ScoreCopy { question?: string; scopeLabel?: string; boundary?: string; }

/** Keep selection, scoring, coverage and presentation on one typed projection. */
export type ScoringData = ActiveData;
export interface ScoreRange { min?: number | null | undefined; max?: number | null | undefined }
export interface MarkerHit {
  id: string; dotKey: string; path: string; label: string;
  value: number; canonicalValue: number; displayValue: string; unit: string;
  date: string; dateIndex: number; ageDays: number | null;
  entryContext: LabCollectionContext;
  range: ScoreRange | null; referenceRange: ScoreRange | null; rangeLabel: string;
  canonicalScoringRange: ScoreRange | null; canonicalReferenceRange: ScoreRange | null;
  phaseLabel: string | null; phaseRange: ScoreRange | null;
  specimen: unknown; method: unknown; source: unknown;
  referenceRangeSource: unknown; optimalRangeSource: unknown; referenceSampleTime: unknown;
  sampleTime?: unknown; derivedContextOnly?: boolean; contextReason?: string;
  derivedFrom?: string[]; dependencyDates?: string[];
}
export type ScoreProfileContext = Partial<Omit<ReturnType<typeof getBiologyProfileContext>, 'genetic' | 'body' | 'light'>> & {
  genetic?: Partial<ReturnType<typeof getBiologyProfileContext>['genetic']>;
  body?: Partial<ReturnType<typeof getBiologyProfileContext>['body']>;
  light?: Partial<ReturnType<typeof getBiologyProfileContext>['light']>;
};
export interface ScoreOptions extends ProfileContextOptions { profileContext?: ScoreProfileContext }
export interface ProfileScoreModifier {
  score: boolean; flag: string; weightScale: number; contextOnly?: boolean; limited?: boolean;
  rangeOverride?: ScoreRange | null | undefined; referenceRangeOverride?: ScoreRange | null | undefined; rangeLabel?: string;
}
export interface ScorePart extends Omit<Partial<MarkerHit>, 'path'>, Omit<Partial<ScoreInput>, 'key' | 'label' | 'weight'> {
  key: string; label: string; weight: number; partial: number | null;
  path?: string | undefined; familyWeight?: number | undefined; effectiveWeight?: number; configuredWeight?: number;
  profileContextOnly?: boolean; contextReason?: string; contextNote?: string; contextLimited?: boolean;
  referenceDirection?: string; evidenceRole?: string;
}
export interface MissingScoreInput extends ScoreInput { path?: string | undefined; familyWeight?: number | undefined }
export interface ScoreResult {
  score?: number | null; tone?: string | null; coverage?: number;
  available?: ScorePart[]; missing?: Array<Pick<ScorePart, 'key' | 'label'> & Partial<ScorePart>>;
  flags?: string[]; anchorWarning?: string; recencyMessage?: string; contextLimited?: boolean;
}
export type CanonicalScoringMarker = ActiveMarker & { dateIndices?: Record<string, number> };
export interface DerivedMarkerRecipe { left: string | string[]; right: string | string[]; max: number; subtract?: boolean; multiply?: boolean }
