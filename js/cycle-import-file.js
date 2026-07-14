// @ts-check
// cycle-import-file.js - cycle export file detection and ZIP context helpers.

const appWindow = /** @type {Window & typeof globalThis & { JSZip?: any }} */ (
  typeof window !== 'undefined' ? window : {}
);

let jszipLoad = null;
function loadJSZip() {
  if (appWindow.JSZip) return Promise.resolve(appWindow.JSZip);
  if (jszipLoad) return jszipLoad;
  jszipLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/jszip.min.js';
    script.onload = () => appWindow.JSZip ? resolve(appWindow.JSZip) : reject(new Error('JSZip failed to load'));
    script.onerror = () => reject(new Error('Failed to load /vendor/jszip.min.js'));
    document.head.appendChild(script);
  }).catch(err => {
    jszipLoad = null;
    throw err;
  });
  return jszipLoad;
}

export function cycleFileKind(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.zip') || /zip/.test(file?.type || '')) return 'zip';
  if (name.endsWith('.xml') || /xml/.test(file?.type || '')) return 'xml';
  if (name.endsWith('.json') || name.endsWith('.cluedata') || file?.type === 'application/json') return 'json';
  if (name.endsWith('.csv') || file?.type === 'text/csv') return 'csv';
  return 'text';
}

export async function buildCycleFileContext(file) {
  const kind = cycleFileKind(file);
  const context = { file, kind, text: null, archive: null, entries: [] };
  if (kind === 'zip') {
    const JSZip = await loadJSZip();
    try {
      context.archive = await JSZip.loadAsync(file);
    } catch (err) {
      if (/encrypt|password/i.test(String(err?.message || err))) {
        throw new Error('This cycle ZIP is password-protected. Extract it first, then import the Clue JSON file inside.');
      }
      throw err;
    }
    context.entries = Object.values(context.archive.files || {}).filter(entry => !entry.dir);
  } else if (kind !== 'xml') {
    context.text = await file.text();
  }
  return context;
}

export function appleHealthArchiveEntry(context) {
  return context.entries.find(entry => {
    const name = String(entry.name || '').toLowerCase();
    return name === 'export.xml' || name === 'apple_health_export/export.xml';
  }) || null;
}

export function clueArchiveEntries(context) {
  return context.entries.filter(entry => /(?:\.json|\.cluedata)$/i.test(entry.name || '') || /clue/i.test(entry.name || ''));
}

export function naturalCyclesArchiveEntries(context) {
  return context.entries.filter(entry => /\.csv$/i.test(entry.name || ''));
}
