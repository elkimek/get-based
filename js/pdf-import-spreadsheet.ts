// pdf-import-spreadsheet.js - text/spreadsheet import helpers for lab import.

interface SpreadsheetZipStream {
  on(event: 'data', cb: (chunk: Uint8Array) => void): SpreadsheetZipStream;
  on(event: 'end', cb: () => void): SpreadsheetZipStream;
  on(event: 'error', cb: (err: unknown) => void): SpreadsheetZipStream;
  pause?(): void;
  resume(): void;
}
interface SpreadsheetZipEntry {
  async(type: 'text'): Promise<string>;
  internalStream?(type: 'uint8array'): SpreadsheetZipStream;
}
interface SpreadsheetZipArchive { file(path: string): SpreadsheetZipEntry | null; files?: Record<string, unknown> }
interface SpreadsheetZipReader { loadAsync(data: ArrayBuffer): Promise<SpreadsheetZipArchive> }
const spreadsheetWindow = window as unknown as { JSZip?: SpreadsheetZipReader };

const MAX_XLSX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_XLSX_ZIP_ENTRIES = 500;
const MAX_XLSX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_XLSX_TOTAL_EXPANDED_BYTES = 32 * 1024 * 1024;
const MAX_XLSX_SHEETS = 50;
const MAX_XLSX_COLUMN_INDEX = 16_383;
const MAX_XLSX_ROWS_PER_SHEET = 25_000;
const MAX_XLSX_OUTPUT_CHARS = 2_000_000;

export function isCsvTextFile(file: Pick<File, 'name' | 'type'>) {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

export function isXlsxFile(file: Pick<File, 'name' | 'type'>) {
  return /\.xlsx$/i.test(file.name)
    || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export function isTextImportFile(file: Pick<File, 'name' | 'type'>) {
  return isCsvTextFile(file) || isXlsxFile(file) || /\.txt$/i.test(file.name) || file.type?.startsWith('text/');
}

let _jszipLoad: Promise<SpreadsheetZipReader> | null = null;
function loadJSZip() {
  if (spreadsheetWindow.JSZip) return Promise.resolve(spreadsheetWindow.JSZip);
  if (_jszipLoad) return _jszipLoad;
  _jszipLoad = new Promise<SpreadsheetZipReader>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/jszip.min.js';
    script.onload = () => spreadsheetWindow.JSZip ? resolve(spreadsheetWindow.JSZip) : reject(new Error('JSZip failed to load'));
    script.onerror = () => reject(new Error('Failed to load /vendor/jszip.min.js'));
    document.head.appendChild(script);
  }).catch(err => {
    _jszipLoad = null;
    return Promise.reject(err);
  });
  return _jszipLoad;
}

function getXmlElements(root: Document | Element, localName: string) {
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === localName);
}

function parseXmlDocument(xml: string, label: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (getXmlElements(doc, 'parsererror').length > 0) throw new Error(`Could not parse ${label}`);
  return doc;
}

async function readZipText(
  zip: SpreadsheetZipArchive,
  path: string,
  budget: { remaining: number } = { remaining: MAX_XLSX_TOTAL_EXPANDED_BYTES },
): Promise<string | null> {
  const entry = zip.file(path) || zip.file(path.replace(/^\/+/, ''));
  if (!entry) return null;
  const maxBytes = Math.min(MAX_XLSX_ENTRY_BYTES, budget.remaining);
  if (maxBytes <= 0) throw new Error('Excel workbook exceeds maximum uncompressed size');
  if (typeof entry.internalStream === 'function') {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let total = 0;
      let settled = false;
      const stream = entry.internalStream!('uint8array');
      stream
        .on('data', chunk => {
          if (settled) return;
          total += chunk.byteLength;
          if (total > maxBytes) {
            settled = true;
            try { stream.pause?.(); } catch {}
            reject(new Error('Excel workbook exceeds maximum uncompressed size'));
            return;
          }
          chunks.push(chunk);
        })
        .on('end', () => {
          if (settled) return;
          settled = true;
          const out = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
          resolve(out);
        })
        .on('error', err => {
          if (settled) return;
          settled = true;
          reject(err);
        })
        .resume();
    });
    budget.remaining -= bytes.byteLength;
    return new TextDecoder('utf-8').decode(bytes);
  }
  const text = await entry.async('text');
  const size = new TextEncoder().encode(text).byteLength;
  if (size > maxBytes) throw new Error('Excel workbook exceeds maximum uncompressed size');
  budget.remaining -= size;
  return text;
}

function normalizeSpreadsheetCellText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getRelationshipId(element: Element) {
  return element.getAttribute('r:id')
    || element.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
}

function resolveZipPath(baseDir: string, target: unknown) {
  const raw = String(target || '').replace(/^\/+/, '');
  const parts = (String(target || '').startsWith('/') ? raw : `${baseDir}/${raw}`).split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

const BUILT_IN_EXCEL_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
  71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
]);

function isDateFormatCode(formatCode: unknown) {
  const firstSection = String(formatCode || '').split(';')[0]!;
  const cleaned = firstSection
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .replace(/_.?/g, '')
    .replace(/\*.?/g, '')
    .toLowerCase();
  const tokens = cleaned.match(/[a-z]+/g) || [];
  const hasYear = tokens.some(token => /^y{2,4}$/.test(token));
  const hasDay = tokens.some(token => /^d{1,4}$/.test(token));
  const hasMonth = tokens.some(token => /^m{1,5}$/.test(token));
  const hasTime = /(^|[^a-z])h{1,2}:?m{1,2}([^a-z]|$)/.test(cleaned);
  return hasTime || (hasYear && (hasDay || hasMonth)) || (hasDay && hasMonth);
}

function getDateStyleIndexes(stylesXml: string | null) {
  if (!stylesXml) return new Set<number>();
  const doc = parseXmlDocument(stylesXml, 'Excel styles');
  const customFormats = new Map<number, string>();
  for (const numFmt of getXmlElements(doc, 'numFmt')) {
    const id = Number(numFmt.getAttribute('numFmtId'));
    const code = numFmt.getAttribute('formatCode') || '';
    if (Number.isFinite(id)) customFormats.set(id, code);
  }

  const cellXfs = getXmlElements(doc, 'cellXfs')[0];
  const xfs = cellXfs ? Array.from(cellXfs.children).filter(el => el.localName === 'xf') : [];
  const dateStyleIndexes = new Set<number>();
  xfs.forEach((xf, index) => {
    const numFmtId = Number(xf.getAttribute('numFmtId'));
    if (BUILT_IN_EXCEL_DATE_FORMAT_IDS.has(numFmtId) || isDateFormatCode(customFormats.get(numFmtId))) {
      dateStyleIndexes.add(index);
    }
  });
  return dateStyleIndexes;
}

function excelSerialDateToISO(value: unknown, date1904 = false) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return String(value || '');
  const dayMs = 24 * 60 * 60 * 1000;
  const epochMs = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epochMs + Math.round(serial * dayMs)).toISOString().slice(0, 10);
}

function getCellColumnIndex(cell: Element, fallbackIndex: number) {
  const ref = cell.getAttribute('r') || '';
  const letters = ref.match(/^[A-Z]+/i)?.[0];
  if (!letters) return Math.min(fallbackIndex, MAX_XLSX_COLUMN_INDEX);
  if (letters.length > 4) return -1;
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
  const col = index - 1;
  return col >= 0 && col <= MAX_XLSX_COLUMN_INDEX ? col : -1;
}

function getFirstChildText(element: Element, localName: string) {
  return getXmlElements(element, localName)[0]?.textContent || '';
}

function getXlsxCellValue(cell: Element, sharedStrings: string[], dateStyleIndexes: Set<number>, date1904: boolean) {
  const type = cell.getAttribute('t');
  const rawValue = getFirstChildText(cell, 'v');
  if (type === 's') return sharedStrings[Number(rawValue)] || '';
  if (type === 'inlineStr') return normalizeSpreadsheetCellText(getFirstChildText(cell, 'is'));
  if (type === 'b') return rawValue === '1' ? 'TRUE' : rawValue === '0' ? 'FALSE' : rawValue;

  const styleIndex = Number(cell.getAttribute('s'));
  if (dateStyleIndexes.has(styleIndex) && rawValue) return excelSerialDateToISO(rawValue, date1904);
  return normalizeSpreadsheetCellText(rawValue);
}

function extractWorksheetRows(worksheetXml: string, sharedStrings: string[], dateStyleIndexes: Set<number>, date1904: boolean) {
  const doc = parseXmlDocument(worksheetXml, 'Excel worksheet');
  const rows: string[][] = [];
  for (const row of getXmlElements(doc, 'row')) {
    const cellMap = new Map<number, string>();
    let maxCol = -1;
    let fallbackColumn = 0;
    const cells = Array.from(row.children).filter(el => el.localName === 'c');
    for (const cell of cells) {
      const columnIndex = getCellColumnIndex(cell, fallbackColumn);
      if (columnIndex < 0) continue;
      fallbackColumn = columnIndex + 1;
      const text = normalizeSpreadsheetCellText(getXlsxCellValue(cell, sharedStrings, dateStyleIndexes, date1904));
      if (text) {
        cellMap.set(columnIndex, text);
        if (columnIndex > maxCol) maxCol = columnIndex;
      }
    }
    if (maxCol >= 0) {
      if (rows.length >= MAX_XLSX_ROWS_PER_SHEET) {
        throw new Error(`Excel worksheet exceeds the ${MAX_XLSX_ROWS_PER_SHEET.toLocaleString('en-US')} row import limit`);
      }
      const normalized = new Array<string>(maxCol + 1).fill('');
      for (const [col, val] of cellMap) normalized[col] = val;
      rows.push(normalized);
    }
  }
  return rows;
}

async function getWorkbookSheets(zip: SpreadsheetZipArchive, workbookDoc: Document, budget: { remaining: number }) {
  const relsXml = await readZipText(zip, 'xl/_rels/workbook.xml.rels', budget);
  const relationshipTargets = new Map<string | null, string | null>();
  if (relsXml) {
    const relsDoc = parseXmlDocument(relsXml, 'Excel workbook relationships');
    for (const rel of getXmlElements(relsDoc, 'Relationship')) {
      relationshipTargets.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
  }

  const seenPaths = new Set<string>();
  const sheets = getXmlElements(workbookDoc, 'sheet').map((sheet, index) => {
    const relId = getRelationshipId(sheet);
    const target = relId ? relationshipTargets.get(relId) : null;
    return {
      name: sheet.getAttribute('name') || `Sheet ${index + 1}`,
      path: target ? resolveZipPath('xl', target) : `xl/worksheets/sheet${index + 1}.xml`,
    };
  }).filter(sheet => {
    if (!sheet.path || seenPaths.has(sheet.path)) return false;
    seenPaths.add(sheet.path);
    return true;
  });
  if (sheets.length > MAX_XLSX_SHEETS) {
    throw new Error(`Excel workbook exceeds the ${MAX_XLSX_SHEETS} sheet import limit`);
  }

  if (sheets.length > 0) return sheets;
  const fallbackSheets = Object.keys(zip.files || {})
    .filter(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (fallbackSheets.length > MAX_XLSX_SHEETS) {
    throw new Error(`Excel workbook exceeds the ${MAX_XLSX_SHEETS} sheet import limit`);
  }
  return fallbackSheets.map((path, index) => ({ name: `Sheet ${index + 1}`, path }));
}

export async function extractXLSXText(file: Pick<File, 'name' | 'arrayBuffer'> & { size?: number }) {
  if (typeof file.size === 'number' && file.size > MAX_XLSX_FILE_BYTES) {
    throw new Error('Excel workbook exceeds the 25 MB import limit');
  }
  const JSZip = await loadJSZip();
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_XLSX_FILE_BYTES) {
    throw new Error('Excel workbook exceeds the 25 MB import limit');
  }
  const zip = await JSZip.loadAsync(buffer);
  if (Object.keys(zip.files || {}).length > MAX_XLSX_ZIP_ENTRIES) {
    throw new Error('Excel workbook contains too many archive entries');
  }
  const budget = { remaining: MAX_XLSX_TOTAL_EXPANDED_BYTES };
  const workbookXml = await readZipText(zip, 'xl/workbook.xml', budget);
  if (!workbookXml) throw new Error('Workbook metadata is missing');

  const workbookDoc = parseXmlDocument(workbookXml, 'Excel workbook');
  const workbookPr = getXmlElements(workbookDoc, 'workbookPr')[0];
  const date1904 = ['1', 'true'].includes(String(workbookPr?.getAttribute('date1904') || '').toLowerCase());
  const sharedStringsXml = await readZipText(zip, 'xl/sharedStrings.xml', budget);
  const sharedStrings = sharedStringsXml
    ? getXmlElements(parseXmlDocument(sharedStringsXml, 'Excel shared strings'), 'si')
      .map(si => normalizeSpreadsheetCellText(si.textContent || ''))
    : [];
  const dateStyleIndexes = getDateStyleIndexes(await readZipText(zip, 'xl/styles.xml', budget));
  const sheets = await getWorkbookSheets(zip, workbookDoc, budget);
  const blocks: string[] = [];
  let totalChars = 0;

  for (const sheet of sheets) {
    const worksheetXml = await readZipText(zip, sheet.path, budget);
    if (!worksheetXml) continue;
    const rows = extractWorksheetRows(worksheetXml, sharedStrings, dateStyleIndexes, date1904);
    if (rows.length === 0) continue;
    const block = [
      `Sheet: ${sheet.name}`,
      ...rows.map(row => row.map(value => normalizeSpreadsheetCellText(value)).join('\t')),
    ].join('\n');
    totalChars += block.length;
    if (totalChars > MAX_XLSX_OUTPUT_CHARS) throw new Error('Excel workbook text exceeds the maximum import size');
    blocks.push(block);
  }

  if (blocks.length === 0) return '';
  return [`Workbook: ${file.name}`, ...blocks].join('\n\n');
}
