// Explicit sample facts never create periods or turn a prediction into an observation.
import type { LabCollectionContext } from '../types/lab-data.js';

export const LAB_SAMPLE_CYCLE_PHASES = { menstrual: 'Menstrual', follicular: 'Follicular', ovulatory: 'Ovulatory', luteal: 'Luteal' } as const;
export const LAB_SAMPLE_CYCLE_DETAILS = {
  early_follicular: { phase: 'follicular', label: 'Early follicular' }, late_follicular: { phase: 'follicular', label: 'Late follicular' },
  periovulatory: { phase: 'ovulatory', label: 'Periovulatory' }, early_luteal: { phase: 'luteal', label: 'Early luteal' },
  mid_luteal: { phase: 'luteal', label: 'Mid-luteal' }, late_luteal: { phase: 'luteal', label: 'Late luteal' },
} as const;
export const LAB_SAMPLE_CYCLE_FIELDS = ['cycleDay', 'cyclePhase', 'cyclePhaseDetail'] as const;
export interface LabSampleCyclePatch { cycleDay?: number | null; cyclePhase?: string | null; cyclePhaseDetail?: string | null }
/** Preserve readable legacy values; only explicit changes are normalized. */
export interface LabSampleCycleFacts { cycleDay: number | string | null; cyclePhase: string | null; cyclePhaseDetail: string | null; cyclePhaseSource: string | null }
export function labSampleCycleFacts(context: LabCollectionContext | undefined): LabSampleCycleFacts {
  const text = (key: string) => typeof context?.[key] === 'string' ? context[key] as string : null;
  return { cycleDay: typeof context?.cycleDay === 'number' && Number.isFinite(context.cycleDay) || typeof context?.cycleDay === 'string' ? context.cycleDay as number | string : null,
    cyclePhase: text('cyclePhase'), cyclePhaseDetail: text('cyclePhaseDetail'), cyclePhaseSource: text('cyclePhaseSource') };
}
export function validateLabSampleCyclePatch(patch: LabSampleCyclePatch): void {
  if (patch.cycleDay !== undefined && patch.cycleDay !== null && (!Number.isSafeInteger(patch.cycleDay) || patch.cycleDay < 1)) throw new Error('Cycle day must be a positive whole number, or null to clear it.');
  if (patch.cyclePhase !== undefined && patch.cyclePhase !== null && (typeof patch.cyclePhase !== 'string' || !Object.hasOwn(LAB_SAMPLE_CYCLE_PHASES, patch.cyclePhase))) throw new Error('Use a supported reported cycle phase, or null to clear it.');
  if (patch.cyclePhaseDetail !== undefined && patch.cyclePhaseDetail !== null && (typeof patch.cyclePhaseDetail !== 'string' || !Object.hasOwn(LAB_SAMPLE_CYCLE_DETAILS, patch.cyclePhaseDetail))) throw new Error('Use a supported reported phase detail, or null to clear it.');
}
export function labSampleCycleChanges(context: LabCollectionContext | undefined, patch: LabSampleCyclePatch) {
  validateLabSampleCyclePatch(patch);
  const next: LabCollectionContext = { ...context };
  if (patch.cycleDay !== undefined) next.cycleDay = patch.cycleDay;
  if (patch.cyclePhase !== undefined) next.cyclePhase = patch.cyclePhase;
  if (patch.cyclePhaseDetail !== undefined) next.cyclePhaseDetail = patch.cyclePhaseDetail;
  const detail = typeof next.cyclePhaseDetail === 'string' ? LAB_SAMPLE_CYCLE_DETAILS[next.cyclePhaseDetail as keyof typeof LAB_SAMPLE_CYCLE_DETAILS] : null;
  if (patch.cyclePhaseDetail != null && detail?.phase !== next.cyclePhase) throw new Error('The reported phase detail needs its matching cycle phase. Read the sample and supply both when needed.');
  if (patch.cyclePhase !== undefined && (next.cyclePhase === null || detail?.phase !== next.cyclePhase)) next.cyclePhaseDetail = null;
  if (patch.cyclePhase !== undefined || patch.cyclePhaseDetail != null) next.cyclePhaseSource = next.cyclePhase ? 'recorded' : null;
  const fields = [...LAB_SAMPLE_CYCLE_FIELDS, 'cyclePhaseSource'] as const;
  return Object.fromEntries(fields.filter(field => Object.hasOwn(next, field) && !Object.is(context?.[field] ?? null, next[field] ?? null)).map(field => [field, next[field]]));
}
export function describeLabSampleCycle(cycle: LabSampleCycleFacts): string {
  const phase = cycle.cyclePhase && Object.hasOwn(LAB_SAMPLE_CYCLE_PHASES, cycle.cyclePhase) ? LAB_SAMPLE_CYCLE_PHASES[cycle.cyclePhase as keyof typeof LAB_SAMPLE_CYCLE_PHASES] : cycle.cyclePhase || 'Unknown';
  const detail = cycle.cyclePhaseDetail && Object.hasOwn(LAB_SAMPLE_CYCLE_DETAILS, cycle.cyclePhaseDetail) ? LAB_SAMPLE_CYCLE_DETAILS[cycle.cyclePhaseDetail as keyof typeof LAB_SAMPLE_CYCLE_DETAILS].label : cycle.cyclePhaseDetail || 'Unknown';
  const source = cycle.cyclePhaseSource === 'predicted' ? 'Predicted' : cycle.cyclePhaseSource === 'recorded' ? 'Recorded' : cycle.cyclePhaseSource || 'Unspecified';
  return `Cycle day: ${cycle.cycleDay ?? 'Unknown'} · Phase: ${phase} · Detail: ${detail} · Phase source: ${source}`;
}
