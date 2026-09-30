// Apple Health record parsing and canonical day aggregation; import side effects stay in the orchestrator.
import { CANONICAL_METRICS, adapterById } from './wearable-adapters.js';
import type { CanonicalWearableMetricId } from './wearable-adapters.js';
import type { BasicWearableMetric, WearableDailyRow } from './wearable-data-types.js';

export interface AppleHealthProgress {
  stage: string;
  pct?: number;
  rows?: number;
  startDate?: string | null;
  endDate?: string | null;
}
export type AppleHealthProgressCallback = (event: AppleHealthProgress) => void;
export type AppleHealthDailyRow = WearableDailyRow<'apple_health', BasicWearableMetric
  | 'body_fat_pct' | 'lean_mass_kg' | 'fat_mass_kg' | 'vo2max'>;
interface AppleHealthSample { v: number; h: number | null; src: string }
type AppleHealthBuckets = Partial<Record<CanonicalWearableMetricId, AppleHealthSample[]>>;
type AppleHealthDays = Map<string, AppleHealthBuckets>;
type AppleHealthTypeMap = Record<string, CanonicalWearableMetricId>;

// ─────────────────────────────────────────────────────────
// XML → canonical daily rows
// ─────────────────────────────────────────────────────────

// Apple Health XML is one giant `<HealthData>` root with `<Record>` children.
// Two entry points:
//   parseAppleHealthXml(string)  — in-memory parse; kept for tests + small files
//   parseAppleHealthBlob(blob)   — streaming parse; required for multi-GB exports
//                                  that exceed V8's ~512 MB max-string-length
// Both feed the same per-record bucket → daily-row aggregator.

function _buildTypeToCanonical() {
  // Build hkType → canonical map. Skip entries with a `window` discriminator
  // (e.g. hrv_day uses the same hkType as hrv_sdnn but is derived later via
  // the day-window aggregator) — otherwise the second declaration would
  // overwrite the first and leave the overnight bucket empty.
  // Exception: hr_day's HKQuantityTypeIdentifierHeartRate hkType is unique
  // (no overlap with rhr's RestingHeartRate), so it routes directly into a
  // bucket from which the day-window aggregator will read.
  const adapter = adapterById('apple_health');
  const typeToCanonical: AppleHealthTypeMap = {};
  for (const [canonId, m] of Object.entries(adapter?.metrics || {})) {
    if (!m?.hkType) continue;
    if (m.window && typeToCanonical[m.hkType]) continue;
    typeToCanonical[m.hkType] = canonId as CanonicalWearableMetricId;
  }
  return typeToCanonical;
}

// Match both self-closing <Record …/> and open <Record …>.
const _RECORD_RE = /<Record\b([^>]*?)\/?>/g;
const _ATTR_RE = /(\w+)="([^"]*)"/g;

function _processRecordAttrs(attrsRaw: string, typeToCanonical: AppleHealthTypeMap, byDayByMetric: AppleHealthDays) {
  // Fast path: skip records we don't care about before parsing attributes.
  if (!/type="HK/.test(attrsRaw)) return;

  const attrs: Record<string, string> = {};
  let a;
  _ATTR_RE.lastIndex = 0;
  while ((a = _ATTR_RE.exec(attrsRaw)) !== null) attrs[a[1]!] = a[2]!;

  const metricId = typeToCanonical[attrs.type!];
  if (!metricId) return;

  const startDate = attrs.startDate || attrs.creationDate;
  if (!startDate) return;
  const day = startDate.slice(0, 10); // Apple's format: "2026-04-20 08:30:00 +0200"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;

  const valueNum = Number(attrs.value);
  if (!isFinite(valueNum)) return;

  const normalised = normaliseUnit(metricId, valueNum, attrs.unit);
  if (normalised == null) return;

  // Pull the local hour out of "YYYY-MM-DD HH:mm:ss ±zzzz" — used downstream
  // to split rhr/hrv_sdnn samples into night (22:00–06:00) vs day windows.
  const hourMatch = startDate.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}):/);
  const hour = hourMatch ? Number(hourMatch[1]) : null;

  if (!byDayByMetric.has(day)) byDayByMetric.set(day, {});
  const bucket = byDayByMetric.get(day)!;
  if (!bucket[metricId]) bucket[metricId] = [];
  bucket[metricId]!.push({ v: normalised, h: hour, src: attrs.sourceName || '' });
}

// Streaming parser — reads `blob` via TextDecoderStream, splits on '\n', and
// processes each `<Record …>` line as it arrives. Apple's export writes each
// Record on its own line, so line-buffering is both safe and O(n). Memory
// stays flat (one chunk + one line at a time) regardless of file size.
export async function parseAppleHealthBlob(blob: Blob, onProgress?: AppleHealthProgressCallback | null) {
  const typeToCanonical = _buildTypeToCanonical();
  const byDayByMetric: AppleHealthDays = new Map();
  const reader = blob.stream()
    .pipeThrough(new TextDecoderStream('utf-8'))
    .getReader();
  let buffer = '';
  let bytesRead = 0;
  const totalSize = blob.size || 0;

  const flushLine = (line: string) => {
    if (line.indexOf('<Record') === -1) return;
    _RECORD_RE.lastIndex = 0;
    const m = _RECORD_RE.exec(line);
    if (m) _processRecordAttrs(m[1]!, typeToCanonical, byDayByMetric);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    bytesRead += value.length;
    let nlIdx;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      flushLine(buffer.slice(0, nlIdx));
      buffer = buffer.slice(nlIdx + 1);
    }
    if (totalSize && onProgress) {
      // Parse phase claims 40-80% of the progress bar.
      onProgress({ stage: 'parsing', pct: Math.round((bytesRead / totalSize) * 40 + 40) });
    }
  }
  if (buffer.length) flushLine(buffer);

  return _aggregateByDayByMetric(byDayByMetric);
}

// In-memory parser — kept for tests + small files. Same record-processor.
export function parseAppleHealthXml(xmlText: string) {
  const typeToCanonical = _buildTypeToCanonical();
  const byDayByMetric: AppleHealthDays = new Map();
  _RECORD_RE.lastIndex = 0;
  let m;
  while ((m = _RECORD_RE.exec(xmlText)) !== null) {
    _processRecordAttrs(m[1]!, typeToCanonical, byDayByMetric);
  }
  return _aggregateByDayByMetric(byDayByMetric);
}

function _aggregateByDayByMetric(byDayByMetric: AppleHealthDays) {
  // Aggregate per day → canonical L1 row.
  //   hrv_sdnn   mean of night-window (22:00–06:00 local) samples — deep
  //              sleep on the wrist; the gold-standard recovery signal.
  //   hrv_day    mean of day-window (06:00–22:00) samples — stress reactivity
  //              snapshot, distinct from overnight recovery. If we can't
  //              classify any samples by hour, the all-day mean falls into
  //              hrv_sdnn (legacy behaviour) so old fixtures keep working.
  //   rhr        min across ALL samples — Apple writes RestingHR as a
  //              sleep-derived value timestamped at morning wake, so a
  //              naïve hour-of-day split would mis-classify it. Min is
  //              still the cleanest aggregator (protects against 3rd-party
  //              app spikes).
  //   hr_day     null — would require parsing HKQuantityTypeIdentifierHeartRate
  //              (the raw intraday stream), which we don't ingest yet.
  //   steps      sum by sourceName, then pick the max source total
  //   spo2_avg   mean
  //   body_temp  mean
  const isNight = (h: number | null) => (typeof h === 'number') && (h < 6 || h >= 22);
  const isDay   = (h: number | null) => (typeof h === 'number') && (h >= 6 && h < 22);
  const mean = (arr: readonly number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const roundedMean = (values: readonly number[]) => {
    const average = mean(values);
    if (average == null) throw new Error('Cannot average an empty Apple Health sample set');
    return Math.round(average * 100) / 100;
  };
  const sumByMaxSource = (samples: readonly AppleHealthSample[] | undefined) => {
    if (!Array.isArray(samples) || samples.length === 0) return null;
    const totals = new Map<string, number>();
    for (const sample of samples) {
      const source = sample.src || '';
      totals.set(source, (totals.get(source) || 0) + sample.v);
    }
    let best: number | null = null;
    for (const total of totals.values()) {
      if (best == null || total > best) best = total;
    }
    return best;
  };

  const rows: AppleHealthDailyRow[] = [];
  for (const [day, bucket] of byDayByMetric) {
    const row: AppleHealthDailyRow = {
      source: 'apple_health', date: day,
      hrv_rmssd: null, hrv_sdnn: null, rhr: null,
      hrv_day: null, hr_day: null,
      sleep_score: null, readiness_score: null,
      activity_score: null, steps: null,
      strain: null,
      stress_high_min: null, resilience_level: null, cardio_age: null,
      weight: null, bp_systolic: null, bp_diastolic: null,
      body_fat_pct: null, lean_mass_kg: null, fat_mass_kg: null,
      spo2_avg: null, body_temp_delta: null, glucose_avg: null,
      vo2max: null,
    };

    // HRV SDNN — hour-window split. Day samples → hrv_day, night samples →
    // hrv_sdnn. If no samples carry hour metadata, fall back to all-day mean
    // into hrv_sdnn so legacy fixtures (no time-of-day) still aggregate.
    if (Array.isArray(bucket.hrv_sdnn) && bucket.hrv_sdnn.length) {
      const samples = bucket.hrv_sdnn;
      const night = samples.filter(s => isNight(s.h)).map(s => s.v);
      const dayW  = samples.filter(s => isDay(s.h)).map(s => s.v);
      const all   = samples.map(s => s.v);
      const nightMean = mean(night);
      const dayMean   = mean(dayW);
      if (night.length === 0 && dayW.length === 0) {
        // No hour info — keep legacy "mean of all samples → hrv_sdnn" behaviour.
        row.hrv_sdnn = roundedMean(all);
      } else {
        row.hrv_sdnn = nightMean != null ? Math.round(nightMean * 100) / 100 : null;
        row.hrv_day  = dayMean   != null ? Math.round(dayMean   * 100) / 100 : null;
      }
    }

    // RHR — Apple writes one sleep-derived value per day, timestamped at wake.
    // Min across all samples protects against third-party-app outliers.
    if (Array.isArray(bucket.rhr) && bucket.rhr.length) {
      const all = bucket.rhr.map(s => s.v);
      row.rhr = Math.round(Math.min(...all) * 100) / 100;
    }

    // hr_day — raw HeartRate samples filtered to the day window (06:00–22:00
    // local). Apple Watch records HR every few minutes; mean across the
    // awake window approximates a daytime average. Samples without an hour
    // (legacy fixtures) are ignored so we never silently mix night + day
    // values into the day slot.
    if (Array.isArray(bucket.hr_day) && bucket.hr_day.length) {
      const dayW = bucket.hr_day.filter(s => isDay(s.h)).map(s => s.v);
      if (dayW.length > 0) {
        row.hr_day = roundedMean(dayW);
      }
    }

    const stepsBest = sumByMaxSource(bucket.steps);
    if (stepsBest != null) {
      row.steps = Math.round(stepsBest * 100) / 100;
    }
    // These metrics share the same rounded mean. VO2max may have several
    // outdoor exercise samples on one day; averaging retains that behavior.
    for (const metricId of [
      'spo2_avg', 'body_temp_delta', 'vo2max', 'weight',
      'body_fat_pct', 'lean_mass_kg', 'bp_systolic', 'bp_diastolic',
    ] as const) {
      if (Array.isArray(bucket[metricId]) && bucket[metricId].length) {
        row[metricId] = roundedMean(bucket[metricId].map(s => s.v));
      }
    }
    if (row.weight != null && row.body_fat_pct != null) {
      row.fat_mass_kg = Math.round(row.weight * row.body_fat_pct) / 100;
    }

    rows.push(row);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

// Normalise Apple's unit strings to the canonical unit in wearable-adapters.js.
// Returns null if the unit is incompatible and should be dropped (rather than
// silently persisting a wrong-unit value).
function normaliseUnit(metricId: CanonicalWearableMetricId, value: number, unit: string | undefined) {
  const canonUnit = CANONICAL_METRICS[metricId]?.unit || '';
  switch (metricId) {
    case 'hrv_sdnn':
      // Apple ships SDNN in ms already.
      return (!unit || unit === 'ms') ? value : null;
    case 'rhr':
    case 'hr_day':
      // Apple: "count/min". Canonical: "bpm". Same number, different string.
      return (!unit || unit === 'count/min' || unit === 'bpm') ? value : null;
    case 'steps':
      return (!unit || unit === 'count') ? value : null;
    case 'spo2_avg':
      // Apple: "%" (0–100) OR fraction (0–1). Normalise to percentage.
      if (unit === '%') return value;
      if (!unit || unit === '' || unit === '1') return value <= 1 ? value * 100 : value;
      return null;
    case 'body_temp_delta':
      // Apple exports absolute temp in degC or degF — until the user sets a
      // baseline we can't compute a delta. Drop for v1 rather than ship a
      // misleading number. Canonical is degC; if we wanted to populate this
      // the math is: value_celsius - profile_baseline_celsius.
      return null;
    case 'vo2max':
      // Apple ships VO₂max in "mL/min·kg" (their formatting). Canonical is
      // mL/kg/min — same physiological quantity, just transposed factors.
      return (!unit || unit === 'mL/min·kg' || unit === 'mL/kg/min') ? value : null;
    case 'weight':
    case 'lean_mass_kg':
      if (!unit || unit === 'kg') return value;
      if (unit === 'lb') return value / 2.20462;
      if (unit === 'st') return value * 6.35029;
      return null;
    case 'body_fat_pct':
      if (!unit || unit === '%' || unit === '1') return value <= 1 ? value * 100 : value;
      return null;
    case 'bp_systolic':
    case 'bp_diastolic':
      return (!unit || unit === 'mmHg') ? value : null;
    default:
      // If canonical declares a unit string and Apple disagrees, refuse.
      return (!unit || unit === canonUnit) ? value : null;
  }
}
