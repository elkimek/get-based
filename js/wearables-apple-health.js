// wearables-apple-health.js — Apple Health XML import pipeline
//
// Apple's export format: a .zip containing `apple_health_export/export.xml`
// plus route/workout files. export.xml is a flat list of `<Record>` elements,
// each representing a single measurement with `type`, `unit`, `value`,
// `startDate`, `endDate`, and `sourceName`. Real exports run 50 MB – 500 MB
// easily; keep parsing incremental-friendly.
//
// Pipeline:
//   File → zip? unzip → XML text → parse → filter → aggregate per day →
//   canonical L1 rows → upsertDailyBatch → syncWearableSummary → strip
//
// Vendor-specific anything stays in this file. The adapter registry entry
// in wearable-adapters.js only declares the type→canonical map; the parser
// resolves it.

import { CANONICAL_METRICS, adapterById } from './wearable-adapters.js';
import { upsertDailyBatch, setMeta } from './wearables-store.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';
import { isDebugMode } from './utils.js';

// ─────────────────────────────────────────────────────────
// File ingestion entry point
// ─────────────────────────────────────────────────────────

// Accepts a File (either .zip from Apple export or raw export.xml). Streams
// the file through TextDecoderStream so multi-GB exports don't hit V8's
// ~512 MB max-string-length limit on file.text(). For zips: JSZip decompresses
// to a Blob (bytes only, no JS string allocation) and we stream-decode that.
export async function importAppleHealthFile(file, onProgress) {
  if (!file) throw new Error('No file provided');
  onProgress?.({ stage: 'reading', pct: 0 });

  const name = (file.name || '').toLowerCase();
  let xmlBlob;
  if (name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    xmlBlob = await extractExportXmlBlob(file, onProgress);
  } else if (name.endsWith('.xml') || file.type === 'application/xml' || file.type === 'text/xml') {
    xmlBlob = file;
  } else {
    throw new Error(`Unrecognised file type (got "${name}") — expected Apple Health export.zip or export.xml`);
  }
  if (!xmlBlob || xmlBlob.size === 0) throw new Error('Empty XML payload');

  onProgress?.({ stage: 'parsing', pct: 40 });
  const rows = await parseAppleHealthBlob(xmlBlob, onProgress);
  if (isDebugMode?.()) console.log(`[apple-health] parsed ${rows.length} canonical day rows`);

  onProgress?.({ stage: 'writing', pct: 80 });
  const profileId = getActiveProfileId();
  if (rows.length > 0) await upsertDailyBatch(profileId, rows);
  const startDate = rows[0]?.date || null;
  const endDate = rows[rows.length - 1]?.date || null;
  await setMeta(profileId, `last-sync:apple_health`, { at: Date.now(), rows: rows.length, startDate, endDate });

  onProgress?.({ stage: 'summarising', pct: 95 });
  // Fake a connection record so listConnectedSources picks up apple_health —
  // file-import adapters have no token / expiry, just a connectedAt stamp.
  const { state } = await import('./state.js');
  const { saveImportedData } = await import('./data.js');
  if (!state.importedData.wearableConnections) state.importedData.wearableConnections = {};
  state.importedData.wearableConnections.apple_health = {
    source: 'file-import',
    fileName: file.name,
    importedAt: new Date().toISOString(),
    connectedAt: state.importedData.wearableConnections.apple_health?.connectedAt || new Date().toISOString(),
    lastSyncAt: Date.now(),
    coverageDays: rows.length,
    needsReauth: false,
  };
  saveImportedData();

  // Build the connected-sources map the same way wearables-connect.js does.
  const { listConnectedSources } = await import('./wearables-connect.js');
  await syncWearableSummary(profileId, listConnectedSources());

  onProgress?.({ stage: 'done', pct: 100, rows: rows.length, startDate, endDate });
  return { rows: rows.length, startDate, endDate };
}

// ─────────────────────────────────────────────────────────
// ZIP extraction
// ─────────────────────────────────────────────────────────

let _jszipLoad = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (_jszipLoad) return _jszipLoad;
  _jszipLoad = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/jszip.min.js';
    s.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip failed to load'));
    s.onerror = () => reject(new Error('Failed to load /vendor/jszip.min.js'));
    document.head.appendChild(s);
  });
  return _jszipLoad;
}

async function extractExportXmlBlob(zipFile, onProgress) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(zipFile, {
    // Progress for large exports — Apple zips can be 500 MB+ compressed.
    onUpdate: m => onProgress?.({ stage: 'unzipping', pct: Math.round(m.percent * 0.4) }),
  });
  // Apple's path is canonical; we accept a few known variants just in case.
  const candidates = ['apple_health_export/export.xml', 'export.xml', 'apple_health_export/Export.xml'];
  let entry = null;
  for (const p of candidates) {
    if (zip.files[p]) { entry = zip.files[p]; break; }
  }
  if (!entry) {
    const names = Object.keys(zip.files).filter(n => n.toLowerCase().endsWith('.xml')).slice(0, 5);
    throw new Error(`export.xml not found in ZIP. Found XMLs: ${names.join(', ') || '(none)'}`);
  }
  // Return decompressed bytes as a Blob (not a string). A 2 GB XML hits V8's
  // ~512 MB max-string-length limit if requested as 'text'; bytes don't.
  return entry.async('blob');
}

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
  const typeToCanonical = {};
  for (const [canonId, m] of Object.entries(adapter?.metrics || {})) {
    if (!m?.hkType) continue;
    if (m.window && typeToCanonical[m.hkType]) continue;
    typeToCanonical[m.hkType] = canonId;
  }
  return typeToCanonical;
}

// Match both self-closing <Record …/> and open <Record …>.
const _RECORD_RE = /<Record\b([^>]*?)\/?>/g;
const _ATTR_RE = /(\w+)="([^"]*)"/g;

function _processRecordAttrs(attrsRaw, typeToCanonical, byDayByMetric) {
  // Fast path: skip records we don't care about before parsing attributes.
  if (!/type="HK/.test(attrsRaw)) return;

  const attrs = {};
  let a;
  _ATTR_RE.lastIndex = 0;
  while ((a = _ATTR_RE.exec(attrsRaw)) !== null) attrs[a[1]] = a[2];

  const metricId = typeToCanonical[attrs.type];
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
  const bucket = byDayByMetric.get(day);
  if (!bucket[metricId]) bucket[metricId] = [];
  bucket[metricId].push({ v: normalised, h: hour });
}

// Streaming parser — reads `blob` via TextDecoderStream, splits on '\n', and
// processes each `<Record …>` line as it arrives. Apple's export writes each
// Record on its own line, so line-buffering is both safe and O(n). Memory
// stays flat (one chunk + one line at a time) regardless of file size.
export async function parseAppleHealthBlob(blob, onProgress) {
  const typeToCanonical = _buildTypeToCanonical();
  const byDayByMetric = new Map();
  const reader = blob.stream()
    .pipeThrough(new TextDecoderStream('utf-8'))
    .getReader();
  let buffer = '';
  let bytesRead = 0;
  const totalSize = blob.size || 0;

  const flushLine = (line) => {
    if (line.indexOf('<Record') === -1) return;
    _RECORD_RE.lastIndex = 0;
    const m = _RECORD_RE.exec(line);
    if (m) _processRecordAttrs(m[1], typeToCanonical, byDayByMetric);
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
export function parseAppleHealthXml(xmlText) {
  const typeToCanonical = _buildTypeToCanonical();
  const byDayByMetric = new Map();
  _RECORD_RE.lastIndex = 0;
  let m;
  while ((m = _RECORD_RE.exec(xmlText)) !== null) {
    _processRecordAttrs(m[1], typeToCanonical, byDayByMetric);
  }
  return _aggregateByDayByMetric(byDayByMetric);
}

function _aggregateByDayByMetric(byDayByMetric) {
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
  //   steps      sum
  //   spo2_avg   mean
  //   body_temp  mean
  const isNight = (h) => (typeof h === 'number') && (h < 6 || h >= 22);
  const isDay   = (h) => (typeof h === 'number') && (h >= 6 && h < 22);
  const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const sum  = (arr) => arr.reduce((a, b) => a + b, 0);

  const rows = [];
  for (const [day, bucket] of byDayByMetric) {
    const row = {
      source: 'apple_health', date: day,
      hrv_rmssd: null, hrv_sdnn: null, rhr: null,
      hrv_day: null, hr_day: null,
      sleep_score: null, readiness_score: null,
      activity_score: null, steps: null,
      strain: null,
      stress_high_min: null, resilience_level: null, cardio_age: null,
      weight: null, bp_systolic: null, bp_diastolic: null,
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
        row.hrv_sdnn = Math.round(mean(all) * 100) / 100;
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
        row.hr_day = Math.round(mean(dayW) * 100) / 100;
      }
    }

    if (Array.isArray(bucket.steps) && bucket.steps.length) {
      row.steps = Math.round(sum(bucket.steps.map(s => s.v)) * 100) / 100;
    }
    if (Array.isArray(bucket.spo2_avg) && bucket.spo2_avg.length) {
      row.spo2_avg = Math.round(mean(bucket.spo2_avg.map(s => s.v)) * 100) / 100;
    }
    if (Array.isArray(bucket.body_temp_delta) && bucket.body_temp_delta.length) {
      row.body_temp_delta = Math.round(mean(bucket.body_temp_delta.map(s => s.v)) * 100) / 100;
    }
    // VO2max — Apple Watch writes one measurement per outdoor walk/run, so
    // a given day may carry 0, 1, or multiple samples. Mean smooths out
    // back-to-back walks on the same day; the gaps between days are
    // expected and handled by the chart's span-gaps.
    if (Array.isArray(bucket.vo2max) && bucket.vo2max.length) {
      row.vo2max = Math.round(mean(bucket.vo2max.map(s => s.v)) * 100) / 100;
    }

    rows.push(row);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

// Normalise Apple's unit strings to the canonical unit in wearable-adapters.js.
// Returns null if the unit is incompatible and should be dropped (rather than
// silently persisting a wrong-unit value).
function normaliseUnit(metricId, value, unit) {
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
    default:
      // If canonical declares a unit string and Apple disagrees, refuse.
      return (!unit || unit === canonUnit) ? value : null;
  }
}

if (isDebugMode?.()) window._appleHealth = { importAppleHealthFile, parseAppleHealthXml };
