// @ts-check
// Shared helpers for collection- and profile-specific marker ranges.

/**
 * Parse common imported collection-time forms without treating incidental
 * letters in phrases such as "sample time unknown" as an AM/PM marker.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseSampleHour(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0 && value < 24 ? value : null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const hasAm = /(^|[^a-z])a\.?m\.?(?=$|[^a-z])/.test(text);
  const hasPm = /(^|[^a-z])p\.?m\.?(?=$|[^a-z])/.test(text);
  if (text.includes('morning') || hasAm) {
    const m = text.match(/(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      let h = Number(m[1]);
      if (hasPm && h < 12) h += 12;
      if (hasAm && h === 12) h = 0;
      return h >= 0 && h < 24 ? h : null;
    }
    return text.includes('morning') ? 8 : null;
  }
  if (text.includes('afternoon')) return 14;
  if (text.includes('evening')) return 20;
  const m = text.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (hasPm && h < 12) h += 12;
  if (hasAm && h === 12) h = 0;
  return h >= 0 && h < 24 ? h : null;
}

/**
 * Representative adult serum total-cortisol interval for a known collection
 * time. Mayo CORT assay guidance: AM 7–25 µg/dL, PM 2–14 µg/dL. Outside
 * ordinary AM/PM collection windows, no generic single-point range is claimed.
 * @param {unknown} sampleTime
 * @param {unknown} unit
 * @returns {{ range: { min: number, max: number }, label: string } | null}
 */
export function cortisolReferenceForSampleTime(sampleTime, unit = '') {
  const hour = parseSampleHour(sampleTime);
  if (hour == null) return null;
  const isMorning = hour >= 6 && hour < 11;
  const isAfternoon = hour >= 12 && hour < 18;
  if (!isMorning && !isAfternoon) return null;
  const conventional = isMorning ? { min: 7, max: 25 } : { min: 2, max: 14 };
  const normalizedUnit = String(unit || '').toLowerCase();
  const usesConventional = normalizedUnit.includes('µg/dl') || normalizedUnit.includes('ug/dl');
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

/**
 * @param {string | null | undefined} dob
 * @param {string} dateStr
 * @returns {number | null}
 */
export function wholeAgeAtDate(dob, dateStr) {
  if (!dob) return null;
  const [birthYear, birthMonth, birthDay] = dob.split('-').map(Number);
  const [drawYear, drawMonth, drawDay] = dateStr.split('-').map(Number);
  if (![birthYear, birthMonth, birthDay, drawYear, drawMonth, drawDay].every(Number.isFinite)) return null;
  let age = drawYear - birthYear;
  if (drawMonth < birthMonth || (drawMonth === birthMonth && drawDay < birthDay)) age--;
  return age >= 0 ? age : null;
}

/**
 * @param {Record<string, any>} table
 * @param {string} dotKey
 * @param {number | null} age
 * @param {string | null | undefined} sex
 * @returns {{ min: number | null, max: number | null, label: string } | null}
 */
export function resolveAgeSexRange(table, dotKey, age, sex) {
  if (age == null) return null;
  const definition = table?.[dotKey];
  if (!definition) return null;
  const bands = definition[sex === 'female' ? 'female' : sex === 'male' ? 'male' : 'all'] || definition.all;
  if (!Array.isArray(bands)) return null;
  const band = bands.find(item => age >= item.minAge && age < item.maxAge);
  return band ? { min: band.min ?? null, max: band.max ?? null, label: band.label || 'Context range' } : null;
}
