// sun-correlations.js — On-demand Pearson correlation between weekly
// sun-channel doses and per-week biomarker values. Surfaces in the standard
// AI tier so chat can answer "why did my testosterone drop in November?"
// with channel-level precision.
//
// We don't run nightly cron; we recompute lazily when needed and cache the
// result. Cache key invalidates when sessions[] or device sessions change.

import { state } from './state.js';
import { getSessions } from './sun.js';

import type { SunSessionRecord } from './sun-sessions-store.js';
import type { DeviceSessionRecord } from './light-devices-store.js';

export interface SunCorrelationPair {
  channel: string; biomarker: string; biomarkerKey: string; r: number; n: number; lag: number;
}
export interface SunCorrelations {pairs: SunCorrelationPair[]; computedAt: number; weeks?: unknown}
type DoseSession = Pick<SunSessionRecord | DeviceSessionRecord, 'doses' | 'endedAt'>;
interface WeeklyChannelSlot {startMs: number; endMs: number; channels: Record<string, unknown>}

// Schema keys for the biomarkers most coupled to light exposure. Keys must
// match `category.markerKey` exactly as stored on entries — see js/schema.js.
// Earlier draft used pre-schema labels (`vitamin_d_25oh`, `iron_metabolism`,
// `proteins_inflammation`, `hs_crp`) that never resolved to anything in
// state.importedData.entries — the correlation engine had been silently
// returning an empty pairs array since shipping. Fixed in v1.7.20.
const TARGET_BIOMARKERS = [
  { cat: 'vitamins', key: 'vitaminD',     label: '25-OH vitamin D' },
  { cat: 'hormones', key: 'testosterone', label: 'Testosterone' },
  { cat: 'hormones', key: 'estradiol',    label: 'Estradiol' },
  { cat: 'hormones', key: 'shbg',         label: 'SHBG' },
  { cat: 'hormones', key: 'dheaS',        label: 'DHEA-S' },
  { cat: 'iron',     key: 'ferritin',     label: 'Ferritin' },
  { cat: 'proteins', key: 'hsCRP',        label: 'hs-CRP' },
  { cat: 'thyroid',  key: 'tsh',          label: 'TSH' },
  { cat: 'thyroid',  key: 'ft3',          label: 'Free T3' },
];

// Original unchecked dose additions and arithmetic can coerce raw stored
// values. These operation assertions do not validate or normalize inputs.
// Pearson correlation
function pearson(xs: readonly unknown[], ys: readonly unknown[]) {
  if (xs.length !== ys.length || xs.length < 4) return null;
  const n = xs.length;
  const mx = (xs.reduce((a, b) => (a as number) + (b as number), 0) as number) / n;
  const my = (ys.reduce((a, b) => (a as number) + (b as number), 0) as number) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const ax = (xs[i] as number) - mx;
    const ay = (ys[i] as number) - my;
    num += ax * ay;
    dx2 += ax * ax;
    dy2 += ay * ay;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

// Bin sessions into N-day windows ending now
function weeklyChannelSeries(sessions: readonly DoseSession[] | null | undefined, deviceSessions: readonly DoseSession[] | null | undefined, weeks: unknown = 12) {
  const now = Date.now();
  const series: WeeklyChannelSlot[] = []; // [{startMs, endMs, channels: {}}, ...]
  for (let w = 0; w < (weeks as number); w++) {
    const endMs = now - w * 7 * 86400 * 1000;
    const startMs = endMs - 7 * 86400 * 1000;
    series.unshift({ startMs, endMs, channels: {} });
  }
  const accumulate = (sess: DoseSession | null | undefined) => {
    if (!sess?.doses || !sess.endedAt) return;
    for (const slot of series) {
      if (sess.endedAt >= slot.startMs && sess.endedAt < slot.endMs) {
        for (const [k, v] of Object.entries(sess.doses)) {
          slot.channels[k] = ((slot.channels[k] || 0) as number) + v;
        }
        return;
      }
    }
  };
  for (const s of sessions || []) accumulate(s);
  for (const s of deviceSessions || []) accumulate(s);
  return series;
}

// Pull weekly biomarker values from importedData.entries. Entries store
// markers as a flat object keyed by `category.markerKey` (single dotted
// string), not nested by category — earlier draft read e.values?.[cat]?.[m]
// which never resolved.
function weeklyBiomarkerValues(catKey: string, mKey: string, weeks: unknown = 12) {
  const entries = state.importedData?.entries || [];
  const flatKey = `${catKey}.${mKey}`;
  const now = Date.now();
  const values: (number | null)[] = [];
  for (let w = (weeks as number) - 1; w >= 0; w--) {
    const endMs = now - w * 7 * 86400 * 1000;
    const startMs = endMs - 7 * 86400 * 1000;
    let sum = 0, count = 0;
    for (const e of entries) {
      const t = new Date(e.date).getTime();
      if (!Number.isFinite(t) || t < startMs || t >= endMs) continue;
      const v = e.markers?.[flatKey];
      if (typeof v === 'number' && Number.isFinite(v)) { sum += v; count++; }
    }
    values.push(count > 0 ? sum / count : null);
  }
  return values;
}

// Compute correlation pairs (channel × biomarker). Skips pairs with <4
// overlapping non-null weeks.
export function computeSunCorrelations({ weeks = 12 }: {weeks?: unknown} = {}): SunCorrelations {
  const sessions = getSessions();
  const devSessions = state.importedData?.deviceSessions || [];
  if (sessions.length === 0 && devSessions.length === 0) return { pairs: [], computedAt: Date.now() };
  const series = weeklyChannelSeries(sessions, devSessions, weeks);
  // Include the two PBM channels (660 nm / 810-850 nm) — they're the
  // only channels device-heavy users (Joovv, Mito Red, Chroma) populate
  // meaningfully, and the correlation engine is the surface where
  // "this PBM panel moved my HRV" can show up. Excluding them silenced
  // the entire device-PBM × biomarker signal for device-only users.
  const channels = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];

  const pairs: SunCorrelationPair[] = [];
  for (const ch of channels) {
    const xs = series.map(s => s.channels[ch] || 0);
    for (const m of TARGET_BIOMARKERS) {
      const ys = weeklyBiomarkerValues(m.cat, m.key, weeks);
      // Filter to weeks where biomarker has data
      const x: unknown[] = [], y: number[] = [];
      for (let i = 0; i < xs.length; i++) {
        if (ys[i] != null) { x.push(xs[i]); y.push(ys[i]!); }
      }
      if (x.length < 4) continue;
      const r = pearson(x, y);
      if (r == null) continue;
      pairs.push({ channel: ch, biomarker: m.label, biomarkerKey: `${m.cat}.${m.key}`, r, n: x.length, lag: 0 });
    }
  }
  pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return { pairs, weeks, computedAt: Date.now() };
}

// Cache helpers
let _cache: {key: string; value: SunCorrelations; computedAt: number} | null = null;
function cacheKey() {
  const p = state.currentProfile || 'default';
  const s = state.importedData?.sunSessions?.length || 0;
  const d = state.importedData?.deviceSessions?.length || 0;
  const e = state.importedData?.entries?.length || 0;
  return `${p}-${s}-${d}-${e}`;
}

export function getSunCorrelations() {
  const key = cacheKey();
  if (_cache && _cache.key === key && Date.now() - _cache.computedAt < 60_000 * 60) {
    return _cache.value;
  }
  const value = computeSunCorrelations();
  _cache = { key, value, computedAt: Date.now() };
  // The in-memory _cache covers the session lifetime. The previous code
  // also wrote `state.importedData.sunCorrelations = value` without
  // calling saveImportedData, so the persisted blob diverged from the
  // computed value and never sync'd to peers. Drop the half-persistence;
  // sun-context.js standard tier still calls getSunCorrelations() on
  // demand and the cache covers cross-page reads within a session.
  return value;
}
