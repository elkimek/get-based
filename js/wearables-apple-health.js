// @ts-check
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

import { getErrorMessage } from './caught-error.js';
import { parseAppleHealthBlob } from './wearables-apple-health-parser.js';
export { parseAppleHealthBlob, parseAppleHealthXml } from './wearables-apple-health-parser.js';
import { upsertDailyBatch, setMeta } from './wearables-store.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';
import { saveImportedData } from './data.js';
import { state } from './state.js';
import { isDebugMode } from './utils.js';
import {
  getAppleHealthJSZip,
  parseAppleHealthCycleRuntime,
  showAppleHealthCyclePreviewRuntime,
} from './wearables-apple-health-runtime.js';

// ─────────────────────────────────────────────────────────
// File ingestion entry point
// ─────────────────────────────────────────────────────────

// Accepts a File (either .zip from Apple export or raw export.xml). Streams
// the file through TextDecoderStream so multi-GB exports don't hit V8's
// ~512 MB max-string-length limit on file.text(). For zips: JSZip decompresses
// to a Blob (bytes only, no JS string allocation) and we stream-decode that.
export async function importAppleHealthFile(file, onProgress, options = {}) {
  if (!file) throw new Error('No file provided');
  onProgress?.({ stage: 'reading', pct: 0 });

  const name = (file.name || '').toLowerCase();
  let xmlBlob = options.xmlBlob || null;
  if (!xmlBlob) {
    if (name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      xmlBlob = await extractExportXmlBlob(file, onProgress);
    } else if (name.endsWith('.xml') || file.type === 'application/xml' || file.type === 'text/xml') {
      xmlBlob = file;
    } else {
      throw new Error(`Unrecognised file type (got "${name}") — expected Apple Health export.zip or export.xml`);
    }
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
  if (!await saveImportedData()) throw new Error('Apple Health connection could not be saved.');

  // Build the connected-sources map the same way wearables-connect.js does.
  const { listConnectedSources } = await import('./wearables-connect.js');
  await syncWearableSummary(profileId, listConnectedSources());

  let cycleImport = null;
  let cycleError = null;
  try {
    onProgress?.({ stage: 'checking-cycle', pct: 96, rows: rows.length, startDate, endDate });
    const cycleParsed = await parseAppleHealthCycleRuntime(xmlBlob, file.name || 'apple-health-export.xml', () => {
      onProgress?.({ stage: 'parsing-cycle', pct: 96, rows: rows.length, startDate, endDate });
    });
    if (cycleParsed?.observations?.length) {
      onProgress?.({ stage: 'reviewing-cycle', pct: 98, rows: rows.length, startDate, endDate });
      await options.beforeCycleReview?.();
      cycleImport = await showAppleHealthCyclePreviewRuntime(cycleParsed);
    }
  } catch (err) {
    cycleError = getErrorMessage(err, String(err));
    if (isDebugMode?.()) console.warn('[apple-health] cycle import skipped:', err);
  }

  onProgress?.({ stage: 'done', pct: 100, rows: rows.length, startDate, endDate });
  return { rows: rows.length, startDate, endDate, cycleImport, cycleError };
}

// ─────────────────────────────────────────────────────────
// ZIP extraction
// ─────────────────────────────────────────────────────────

let _jszipLoad = null;
function loadJSZip() {
  const cachedJSZip = getAppleHealthJSZip();
  if (cachedJSZip) return Promise.resolve(cachedJSZip);
  if (_jszipLoad) return _jszipLoad;
  _jszipLoad = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/jszip.min.js';
    s.onload = () => {
      const loadedJSZip = getAppleHealthJSZip();
      loadedJSZip ? resolve(loadedJSZip) : reject(new Error('JSZip failed to load'));
    };
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
