import type {calculateCycleStats} from './cycle-summary.js';
import type {CycleImportCoverageView} from './cycle-import-presentation.js';

/** Display scalars retain their original truthiness and native option predicates. */
export interface CycleEditorProfileDisplay {
  cycleStatus?: unknown; cycleLength?: unknown; periodLength?: unknown;
  regularity?: unknown; flow?: unknown; contraceptive?: unknown; conditions?: unknown;
}
export interface CycleEditorPeriodInput {
  startDate: string; dateLabel: string; deleteAriaLabel: string; flowClass: string;
  flow: string | null | undefined; symptoms: readonly unknown[] | null | undefined; notes: unknown;
}
export interface CycleEditorPresentationInput {
  profile: CycleEditorProfileDisplay;
  stats: ReturnType<typeof calculateCycleStats>;
  activeCycle: boolean; periods: readonly CycleEditorPeriodInput[];
  today: string; defaultEnd: string; symptoms: readonly unknown[];
  coverage: CycleImportCoverageView | null; showClear: boolean;
}
export interface CycleEditorOptionView {value: string; label: string; selected: boolean}
export interface CycleEditorAutoFieldView {
  title: string; label: string; id: string | null; value: string | null; hint: string | null;
}
export interface CycleEditorPeriodView {
  startDate: string; dateLabel: string; deleteAriaLabel: string; flowClass: string;
  flow: string; symptoms: readonly string[]; notes: string | null;
}
export interface CycleEditorPresentationView {
  statusOptions: readonly CycleEditorOptionView[];
  contraceptiveNone: CycleEditorOptionView;
  contraceptiveGroups: readonly {label: string; options: readonly CycleEditorOptionView[]}[];
  contraceptiveOther: CycleEditorOptionView;
  autoFields: readonly CycleEditorAutoFieldView[];
  conditions: string; activeCycle: boolean; periods: readonly CycleEditorPeriodView[];
  today: string; defaultEnd: string; symptoms: readonly string[];
  coverage: CycleImportCoverageView | null; showClear: boolean;
}
const literal = (value: unknown): string => value == null ? '' : String(value);
const regularityLabels: Record<string, string> = {regular: 'Regular', irregular: 'Irregular', very_irregular: 'Very Irregular'};
const flowLabels: Record<string, string> = {light: 'Light', moderate: 'Moderate', heavy: 'Heavy'};
const knownContraceptives = ['OCP', 'Hormonal IUD (Mirena)', 'Implant', 'Patch', 'Ring', 'Depo injection', 'Copper IUD', 'Barrier', 'FAM'];

/** Projects prepared facts only; calculations, ordering, dates and writes stay with the controller. */
export function projectCycleEditorPresentation(input: CycleEditorPresentationInput): CycleEditorPresentationView {
  const {profile, stats} = input;
  // Preserve the original optional includes calls and independent selected flags.
  const contraceptive = profile.contraceptive as string | null | undefined;
  const option = (value: string, label: string, selected: unknown): CycleEditorOptionView => ({value, label, selected: Boolean(selected)});
  const autoField = (title: string, id: string, value: unknown, label: () => string, fallback: () => string, hint: string): CycleEditorAutoFieldView =>
    value != null ? {title, id, value: String(value), label: label(), hint: null} : {title, id: null, value: null, label: fallback(), hint};
  return {
    statusOptions: [
      option('regular', 'Active - regular cycling', profile.cycleStatus === 'regular' || !profile.cycleStatus),
      option('perimenopause', 'Perimenopause / irregular', profile.cycleStatus === 'perimenopause'),
      option('postmenopause', 'Postmenopause / no periods', profile.cycleStatus === 'postmenopause'),
      option('pregnant', 'Pregnant', profile.cycleStatus === 'pregnant'),
      option('breastfeeding', 'Breastfeeding', profile.cycleStatus === 'breastfeeding'),
      option('absent', 'Absent (other reason)', profile.cycleStatus === 'absent'),
    ],
    autoFields: [
      autoField('Average Cycle Length', 'mc-cycle-length-auto', stats.cycleLength, () => `${stats.cycleLength} days`, () => `${profile.cycleLength || 28} days`, 'default - log 2+ periods to auto-calculate'),
      autoField('Average Period Length', 'mc-period-length-auto', stats.periodLength, () => `${stats.periodLength} days`, () => `${profile.periodLength || 5} days`, 'default - log periods with end dates to auto-calculate'),
      autoField('Regularity', 'mc-regularity-auto', stats.regularity, () => String(regularityLabels[stats.regularity as string]), () => String(regularityLabels[profile.regularity as string] || 'Regular'), 'default - log 3+ periods to auto-calculate'),
      autoField('Typical Flow', 'mc-flow-auto', stats.flow, () => String(flowLabels[stats.flow as string]), () => String(flowLabels[profile.flow as string] || 'Moderate'), 'default - log 1+ period to auto-calculate'),
    ],
    contraceptiveNone: option('', 'None', !contraceptive),
    contraceptiveGroups: [
      {label: 'Hormonal', options: [
        option('OCP', 'OCP (birth control pill)', contraceptive === 'OCP'),
        option('Hormonal IUD (Mirena)', 'Hormonal IUD (Mirena/Kyleena)', contraceptive?.includes('Mirena')),
        option('Implant', 'Implant (Nexplanon)', contraceptive === 'Implant'),
        option('Patch', 'Patch', contraceptive === 'Patch'),
        option('Ring', 'Ring (NuvaRing)', contraceptive === 'Ring'),
        option('Depo injection', 'Depo injection', contraceptive?.includes('Depo')),
      ]},
      {label: 'Non-hormonal', options: [
        option('Copper IUD', 'Copper IUD', contraceptive === 'Copper IUD'),
        option('Barrier', 'Barrier (condom/diaphragm)', contraceptive === 'Barrier'),
        option('FAM', 'Fertility awareness', contraceptive === 'FAM'),
      ]},
    ],
    contraceptiveOther: option('other', 'Other', contraceptive && !knownContraceptives.includes(contraceptive) && contraceptive !== ''),
    conditions: literal(profile.conditions || ''), activeCycle: input.activeCycle,
    periods: input.periods.map(period => ({
      startDate: period.startDate, dateLabel: period.dateLabel, deleteAriaLabel: period.deleteAriaLabel,
      flowClass: period.flowClass, flow: literal(period.flow || 'moderate'),
      symptoms: period.symptoms?.length ? period.symptoms.map(literal) : [], notes: period.notes ? literal(period.notes) : null,
    })),
    today: input.today, defaultEnd: input.defaultEnd, symptoms: input.symptoms.map(literal),
    coverage: input.coverage, showClear: input.showClear,
  };
}
