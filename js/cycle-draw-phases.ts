
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export interface RecordedDrawPhase {
  cycleDay: number | null;
  phase: CyclePhase;
  phaseName: string;
  phaseDetailName: string;
  confidence: 'recorded' | 'medium';
  basedOnStartDate: null;
  source: 'recorded' | 'predicted';
}

const PHASE_NAMES = Object.freeze({
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulatory: 'Ovulatory',
  luteal: 'Luteal',
});

const PHASE_DETAIL_NAMES: Readonly<Record<string, string>> = Object.freeze({
  early_follicular: 'Early follicular',
  late_follicular: 'Late follicular',
  periovulatory: 'Periovulatory',
  early_luteal: 'Early luteal',
  mid_luteal: 'Mid-luteal',
  late_luteal: 'Late luteal',
});

function normalizePhaseLabel(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Prefer explicit per-draw cycle context imported from a lab report or entered
 * by the user. Returning null lets the caller fall back to profile prediction.
 *
 */
export function getRecordedDrawPhase(context: Record<string, unknown> | null | undefined): RecordedDrawPhase | null {
  const normalizedPhase = normalizePhaseLabel(context?.cyclePhase);
  const phase: CyclePhase | null = normalizedPhase.includes('menstrual') || normalizedPhase === 'menses' ? 'menstrual'
    : normalizedPhase.includes('follicular') ? 'follicular'
    : normalizedPhase.includes('ovulat') ? 'ovulatory'
    : normalizedPhase.includes('luteal') ? 'luteal'
    : null;
  if (!phase) return null;

  const detail = normalizePhaseLabel(context?.cyclePhaseDetail);
  const cycleDayNumber = Number(context?.cycleDay);
  const source = String(context?.cyclePhaseSource || '').toLowerCase() === 'predicted' ? 'predicted' : 'recorded';
  return {
    cycleDay: Number.isInteger(cycleDayNumber) && cycleDayNumber > 0 ? cycleDayNumber : null,
    phase,
    phaseName: PHASE_NAMES[phase],
    phaseDetailName: PHASE_DETAIL_NAMES[detail] || PHASE_NAMES[phase],
    confidence: source === 'recorded' ? 'recorded' : 'medium',
    basedOnStartDate: null,
    source,
  };
}
