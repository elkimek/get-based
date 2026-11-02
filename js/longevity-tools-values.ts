// longevity-tools-values.ts — collect the latest stored value for every
// longevity-tools.com parameter from the active profile.
//
// Reads canonical (SI) storage — importedData.entries — never getActiveData(),
// which is already converted to the user's display unit system. The site does
// its own unit conversion, so we always send the stored SI value + its unit.

import { LONGEVITY_PARAM_SOURCES, type LongevityValue } from './longevity-tools-catalog.js';

export interface LongevityEntryLike { date?: unknown; markers?: Record<string, unknown> | null }
export interface LongevityProfileInputs {
  entries: readonly LongevityEntryLike[];
  ageYears: number | null;
  sex: string | null;
  weight: { kg: number; date: string } | null;
  heightCm: number | null;
  bp: { sys: number; dia: number; date: string } | null;
  waistCm: { cm: number; date: string } | null;
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Latest non-null stored value per get-based marker key, with its draw date. */
export function latestMarkerValues(entries: readonly LongevityEntryLike[]): Map<string, { value: number; date: string }> {
  const sorted = [...entries].filter(e => typeof e?.date === 'string').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const out = new Map<string, { value: number; date: string }>();
  for (const entry of sorted) {
    for (const [key, raw] of Object.entries(entry.markers || {})) {
      if (out.has(key)) continue;
      const value = finite(raw);
      if (value != null) out.set(key, { value, date: String(entry.date) });
    }
  }
  return out;
}

export function collectLongevityValues(input: LongevityProfileInputs): Record<string, LongevityValue | string> {
  const latest = latestMarkerValues(input.entries);
  const values: Record<string, LongevityValue | string> = {};
  for (const [id, src] of Object.entries(LONGEVITY_PARAM_SOURCES)) {
    for (const key of src.keys) {
      const hit = latest.get(key);
      if (!hit) continue;
      values[id] = { value: hit.value * (src.factor ?? 1), unit: src.unit, date: hit.date, label: key };
      break;
    }
  }
  if (input.ageYears != null && input.ageYears > 0) values.age = { value: input.ageYears, unit: 'years', date: null, label: 'profile.age' };
  if (input.sex === 'male' || input.sex === 'female') values.gender = input.sex;
  if (input.weight && input.weight.kg > 0) values.weight = { value: Math.round(input.weight.kg * 10) / 10, unit: 'kg', date: input.weight.date || null, label: 'body.weight' };
  if (input.heightCm && input.heightCm > 0) values.height = { value: Math.round(input.heightCm * 10) / 10, unit: 'cm', date: null, label: 'profile.height' };
  if (input.bp) {
    values['BP-sys'] = { value: input.bp.sys, unit: 'mmHg', date: input.bp.date || null, label: 'body.bpSystolic' };
    values['BP-dia'] = { value: input.bp.dia, unit: 'mmHg', date: input.bp.date || null, label: 'body.bpDiastolic' };
  }
  if (input.waistCm && input.waistCm.cm > 0) values.waistCirc = { value: input.waistCm.cm, unit: 'cm', date: input.waistCm.date || null, label: 'body.waist' };
  return values;
}
