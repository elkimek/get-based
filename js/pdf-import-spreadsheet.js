// @ts-check
// pdf-import-spreadsheet.js - text/spreadsheet import helpers for lab import.

const spreadsheetWindow = /** @type {Window & typeof globalThis & { JSZip?: any }} */ (window);

export function isCsvTextFile(file) {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

export function isXlsxFile(file) {
  return /\.xlsx$/i.test(file.name)
    || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export function isTextImportFile(file) {
  return isCsvTextFile(file) || isXlsxFile(file) || /\.txt$/i.test(file.name) || file.type?.startsWith('text/');
}

let _jszipLoad = null;
function loadJSZip() {
  if (spreadsheetWindow.JSZip) return Promise.resolve(spreadsheetWindow.JSZip);
  if (_jszipLoad) return _jszipLoad;
  _jszipLoad = new Promise((resolve, reject) => {
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

function getXmlElements(root, localName) {
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === localName);
}

function parseXmlDocument(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (getXmlElements(doc, 'parsererror').length > 0) throw new Error(`Could not parse ${label}`);
  return doc;
}

async function readZipText(zip, path) {
  const entry = zip.file(path);
  return entry ? await entry.async('text') : null;
}

function normalizeSpreadsheetCellText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getRelationshipId(element) {
  return element.getAttribute('r:id')
    || element.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
}

function resolveZipPath(baseDir, target) {
  const raw = String(target || '').replace(/^\/+/, '');
  const parts = (String(target || '').startsWith('/') ? raw : `${baseDir}/${raw}`).split('/');
  const stack = [];
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

function isDateFormatCode(formatCode) {
  const firstSection = String(formatCode || '').split(';')[0];
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

function getDateStyleIndexes(stylesXml) {
  if (!stylesXml) return new Set();
  const doc = parseXmlDocument(stylesXml, 'Excel styles');
  const customFormats = new Map();
  for (const numFmt of getXmlElements(doc, 'numFmt')) {
    const id = Number(numFmt.getAttribute('numFmtId'));
    const code = numFmt.getAttribute('formatCode') || '';
    if (Number.isFinite(id)) customFormats.set(id, code);
  }

  const cellXfs = getXmlElements(doc, 'cellXfs')[0];
  const xfs = cellXfs ? Array.from(cellXfs.children).filter(el => el.localName === 'xf') : [];
  const dateStyleIndexes = new Set();
  xfs.forEach((xf, index) => {
    const numFmtId = Number(xf.getAttribute('numFmtId'));
    if (BUILT_IN_EXCEL_DATE_FORMAT_IDS.has(numFmtId) || isDateFormatCode(customFormats.get(numFmtId))) {
      dateStyleIndexes.add(index);
    }
  });
  return dateStyleIndexes;
}

function excelSerialDateToISO(value, date1904 = false) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return String(value || '');
  const dayMs = 24 * 60 * 60 * 1000;
  const epochMs = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epochMs + Math.round(serial * dayMs)).toISOString().slice(0, 10);
}

function getCellColumnIndex(cell, fallbackIndex) {
  const ref = cell.getAttribute('r') || '';
  const letters = ref.match(/^[A-Z]+/i)?.[0];
  if (!letters) return fallbackIndex;
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function getFirstChildText(element, localName) {
  return getXmlElements(element, localName)[0]?.textContent || '';
}

function getXlsxCellValue(cell, sharedStrings, dateStyleIndexes, date1904) {
  const type = cell.getAttribute('t');
  const rawValue = getFirstChildText(cell, 'v');
  if (type === 's') return sharedStrings[Number(rawValue)] || '';
  if (type === 'inlineStr') return normalizeSpreadsheetCellText(getFirstChildText(cell, 'is'));
  if (type === 'b') return rawValue === '1' ? 'TRUE' : rawValue === '0' ? 'FALSE' : rawValue;

  const styleIndex = Number(cell.getAttribute('s'));
  if (dateStyleIndexes.has(styleIndex) && rawValue) return excelSerialDateToISO(rawValue, date1904);
  return normalizeSpreadsheetCellText(rawValue);
}

function extractWorksheetRows(worksheetXml, sharedStrings, dateStyleIndexes, date1904) {
  const doc = parseXmlDocument(worksheetXml, 'Excel worksheet');
  const rows = [];
  for (const row of getXmlElements(doc, 'row')) {
    const values = [];
    let fallbackColumn = 0;
    const cells = Array.from(row.children).filter(el => el.localName === 'c');
    for (const cell of cells) {
      const columnIndex = getCellColumnIndex(cell, fallbackColumn);
      fallbackColumn = columnIndex + 1;
      values[columnIndex] = getXlsxCellValue(cell, sharedStrings, dateStyleIndexes, date1904);
    }
    const normalized = values.map(value => normalizeSpreadsheetCellText(value));
    if (normalized.some(Boolean)) rows.push(normalized);
  }
  return rows;
}

async function getWorkbookSheets(zip, workbookDoc) {
  const relsXml = await readZipText(zip, 'xl/_rels/workbook.xml.rels');
  const relationshipTargets = new Map();
  if (relsXml) {
    const relsDoc = parseXmlDocument(relsXml, 'Excel workbook relationships');
    for (const rel of getXmlElements(relsDoc, 'Relationship')) {
      relationshipTargets.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
  }

  const sheets = getXmlElements(workbookDoc, 'sheet').map((sheet, index) => {
    const relId = getRelationshipId(sheet);
    const target = relId ? relationshipTargets.get(relId) : null;
    return {
      name: sheet.getAttribute('name') || `Sheet ${index + 1}`,
      path: target ? resolveZipPath('xl', target) : `xl/worksheets/sheet${index + 1}.xml`,
    };
  });

  if (sheets.length > 0) return sheets;
  return Object.keys(zip.files || {})
    .filter(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((path, index) => ({ name: `Sheet ${index + 1}`, path }));
}

export async function extractXLSXText(file) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookXml = await readZipText(zip, 'xl/workbook.xml');
  if (!workbookXml) throw new Error('Workbook metadata is missing');

  const workbookDoc = parseXmlDocument(workbookXml, 'Excel workbook');
  const workbookPr = getXmlElements(workbookDoc, 'workbookPr')[0];
  const date1904 = ['1', 'true'].includes(String(workbookPr?.getAttribute('date1904') || '').toLowerCase());
  const sharedStringsXml = await readZipText(zip, 'xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml
    ? getXmlElements(parseXmlDocument(sharedStringsXml, 'Excel shared strings'), 'si')
      .map(si => normalizeSpreadsheetCellText(si.textContent || ''))
    : [];
  const dateStyleIndexes = getDateStyleIndexes(await readZipText(zip, 'xl/styles.xml'));
  const sheets = await getWorkbookSheets(zip, workbookDoc);
  const blocks = [];

  for (const sheet of sheets) {
    const worksheetXml = await readZipText(zip, sheet.path);
    if (!worksheetXml) continue;
    const rows = extractWorksheetRows(worksheetXml, sharedStrings, dateStyleIndexes, date1904);
    if (rows.length === 0) continue;
    blocks.push([
      `Sheet: ${sheet.name}`,
      ...rows.map(row => row.map(value => normalizeSpreadsheetCellText(value)).join('\t')),
    ].join('\n'));
  }

  if (blocks.length === 0) return '';
  return [`Workbook: ${file.name}`, ...blocks].join('\n\n');
}
