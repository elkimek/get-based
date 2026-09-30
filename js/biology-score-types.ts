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
}
export interface ScoreCopy { question?: string; scopeLabel?: string; boundary?: string; }
