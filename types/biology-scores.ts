import type {ScoringData, ScoreDefinition} from '../js/biology-score-types.js';
import type {computeWeightedComposite} from '../js/biology-score-engine.js';
import type {addScoreInterpretation} from '../js/biology-score-methodology.js';
import type {computeBiologicalCoherence} from '../js/biology-score-coherence.js';
export type BiologyData = Partial<ScoringData> | null | undefined;
// Authored metadata really omits inputs/weight on several definitions; compute is copied untouched.
export interface BiologyDefinition extends Omit<ScoreDefinition,'inputs'|'coherenceWeight'> {inputs?:ScoreDefinition['inputs'];coherenceWeight?:number;compute:unknown}
export type BiologyComputedDomain = Omit<ReturnType<typeof computeWeightedComposite>,keyof ScoreDefinition | 'rawScore'> & BiologyDefinition & {rawScore:number|null};
export type BiologyInterpretedDomain = ReturnType<typeof addScoreInterpretation<BiologyComputedDomain>> & {basicInputs:string[];extendedInputs:string[];overviewMembership?:{included:boolean;optional:boolean;label:string}};
export type BiologyOverview = Omit<ReturnType<typeof computeBiologicalCoherence<BiologyDefinition,BiologyComputedDomain>>,'rawScore' | 'historicalSnapshot'> & {rawScore:number|null;historicalSnapshot?:BiologyOverview};
export type BiologyScore = (BiologyOverview | BiologyInterpretedDomain) & {aiRangeMode:unknown;historicalSnapshot?:BiologyOverview};
export type BiologyAssessment = BiologyScore & {aiViews:Array<{labels:string[];material:string;score:BiologyScore}>};
export interface BiologyContext {data?:BiologyData}
