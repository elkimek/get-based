// @ts-check
// dna-parser.js - DNA file detection and parser helpers.

import { findGenotypeInfo, findGenotypeMatch, normalizeGenotype } from './dna-genotype.js';
import { detectDNAFile } from './dna-file-detection.js';

export { detectDNAFile, isDNAFile, isDNAFileByContent } from './dna-file-detection.js';

const WORKER_CODE = `
// DNA parser worker - receives { file, snpIds, format }
// Posts back { matches, source, totalLines, format }

self.onmessage = async function(e) {
  const { file, snpIds, format } = e.data;
  const text = await file.text();
  const lines = text.split(/\\r?\\n/);
  const lookupSet = new Set(snpIds);
  const matches = {};
  let totalData = 0;
  let detectedFormat = format;
  let illuminaInData = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;

    const upper = line.toUpperCase();
    if (upper.startsWith('RSID') || upper.startsWith('"RSID')) continue;

    let rsid, genotype;

    if (detectedFormat === 'illumina-gsgt') {
      const trimmed = line.trim();
      if (!illuminaInData) {
        if (/^\\[Data\\]/i.test(trimmed)) illuminaInData = true;
        continue;
      }
      if (/^Sample Name/i.test(trimmed)) continue;
      const parts = trimmed.split(',');
      if (parts.length < 6) continue;
      rsid = parts[1].trim();
      const m = rsid.match(/(rs\\d+)/);
      if (m) rsid = m[1];
      const a1 = parts[4].trim();
      const a2 = parts[5].trim();
      if (a1 === '-' || a2 === '-' || a1 === '0' || a2 === '0') { totalData++; continue; }
      genotype = a1 + a2;
    } else if (detectedFormat === 'ancestry') {
      const parts = line.split('\\t');
      if (parts.length < 5) continue;
      rsid = parts[0].trim();
      const a1 = parts[3].trim();
      const a2 = parts[4].trim();
      if (a1 === '0' || a2 === '0' || a1 === '-' || a2 === '-') { totalData++; continue; }
      genotype = a1 + a2;
    } else if (detectedFormat === '23andme' || detectedFormat === 'livingdna') {
      const parts = line.split('\\t');
      if (parts.length < 4) continue;
      rsid = parts[0].trim();
      genotype = parts[3].trim();
      if (genotype === '--' || genotype === '00') { totalData++; continue; }
    } else if (detectedFormat === 'csv') {
      const parts = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
      if (parts.length < 4) continue;
      rsid = parts[0];
      genotype = parts[3];
      if (genotype === '--' || genotype === '00' || !genotype) { totalData++; continue; }
    } else {
      continue;
    }

    if (!rsid.startsWith('rs')) { totalData++; continue; }
    totalData++;

    if (lookupSet.has(rsid) && !matches[rsid]) {
      matches[rsid] = genotype;
    }
  }

  self.postMessage({ matches, source: detectedFormat, totalLines: totalData, format: detectedFormat });
};
`;

let _workerBlobUrl = null;
function createWorker() {
  if (!_workerBlobUrl) {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    _workerBlobUrl = URL.createObjectURL(blob);
  }
  return new Worker(_workerBlobUrl);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values.map(v => v.replace(/^\uFEFF/, '').trim());
}

function normalizeReportHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeReportText(value) {
  return String(value || '').trim().toLowerCase().replace(/\u03B5/g, 'e');
}

function normalizeReportAllele(value) {
  const allele = String(value || '').trim().toUpperCase();
  return /^[ACGT]$/.test(allele) ? allele : '';
}

function getReportCell(cells, index) {
  return index >= 0 ? (cells[index] || '').trim() : '';
}

function isHeterozygousGenotype(genotype) {
  return /^[ACGT]{2}$/.test(genotype) && genotype[0] !== genotype[1];
}

function isHomozygousGenotype(genotype) {
  return /^[ACGT]{2}$/.test(genotype) && genotype[0] === genotype[1];
}

function pickAnnotatedCandidate(candidates, riskAllele, mode = 'any') {
  if (riskAllele) {
    const riskMatches = candidates.filter(g => mode === 'excludeRisk' ? !g.includes(riskAllele) : g.includes(riskAllele));
    if (riskMatches.length === 1) return riskMatches[0];
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function inferApoeReportGenotype(rsid, resultText) {
  const match = normalizeReportText(resultText).replace(/\s+/g, '').match(/e([234])\/e([234])/);
  if (!match) return null;
  const pair = [match[1], match[2]].sort().join('/');
  const lookup = {
    '2/2': { rs429358: 'TT', rs7412: 'TT' },
    '2/3': { rs429358: 'TT', rs7412: 'CT' },
    '2/4': { rs429358: 'CT', rs7412: 'CT' },
    '3/3': { rs429358: 'TT', rs7412: 'CC' },
    '3/4': { rs429358: 'TC', rs7412: 'CC' },
    '4/4': { rs429358: 'CC', rs7412: 'CC' },
  };
  return lookup[pair]?.[rsid] || null;
}

function inferAnnotatedReportGenotype(rsid, entry, cells, columns) {
  const rawGenotype = getReportCell(cells, columns.genotype);
  const rawZygosity = getReportCell(cells, columns.zygosity);
  const rawRiskAllele = getReportCell(cells, columns.riskAllele);
  const rawResult = getReportCell(cells, columns.result);
  const direct = normalizeGenotype(rawGenotype);
  if (direct) return direct;

  const apoe = inferApoeReportGenotype(rsid, rawResult) || inferApoeReportGenotype(rsid, rawGenotype);
  if (apoe) return apoe;

  const keys = Object.keys(entry?.genotypes || {}).filter(g => /^[ACGT]{2}$/.test(g));
  if (!keys.length) return null;

  const riskAllele = normalizeReportAllele(rawRiskAllele);
  const combined = `${normalizeReportText(rawGenotype)} ${normalizeReportText(rawZygosity)} ${normalizeReportText(rawResult)}`;
  const hetero = keys.filter(isHeterozygousGenotype);
  const homo = keys.filter(isHomozygousGenotype);

  if (/ref\/ref|wildtype|homozygous reference|risk allele absent|protective allele absent|variant absent|non[-\s]?carrier|not (?:a )?carrier/.test(combined)) {
    const reference = keys.filter(g => entry.genotypes[g]?.effect === 'none');
    const referenceHomo = reference.filter(isHomozygousGenotype);
    return pickAnnotatedCandidate(referenceHomo.length ? referenceHomo : reference, riskAllele, 'excludeRisk');
  }

  if (/\bhet\b|heterozygous|one risk copy|one copy|(?:^|[^a-z-])carrier\b(?!-)/.test(combined)) {
    return pickAnnotatedCandidate(hetero, riskAllele);
  }

  if (/homozygous variant|two risk copies|risk homozygous/.test(combined)) {
    const nonReferenceHomo = homo.filter(g => entry.genotypes[g]?.effect !== 'none');
    return pickAnnotatedCandidate(nonReferenceHomo, riskAllele);
  }

  return null;
}

function parseAnnotatedSnpReport(text, snpTable) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex(line => line.trim() && !line.trim().startsWith('#'));
  if (headerIndex < 0) return { matches: {}, source: 'annotated-snp-report', totalLines: 0, format: 'annotated-snp-report' };

  const headers = parseCsvLine(lines[headerIndex]).map(normalizeReportHeader);
  const columns = {
    rsid: headers.indexOf('rsid'),
    genotype: headers.indexOf('genotype'),
    zygosity: headers.indexOf('zygosity'),
    riskAllele: headers.indexOf('risk_allele'),
    result: headers.indexOf('result'),
  };
  if (columns.rsid < 0 || columns.genotype < 0 || columns.result < 0) {
    throw new Error('Unrecognized annotated SNP report format');
  }

  const matches = {};
  let totalData = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i]);
    const rsid = getReportCell(cells, columns.rsid).toLowerCase();
    if (!/^rs\d+$/.test(rsid)) continue;
    totalData++;
    if (!snpTable?.[rsid] || matches[rsid]) continue;
    const genotype = inferAnnotatedReportGenotype(rsid, snpTable[rsid], cells, columns);
    if (genotype) matches[rsid] = genotype;
  }
  return { matches, source: 'annotated-snp-report', totalLines: totalData, format: 'annotated-snp-report' };
}

function parseClinicalSnpGenotypeTail(tail) {
  const cleaned = String(tail || '').replace(/\s+/g, ' ');
  const repeatMatches = [...cleaned.matchAll(/(?:^|[^\d])(\d+\s*[\/|]\s*\d+)(?=\s*(?:[–-]|—|\b|$))/g)];
  if (repeatMatches.length) return normalizeGenotype(repeatMatches[repeatMatches.length - 1][1]);
  const matches = [...cleaned.matchAll(/(?:^|[^A-Z])([ACGT]{2})(?=\s*(?:[–-]|—|\b|$))/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1];
}

export function parseClinicalSnpReportTextWithTable(text, snpTable, options = {}) {
  const source = options.source || options.fileName || 'Clinical SNP report';
  const body = String(text || '').replace(/\u00A0/g, ' ');
  const matches = {};
  let totalLines = 0;
  const rsMatches = [...body.matchAll(/\b(rs\d+)\b/gi)];
  for (let i = 0; i < rsMatches.length; i++) {
    const rsid = rsMatches[i][1].toLowerCase();
    const entry = snpTable?.[rsid];
    if (!entry || matches[rsid]) continue;
    totalLines++;
    const start = Math.max(0, rsMatches[i].index - 90);
    const end = i + 1 < rsMatches.length ? Math.min(body.length, rsMatches[i + 1].index) : Math.min(body.length, rsMatches[i].index + 220);
    const chunk = body.slice(start, end);
    const genotype = parseClinicalSnpGenotypeTail(chunk);
    if (!genotype) continue;
    const match = findGenotypeMatch(entry, genotype);
    if (!match) continue;
    matches[rsid] = {
      genotype,
      normalizedGenotype: match.key,
      gene: entry.gene,
      variant: entry.variant,
      category: entry.category,
      markers: entry.markers || [],
      effect: match.info.effect,
      valence: match.info.valence,
      evidence: entry.evidence,
      relevance: entry.relevance,
      note: match.info.note,
      source: { type: options.type || 'report-text', label: source, fileName: options.fileName || null, rawText: chunk.trim().slice(0, 500) },
    };
  }
  return {
    matches,
    source,
    totalLines,
    coverage: { found: Object.keys(matches).length, total: Object.keys(snpTable || {}).filter(k => k.startsWith('rs')).length },
  };
}

function formatSourceName(format) {
  const names = { ancestry: 'AncestryDNA', '23andme': '23andMe', livingdna: 'Living DNA', csv: 'MyHeritage/FTDNA', 'illumina-gsgt': 'Illumina GenomeStudio (DNAEra)', 'annotated-snp-report': 'Annotated SNP report' };
  return names[format] || format;
}

export async function parseDNAFileWithTable(file, snpTable) {
  const snpIds = Object.keys(snpTable || {}).filter(k => k.startsWith('rs'));

  const headerChunk = await file.slice(0, 1000).text();
  const format = detectDNAFile(headerChunk);
  if (!format) throw new Error('Unrecognized DNA file format');

  let result;
  if (format === 'annotated-snp-report') {
    result = parseAnnotatedSnpReport(await file.text(), snpTable);
  } else {
    const worker = createWorker();
    result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { worker.terminate(); reject(new Error('DNA parsing timed out')); }, 30000);
      worker.onmessage = (e) => { clearTimeout(timeout); worker.terminate(); resolve(e.data); };
      worker.onerror = (e) => { clearTimeout(timeout); worker.terminate(); reject(new Error(e.message)); };
      worker.postMessage({ file, snpIds, format });
    });
  }

  const enriched = {};
  for (const [rsid, genotype] of Object.entries(result.matches)) {
    const entry = snpTable?.[rsid];
    if (!entry) continue;
    const genotypeInfo = findGenotypeInfo(entry, genotype);
    if (!genotypeInfo) continue;
    enriched[rsid] = {
      genotype,
      gene: entry.gene,
      variant: entry.variant,
      category: entry.category,
      markers: entry.markers || [],
      effect: genotypeInfo.effect,
      valence: genotypeInfo.valence,
      evidence: entry.evidence,
      relevance: entry.relevance,
      note: genotypeInfo.note,
    };
  }

  return {
    matches: enriched,
    source: formatSourceName(result.source),
    totalLines: result.totalLines,
    coverage: { found: Object.keys(enriched).length, total: snpIds.length },
  };
}
