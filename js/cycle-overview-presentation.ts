import type {BodyMeasurementTiming} from './body-measurement-cycle.js';
/** Already prepared overview facts; the controller owns dates, calculations and scalar coercions. */
export interface CycleOverviewSummaryInput {
  primary: string; aria: string; meta: readonly string[];
}
export interface CycleOverviewSummaryView {
  primary: string; ariaLabel: string; meta: readonly string[];
}
export interface CycleOverviewPhaseView {
  phase: string; label: string; dateLabel: string; dayLabel: string | null;
  sourceLabel: 'Recorded' | 'Predicted';
}
export interface CycleOverviewPeriodView {
  dateLabel: string; flowClass: string; flow: string;
  symptoms: readonly string[]; notes: string | null;
}
export interface CycleOverviewAlertView {
  tone: 'perimenopause' | 'critical' | 'warning' | 'info';
  icon: 'info' | 'warning'; title: string; message: string;
}
export interface CycleOverviewPresentationInput {
  compact: boolean; showHeader: boolean; hasProfile: boolean;
  summary: CycleOverviewSummaryInput | null; drawDescription: string | null;
  phases: readonly CycleOverviewPhaseView[]; phaseOverflow: number;
  periods: readonly CycleOverviewPeriodView[]; alerts: readonly CycleOverviewAlertView[];
  measurementTiming?: BodyMeasurementTiming | null;
}
export interface CycleOverviewPresentationView extends Omit<CycleOverviewPresentationInput, 'summary' | 'phaseOverflow'> {
  summary: CycleOverviewSummaryView | null;
  editLabel: 'Edit' | 'Set up'; editIcon: 'edit' | 'plus'; overflowLabel: string | null;
}

/** Composes display text only; preparation order and all domain decisions stay in cycle.ts. */
export function projectCycleOverviewPresentation(input: CycleOverviewPresentationInput): CycleOverviewPresentationView {
  return {
    compact: input.compact, showHeader: input.showHeader, hasProfile: input.hasProfile,
    summary: input.summary ? {primary: input.summary.primary, ariaLabel: `Edit cycle: ${input.summary.aria}`, meta: input.summary.meta} : null,
    drawDescription: input.drawDescription, phases: input.phases, periods: input.periods, alerts: input.alerts,
    measurementTiming: input.measurementTiming ?? null,
    editLabel: input.hasProfile ? 'Edit' : 'Set up', editIcon: input.hasProfile ? 'edit' : 'plus',
    overflowLabel: input.phaseOverflow > 0 ? `+${input.phaseOverflow} more draws` : null,
  };
}
