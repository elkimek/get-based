// @ts-check
// Collection-date policy for Biology Scores.
export const SCORE_STALE_DAYS = 180;
export const SCORE_DATE_SPAN_DAYS = 90;
export const DAY_MS = 86400000;

export function getAgeDays(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const ts = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (!Number.isFinite(ts) || new Date(ts).toISOString().slice(0, 10) !== dateStr) return null;
  return Math.floor((Date.now() - ts) / DAY_MS);
}

export function formatAge(ageDays) {
  if (!Number.isFinite(ageDays)) return '';
  if (ageDays < 45) return `${Math.max(0, ageDays)}d old`;
  if (ageDays < 730) return `${Math.round(ageDays / 30)}mo old`;
  return `${Math.round(ageDays / 365)}y old`;
}

export function assessScoreRecency(available) {
  const invalid = available.find(item => { const age = getAgeDays(item.date); return age == null || age < 0; });
  if (invalid) return { status: 'unknown-date', blocked: true, badge: 'Check collection date', message: `${invalid.label || 'An input'} has an unknown or future collection date.` };
  const dated = available
    .filter(item => item.date)
    .map(item => ({ ...item, ageDays: getAgeDays(item.date), ts: new Date(`${item.date}T00:00:00Z`).getTime() }))
    .filter(item => Number.isFinite(item.ts));
  dated.sort((a, b) => a.ts - b.ts);
  const oldest = dated[0];
  const newest = dated[dated.length - 1];
  const spanDays = dated.length > 1 ? Math.round((newest.ts - oldest.ts) / DAY_MS) : 0;
  const stale = dated.find(item => Number.isFinite(item.ageDays) && item.ageDays > SCORE_STALE_DAYS);
  if (spanDays > SCORE_DATE_SPAN_DAYS) {
    return {
      status: 'mixed-dates',
      blocked: true,
      badge: 'Retest together',
      message: `Inputs span ${spanDays} days (${oldest.label} ${oldest.date}, ${newest.label} ${newest.date}). Retest this panel together before scoring.`,
    };
  }
  if (stale) {
    return {
      status: 'stale',
      blocked: true,
      badge: 'Retest needed',
      message: `${stale.label} is ${formatAge(stale.ageDays)}; retest this score together before trusting it.`,
    };
  }
  return { status: 'fresh', blocked: false, badge: 'Dates aligned', message: dated.length > 1 ? `Inputs span ${spanDays} days.` : '' };
}
