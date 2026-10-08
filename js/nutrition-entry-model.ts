// Pure form projections and drink records; domain normalization remains in nutrition-targets.
import { NUTRIENT_GROUPS, nutrientFieldsForGroup } from './nutrition-nutrient-registry.js';
import { getNutritionTargets, normalizeNutritionTargets, resolveNutritionTargets } from './nutrition-targets.js';
import { formatNumber, proteinTargetSource } from './nutrition-presentation-model.js';
import type { NormalizedNutritionTargets, NutritionTargetProfile } from './nutrition-targets.js';

export type TargetNumberKey = Exclude<keyof NormalizedNutritionTargets, 'configured' | 'proteinBasis' | 'widgetNutrients'>;
export interface TargetField { key: TargetNumberKey; id: string; label: string; unit: string; min: number; max: number; step: number; }
export const TARGET_FIELDS: readonly TargetField[] = [
  { key: 'energyKcal', id: 'energy', label: 'Energy', unit: 'kcal', min: 500, max: 10000, step: 10 },
  { key: 'carbohydrateG', id: 'carbohydrate', label: 'Carbohydrate', unit: 'g', min: 0, max: 1500, step: 1 },
  { key: 'fatG', id: 'fat', label: 'Fat', unit: 'g', min: 0, max: 500, step: 1 },
  { key: 'fiberG', id: 'fiber', label: 'Fiber', unit: 'g', min: 0, max: 150, step: 1 },
  { key: 'fluidMl', id: 'fluid', label: 'Logged drinks', unit: 'mL', min: 0, max: 10000, step: 50 },
  { key: 'sugarG', id: 'sugar', label: 'Sugar', unit: 'g', min: 0, max: 500, step: 1 },
  { key: 'sodiumMg', id: 'sodium', label: 'Sodium', unit: 'mg', min: 0, max: 10000, step: 10 },
  { key: 'proteinGPerKg', id: 'protein-factor', label: 'Protein factor', unit: 'g/kg', min: 0.4, max: 3.5, step: 0.01 },
  { key: 'proteinFixedG', id: 'protein-fixed', label: 'Protein', unit: 'g', min: 10, max: 500, step: 1 },
];
export const PROTEIN_OPTIONS = [
  ['general', 'General adult · 0.83 g/kg'], ['active', 'Active / training · 1.6 g/kg'],
  ['high', 'High training · 2.0 g/kg'], ['custom', 'Custom g/kg'], ['fixed', 'Fixed grams'],
] as const;
export const PROTEIN_PRESETS: Readonly<Record<string, number>> = { general: 0.83, active: 1.6, high: 2 };
export type NutritionTargetDraft = Omit<NormalizedNutritionTargets, TargetNumberKey> & Record<TargetNumberKey, number | undefined>;
export interface NutritionTargetsView {
  kind: 'targets'; targets: NormalizedNutritionTargets; profile: NutritionTargetProfile;
  returnTo: 'history' | ''; weight: string;
  groups: { label: string; nutrients: { key: string; label: string }[] }[];
}
export interface FluidDraft { kind: string; amount: number | undefined; at: string; label: string; }
export interface NutritionFluidView { kind: 'fluid'; initial: FluidDraft; }
export type NutritionEntryView = NutritionTargetsView | NutritionFluidView;
export type NutritionEntryResult = 'saved' | 'failed' | 'conflict' | 'retired' | 'blocked' | 'busy';
export interface NutritionEntryActions {
  current(): boolean;
  saveTargets(value: NormalizedNutritionTargets, closeOnSave?: boolean): Promise<boolean>;
  saveFluid(value: FluidDraft): Promise<boolean>;
  notify(message: string): void;
  failureMessage?(): string;
}
export interface NutritionEntryExports { save(closeOnSave?: boolean): Promise<boolean>; update(): void; }
export const entryResultMessage = (result: NutritionEntryResult) => result === 'conflict'
  ? 'Nutrition setup changed elsewhere. Reopen setup before saving these edits.'
  : result === 'blocked' ? 'This profile could not be read safely. Reload it before saving.'
  : 'Nutrition setup could not be saved; your previous settings are unchanged.';

export function buildNutritionTargetsView(profile: NutritionTargetProfile, { returnTo = '' }: { returnTo?: unknown } = {}): NutritionTargetsView {
  const targets = getNutritionTargets(profile), resolved = resolveNutritionTargets(profile);
  return {
    kind: 'targets', targets: { ...targets, proteinGPerKg: Number(resolved.proteinFactor || targets.proteinGPerKg) },
    profile: structuredClone({ biometrics: profile.biometrics, wearableSummary: profile.wearableSummary }), returnTo: returnTo === 'history' ? 'history' : '',
    weight: resolved.weight ? `${formatNumber(resolved.weight.kg, 1)} kg · ${resolved.weight.source}` : 'No weight measurement yet',
    groups: NUTRIENT_GROUPS.map(group => ({ label: group.label, nutrients: nutrientFieldsForGroup(group.id)
      .filter(field => field.key !== 'energyKcal').map(field => ({ key: field.key, label: field.label })) })),
  };
}
export function targetProteinPreview(profile: NutritionTargetProfile, draft: NutritionTargetDraft): string {
  const resolved = resolveNutritionTargets({ ...profile, nutritionTargets: normalizeNutritionTargets(draft) });
  return `Protein guide: ${formatNumber(resolved.proteinG, 1)} g/day · ${proteinTargetSource(resolved)}`;
}
export function localDateTimeValue(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function buildNutritionFluidView(now = new Date()): NutritionFluidView {
  return { kind: 'fluid', initial: { kind: 'water', amount: 350, at: localDateTimeValue(now), label: '' } };
}
export const FLUID_KINDS = [
  { key: 'water', icon: '◌', title: 'Water', detail: 'Counts as plain water' },
  { key: 'tea-coffee', icon: '☕', title: 'Tea or coffee', detail: 'Counts as a logged drink' },
  { key: 'other', icon: '◒', title: 'Other', detail: 'Juice, milk, or another drink' },
] as const;
export function fluidPreview(draft: FluidDraft) {
  const amount = Number(draft.amount), valid = Number.isFinite(amount) && amount > 0 && amount <= 10000;
  const labels: Record<string, string> = { water: 'water', 'tea-coffee': 'tea or coffee', other: 'beverage' };
  const amountLabel = valid ? `${formatNumber(amount, 1)} mL` : 'Drink amount';
  return { title: amountLabel + (valid ? ` ${labels[draft.kind] || 'beverage'}` : ''),
    detail: draft.kind === 'water' ? 'Adds to logged drinks and plain water.' : 'Adds to logged drinks; the plain-water total stays unchanged.',
    button: valid ? `Log ${amountLabel}` : 'Log drink' };
}
export function fluidDraftError(draft: FluidDraft): { field: string; message: string } | null {
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return { field: 'nutrition-fluid-amount', message: 'Enter a drink amount between 1 and 10,000 mL.' };
  if (!Number.isFinite(new Date(draft.at).getTime())) return { field: 'nutrition-fluid-at', message: 'Choose a valid drink date and time.' };
  return null;
}
export function mealFromFluidDraft(draft: FluidDraft) {
  const error = fluidDraftError(draft);
  if (error) throw new Error(error.message);
  const labels: Record<string, string> = { water: 'Water', 'tea-coffee': 'Tea or coffee', other: 'Beverage' };
  const name = draft.label.trim() || labels[draft.kind] || 'Beverage';
  const value = Math.round(Number(draft.amount) * 10) / 10, eatenAt = new Date(draft.at);
  const [, timePart = '00:00'] = draft.at.split('T'), [hour, minute] = timePart.split(':').map(Number);
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  return {
    name, mealType: 'drink', eatenAt: eatenAt.toISOString(), localDate: draft.at.slice(0, 10),
    localTimeMinutes: Number.isFinite(hour) && Number.isFinite(minute) ? hour! * 60 + minute! : null,
    timezoneOffsetMinutes: eatenAt.getTimezoneOffset(), timeZone, note: '', analysisContext: '',
    nutrients: { fluidMl: value, ...(draft.kind === 'water' ? { plainWaterMl: value } : {}) },
    components: [{ name, quantityG: null, confidence: 1, nutrients: {} }],
    assumptions: [], warnings: [], confidence: 1, images: [],
    source: { kind: draft.kind === 'water' ? 'manual-water' : 'manual-beverage', recordedAt: new Date().toISOString(), nutrientBasis: 'user-entered' },
    reviewed: true,
  };
}
