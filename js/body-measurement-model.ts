import type {ManualBodyReading} from '../types/app-state.js';

export const BODY_POSITIONS = [
  {id: 'standing', label: 'Standing'}, {id: 'seated', label: 'Seated'}, {id: 'supine', label: 'Lying down'},
] as const;
export const WAIST_SITES = [
  {id: 'midpoint', label: 'Between lowest rib and hip bone', hint: 'Measure halfway between the lowest rib and top of the hip bone.'},
  {id: 'iliac', label: 'Top of hip bone', hint: 'Measure around the top of the hip bone.'},
  {id: 'navel', label: 'At the navel', hint: 'Measure around the navel.'},
] as const;
export type BodyPosition = typeof BODY_POSITIONS[number]['id'];
export type WaistSite = typeof WAIST_SITES[number]['id'];
export type BodyMeasurementKind = 'waist' | 'abdominal_depth';
// Method-specific fields preserve same-day readings and independent sync clocks.
export const BODY_MEASUREMENT_FIELDS: string[] = [
  ...BODY_POSITIONS.flatMap(position => WAIST_SITES.flatMap(site =>
    [`waist_${position.id}_${site.id}`, `hip_${position.id}_${site.id}`])),
  'sad_supine_iliac',
];
export interface BodyMeasurementData {
  manualBodyReadings?: Record<string, ManualBodyReading>;
  manualMetricTombstones?: Record<string, number>;
}
export interface BodyMeasurement {
  field: string; date: string; valueCm: number; hipCm: number | null;
  position: BodyPosition; site: WaistSite; updatedAt: number;
}
export interface BodyMeasurementDraft {
  kind: BodyMeasurementKind; date: string; value: number; hip: number | null;
  position: BodyPosition; site: WaistSite; unit: 'cm' | 'in';
  original?: Pick<BodyMeasurement, 'field' | 'date'>;
}
export function isBodyMeasurementId(value: unknown): value is BodyMeasurementKind {
  return value === 'waist' || value === 'abdominal_depth';
}
export function validMeasurementDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date;
}
function visibleValue(data: BodyMeasurementData, field: string, date: string): {value: number; updatedAt: number} | null {
  const entry = data.manualBodyReadings?.[`${field}.${date}`];
  if (!entry || typeof entry.value !== 'number' || !Number.isFinite(entry.value) || entry.value <= 0
    || entry.value > 400 || !Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) return null;
  const markers = data.manualMetricTombstones;
  const exact = markers?.[`${field}.${date}`];
  if (exact !== 0 && Math.max(exact || 0, markers?.[`${field}.all`] || 0) > 0) return null;
  return {value: entry.value, updatedAt: entry.updatedAt};
}
export function bodyMeasurementRecords(data: BodyMeasurementData, kind: BodyMeasurementKind): BodyMeasurement[] {
  const rows: BodyMeasurement[] = [];
  for (const key of Object.keys(data.manualBodyReadings || {})) {
    const match = /^(waist_(standing|seated|supine)_(midpoint|iliac|navel)|sad_supine_iliac)\.(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (!match || !validMeasurementDate(match[4]!)) continue;
    const field = match[1]!, date = match[4]!;
    if ((kind === 'waist') !== field.startsWith('waist_')) continue;
    const value = visibleValue(data, field, date);
    if (!value) continue;
    const hip = kind === 'waist' ? visibleValue(data, field.replace(/^waist_/, 'hip_'), date) : null;
    rows.push({field, date, valueCm: value.value, hipCm: hip?.updatedAt === value.updatedAt ? hip.value : null,
      position: (match[2] || 'supine') as BodyPosition, site: (match[3] || 'iliac') as WaistSite, updatedAt: value.updatedAt});
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt || a.field.localeCompare(b.field));
}
export function measurementPatch(draft: BodyMeasurementDraft): Record<string, number | null> {
  if (!isBodyMeasurementId(draft.kind) || !validMeasurementDate(draft.date)
    || !BODY_POSITIONS.some(item => item.id === draft.position) || !WAIST_SITES.some(item => item.id === draft.site)
    || !['cm', 'in'].includes(draft.unit)) throw new Error('Choose a valid date and measurement method.');
  const scale = draft.unit === 'in' ? 2.54 : 1;
  const value = draft.value * scale, hip = draft.hip === null ? null : draft.hip * scale;
  if (!Number.isFinite(value) || value <= 0 || value > 400
    || (hip !== null && (!Number.isFinite(hip) || hip <= 0 || hip > 400))) throw new Error('Enter a measurement between 0 and 400 cm.');
  if (draft.kind === 'abdominal_depth') {
    if (draft.position !== 'supine' || draft.site !== 'iliac') throw new Error('Abdominal depth uses the lying-down caliper method.');
    return {sad_supine_iliac: value};
  }
  const suffix = `${draft.position}_${draft.site}`;
  return {[`waist_${suffix}`]: value, [`hip_${suffix}`]: hip};
}
export function bodyPositionLabel(position: BodyPosition): string {
  return BODY_POSITIONS.find(item => item.id === position)!.label;
}
export function measurementNumber(valueCm: number, unit: 'cm' | 'in'): string {
  return (unit === 'in' ? valueCm / 2.54 : valueCm).toFixed(1);
}
/** Profile height is canonical centimetres; its saved unit is a display preference. */
export function bodyMeasurementHeightCm(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const height = Number(value);
  return Number.isFinite(height) && height > 0 && height <= 400 ? height : null;
}
export function waistToHeightRatio(waistCm: number, heightCm: unknown): number | null {
  const height = bodyMeasurementHeightCm(heightCm);
  return height !== null && Number.isFinite(waistCm) && waistCm > 0 && waistCm <= 400 ? waistCm / height : null;
}
export function measurementDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(new Date(`${date}T12:00:00Z`));
}
