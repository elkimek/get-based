import type { ContextRanges } from './schema-environment.js';

// Shared helpers for collection- and profile-specific marker ranges.

/**
 * Parse common imported collection-time forms without treating incidental
 * letters in phrases such as "sample time unknown" as an AM/PM marker.
 */
export function parseSampleHour(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0 && value < 24 ? value : null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const stripped = text.replace(/^\d{4}-\d{2}-\d{2}(?:[t\s]+|$)/, '').trim();
  if (!stripped) return null;
  const hasAm = /(?:\d\s*|^)a\.?m\.?(?=$|[^a-z])/.test(stripped);
  const hasPm = /(?:\d\s*|^)p\.?m\.?(?=$|[^a-z])/.test(stripped);
  const parseMatch = (m: RegExpMatchArray) => {
    let h = Number(m[1]);
    if (hasPm && h < 12) h += 12;
    if (hasAm && h === 12) h = 0;
    return h >= 0 && h < 24 ? h : null;
  };
  const clockMatch = stripped.match(/(?:^|[^0-9])(\d{1,2}):(\d{2})(?::\d{2})?(?=$|[^0-9])/);
  if (clockMatch) return parseMatch(clockMatch);
  const meridiemMatch = (hasAm || hasPm) ? stripped.match(/(?:^|[^0-9])(\d{1,2})\s*(?:a\.?m\.?|p\.?m\.?)(?=$|[^a-z])/) : null;
  if (meridiemMatch) return parseMatch(meridiemMatch);
  const bareMatch = stripped.match(/^(\d{1,2})$/) || (stripped.includes('morning') ? stripped.match(/(?:^|[^0-9])(\d{1,2})(?=$|[^0-9])/) : null);
  if (bareMatch) return parseMatch(bareMatch);
  if (stripped.includes('morning')) return 8;
  if (stripped.includes('afternoon')) return 14;
  if (stripped.includes('evening')) return 20;
  const fallbackMatch = stripped.match(/(?:^|[^0-9])(\d{1,2})(?=$|[^0-9])/);
  return fallbackMatch ? parseMatch(fallbackMatch) : null;
}

/**
 * Representative adult serum total-cortisol interval for a known collection
 * time. Mayo CORT assay guidance: AM 7–25 µg/dL, PM 2–14 µg/dL. Outside
 * ordinary AM/PM collection windows, no generic single-point range is claimed.
 */
export function cortisolReferenceForSampleTime(sampleTime: unknown, unit: unknown = '') {
  const hour = parseSampleHour(sampleTime);
  if (hour == null) return null;
  const isMorning = hour >= 6 && hour < 11;
  const isAfternoon = hour >= 12 && hour < 18;
  if (!isMorning && !isAfternoon) return null;
  const conventional = isMorning ? { min: 7, max: 25 } : { min: 2, max: 14 };
  const normalizedUnit = String(unit || '').toLowerCase();
  if (!/^(?:nmol\/l|[µμu]g\/dl)$/i.test(normalizedUnit)) return null;
  const usesConventional = normalizedUnit.includes('µg/dl') || normalizedUnit.includes('μg/dl') || normalizedUnit.includes('ug/dl');
  return {
    range: usesConventional
      ? conventional
      : {
          min: Number((conventional.min / 0.03625).toPrecision(4)),
          max: Number((conventional.max / 0.03625).toPrecision(4)),
        },
    label: isMorning ? 'Morning assay range' : 'Afternoon assay range',
  };
}

export function wholeAgeAtDate(dob: string | null | undefined, dateStr: string) {
  if (!dob) return null;
  const [birthYear, birthMonth, birthDay] = dob.split('-').map(Number);
  const [drawYear, drawMonth, drawDay] = dateStr.split('-').map(Number);
  if (![birthYear, birthMonth, birthDay, drawYear, drawMonth, drawDay].every(Number.isFinite)) return null;
  let age = drawYear! - birthYear!;
  if (drawMonth! < birthMonth! || (drawMonth === birthMonth && drawDay! < birthDay!)) age--;
  return age >= 0 ? age : null;
}

export function fractionalAgeAtDate(dob: string | null | undefined, dateStr: string) {
  if (!dob) return null;
  const age = (Date.parse(dateStr) - Date.parse(dob)) / (365.25 * 86_400_000);
  return Number.isFinite(age) && age > 0 ? age : null;
}

export function resolveAgeSexRange(table: ContextRanges, dotKey: string, age: number | null, sex: string | null | undefined) {
  if (age == null) return null;
  const definition = table?.[dotKey];
  if (!definition) return null;
  const bands = definition[sex === 'female' ? 'female' : sex === 'male' ? 'male' : 'all'] || definition.all;
  if (!Array.isArray(bands)) return null;
  const band = bands.find(item => age >= item.minAge && age < item.maxAge);
  return band ? { min: band.min ?? null, max: band.max ?? null, label: band.label || 'Context range' } : null;
}
