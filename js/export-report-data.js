// @ts-check
// export-report-data.js — portable, renderer-independent report snapshots

import { buildExtraReportSections } from './export-report-sections.js';
import { resolveMarkerRangeContext } from './marker-analysis.js';
import { effectiveTimesPerDay, formatSupplementTotal, ingredientDailyTotal } from './supplement-impact.js';
import { getSupplementStatus } from './supplement-medication-domain.js';
import { findGenotypeInfo } from './dna-genotype.js';
import { getSnpCategoryLabel, resolveSnpEvidenceProfile, snpFindingPresentation, snpFindingRank } from './dna-evidence.js';
import { formatValue } from './utils.js';

/** Resolve imported calls against current annotations.
 * @param {any} genetics @param {Record<string, any> | null} [snpTable]
 */
export function buildReportGenetics(genetics, snpTable = null) {
  if (!genetics) return null;
  const result = cloneSerializable(genetics);
  result.findings = Object.entries(genetics.snps || {}).map(([rsid, raw]) => {
    const stored = raw || {};
    const entry = snpTable?.[rsid];
    const info = findGenotypeInfo(entry, stored.genotype);
    const presentation = snpFindingPresentation(info?.effect, info?.valence);
    const evidence = resolveSnpEvidenceProfile(info ? entry : {}, info || {});
    return {
      rsid, gene: stored.gene || entry?.gene || rsid, variant: stored.variant || entry?.variant || '',
      genotype: stored.genotype || '?', category: getSnpCategoryLabel(entry?.category || stored.category),
      direction: presentation.label, tone: presentation.tone, evidence,
      note: info?.note || 'No current catalog interpretation is available for this call.',
      apoeComponent: Boolean(genetics.apoe && ['rs429358', 'rs7412'].includes(rsid)),
      references: [...new Set([info?.ref, ...(Array.isArray(entry?.references) ? entry.references : [])].filter(Boolean))],
      strandNote: entry?.strandNote || '',
      rank: snpFindingRank(evidence, presentation),
    };
  }).sort((a, b) => a.rank - b.rank || a.rsid.localeCompare(b.rsid));
  result.catalogAvailable = Boolean(snpTable);
  result.interpretationCatalogVersion = snpTable?._meta?.version || null;
  return result;
}

export const REPORT_GENOME_MODES = ['risks', 'risks-traits', 'traits', 'all'];

/** Apply the same current-catalog selection to the PDF and AI overview. */
export function selectReportGenomeFindings(genetics, options = {}) {
  const findings = genetics?.findings || [];
  if (options.genomeMode === 'all') return findings;
  if (options.genomeMode === 'risks') return findings.filter(finding => finding.tone === 'risk');
  if (options.genomeMode === 'traits') return findings.filter(finding => finding.tone === 'trait');
  if (options.genomeMode === 'risks-traits') return findings.filter(finding => ['risk', 'trait'].includes(finding.tone));
  return findings.filter(finding => options.genomeVariants?.includes(finding.rsid));
}

export function getSupplementDosageParts(s) {
  const parts = [];
  if (s.dosage) parts.push(String(s.dosage));
  if (s.dose) parts.push(String(s.dose));
  if (s.amount) parts.push(String(s.amount));
  if (s.frequency && !parts.some(part => part.toLowerCase().includes(String(s.frequency).toLowerCase()))) {
    parts.push(String(s.frequency));
  }
  if (Array.isArray(s.ingredients) && s.ingredients.length > 0) {
    const ingredientParts = s.ingredients.map(ing => {
      const name = ing.name ? String(ing.name).trim() : '';
      const amount = ing.amount ? String(ing.amount).trim() : '';
      const base = [name, amount].filter(Boolean).join(' ').trim();
      if (!base) return '';
      const total = ingredientDailyTotal(ing, s);
      const times = effectiveTimesPerDay(ing, s);
      const timesStr = times && times > 1 ? ` x ${times}/day` : '';
      const totalStr = total ? ` -> ${formatSupplementTotal(total)}` : '';
      return `${base}${timesStr}${totalStr}`;
    }).filter(Boolean);
    if (ingredientParts.length > 0) parts.push(ingredientParts.join('; '));
  }
  if (Array.isArray(s.inactiveIngredients) && s.inactiveIngredients.length > 0) {
    parts.push(`Other label ingredients: ${s.inactiveIngredients.join(', ')}`);
  }
  if (Array.isArray(s.qualityTests) && s.qualityTests.length > 0) {
    parts.push(`Source-reported laboratory results: ${s.qualityTests.map(test => {
      const result = test.resultText || test.status || 'result not reported';
      return `${test.analyte || 'Unknown analyte'} ${result}${test.basis ? ` (${test.basis})` : ''}`;
    }).join('; ')}`);
  }
  if (s.timesPerDay && !parts.some(part => /\b\/day\b|\bx\s*\d/i.test(part))) {
    parts.push(`${s.timesPerDay}x/day`);
  }
  return [...new Set(parts)];
}


export const REPORT_DATA_SCHEMA_VERSION = 1;

/**
 * @typedef {{
 *   data?: any,
 *   profile?: any,
 *   importedData?: any,
 *   reportOptions?: any,
 *   rangeMode?: string,
 *   unitSystem?: string,
 *   contextSections?: any[],
 *   generatedAt?: string,
 *   snpTable?: any,
 * }} BuildReportDataSnapshotInput
 */

const LAB_SECTION_IDS = new Set(['flagged', 'categories', 'summary', 'trends']);
// Preserve the v1 programmatic context contract; builder selections use explicit titles.
const CONTEXT_FIELDS = ['healthGoals', 'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'interpretiveLens', 'contextNotes', 'menstrualCycle', 'biometrics', 'wearableSummary', 'emfAssessment', 'sunSessions', 'deviceSessions', 'lightDevices', 'lightEnvironment', 'lightMeasurements', 'lightAudits', 'sunCorrelations', 'lifelightProfile'];


function normalizeRangeMode(rangeMode) {
  return rangeMode === 'reference' || rangeMode === 'both' ? rangeMode : 'optimal';
}

function hasRangeBounds(range) {
  return range?.min != null || range?.max != null;
}

function statusForResult(value, range) {
  if (value == null) return 'missing';
  if (!hasRangeBounds(range)) return 'unrated';
  if (range.min != null && value < range.min) return 'low';
  if (range.max != null && value > range.max) return 'high';
  return 'normal';
}

function cloneSerializable(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneSerializable);
  const cloned = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && typeof item !== 'function') cloned[key] = cloneSerializable(item);
  }
  return cloned;
}

function copyRange(range, usedForStatus = false) {
  if (!range) return null;
  return {
    min: range.min ?? null,
    max: range.max ?? null,
    label: range.label || 'Range',
    kind: range.kind || 'reference',
    source: range.source || 'schema',
    usedForStatus,
  };
}

function rangeIdentity(range) {
  return [range?.min ?? '', range?.max ?? '', range?.label || '', range?.kind || '', range?.source || ''].join('|');
}

function rangesForResult(marker, dateIndex, rangeMode) {
  const selected = resolveMarkerRangeContext(marker, dateIndex, rangeMode);
  const judging = copyRange(selected.judgingRange, true);
  const displayed = selected.displayedRanges.map(range => copyRange(range, !!range.usedForStatus));
  const available = [];
  const seen = new Set();
  const allRanges = resolveMarkerRangeContext(marker, dateIndex, 'both').displayedRanges;
  for (const range of allRanges) {
    const identity = rangeIdentity(range);
    if (seen.has(identity)) continue;
    seen.add(identity);
    available.push(copyRange(range, identity === rangeIdentity(judging)));
  }
  return { judging, displayed, available };
}

function markerResultDate(data, category, marker, index) {
  if (marker.singlePoint || category.singlePoint) {
    return marker.singleDate || category.singleDate || null;
  }
  return data.dates?.[index] || null;
}

function buildMarkerTrend(results) {
  if (results.length < 2) return null;
  const first = results[0];
  const latest = results[results.length - 1];
  const delta = latest.value - first.value;
  const percentChange = first.value === 0 ? null : (delta / first.value) * 100;
  return {
    first: { date: first.date, value: first.value },
    latest: { date: latest.date, value: latest.value },
    readingCount: results.length,
    delta,
    percentChange,
    direction: delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'stable',
  };
}

function markerNote(importedData, marker, categoryKey, markerKey) {
  const storageDotKey = marker.storageDotKey || `${categoryKey}.${markerKey}`;
  return importedData.markerNotes?.[storageDotKey] ?? null;
}

function valueNote(importedData, marker, categoryKey, markerKey, date) {
  if (!date) return null;
  const storageDotKey = marker.storageDotKey || `${categoryKey}.${markerKey}`;
  return importedData.markerValueNotes?.[`${storageDotKey}:${date}`] ?? null;
}

function buildEntryProvenance(importedData) {
  const resultSources = new Map();
  const sourceReportedRanges = new Map();
  const collectionContextSourcesByDate = {};
  const snapshotsById = new Map((importedData.importSnapshots || [])
    .filter(snapshot => snapshot?.id)
    .map(snapshot => [snapshot.id, snapshot]));
  for (const entry of importedData.entries || []) {
    if (!entry?.date) continue;
    if (entry.collectionContextSources && typeof entry.collectionContextSources === 'object') {
      collectionContextSourcesByDate[entry.date] = {
        ...(collectionContextSourcesByDate[entry.date] || {}),
        ...cloneSerializable(entry.collectionContextSources),
      };
    }
    for (const storageDotKey of Object.keys(entry.markers || {})) {
      const directSource = entry.markerSources?.[storageDotKey];
      let source = directSource ? cloneSerializable(directSource) : null;
      if (!source && (entry.sourceFile || entry.sourceFiles?.length)) {
        source = {
          file: entry.sourceFile || null,
          files: cloneSerializable(entry.sourceFiles || []),
        };
      }
      if (source && entry.id && source.entryId == null) source.entryId = entry.id;
      const resultKey = `${entry.date}\u0000${storageDotKey}`;
      if (source) resultSources.set(resultKey, source);
      const snapshot = source?.snapshotId ? snapshotsById.get(source.snapshotId) : null;
      const snapshotMarker = snapshot?.markers?.find(marker =>
        marker?.mappedKey === storageDotKey || marker?.suggestedKey === storageDotKey
      );
      if (snapshotMarker && (snapshotMarker.refMin != null || snapshotMarker.refMax != null)) {
        sourceReportedRanges.set(resultKey, {
          min: snapshotMarker.refMin ?? null,
          max: snapshotMarker.refMax ?? null,
          unit: snapshotMarker.unit || null,
          snapshotId: snapshot.id,
          file: snapshot.fileName || source?.file || null,
        });
      }
    }
  }
  return { resultSources, sourceReportedRanges, collectionContextSourcesByDate };
}

function buildLabs(data, importedData, rangeMode) {
  const categories = [];
  const flags = [];
  const notableTrends = [];
  const allDates = new Set();
  let resultCount = 0;
  let inRangeCount = 0;
  let outOfRangeCount = 0;
  let unratedCount = 0;
  const provenance = buildEntryProvenance(importedData);

  for (const [categoryKey, category] of Object.entries(data.categories || {})) {
    const markers = [];
    for (const [markerKey, marker] of Object.entries(category.markers || {})) {
      if (marker.hidden) continue;
      const results = [];
      for (let index = 0; index < (marker.values || []).length; index++) {
        const value = marker.values[index];
        if (value == null) continue;
        const date = markerResultDate(data, category, marker, index);
        if (date) allDates.add(date);
        const ranges = rangesForResult(marker, index, rangeMode);
        const status = statusForResult(value, ranges.judging);
        const storageDotKey = marker.storageDotKey || `${categoryKey}.${markerKey}`;
        results.push({
          date,
          dateIndex: index,
          value,
          displayValue: formatValue(value),
          status,
          ranges,
          collectionContext: date ? cloneSerializable(data.entryContextByDate?.[date] || null) : null,
          collectionContextSources: date
            ? cloneSerializable(provenance.collectionContextSourcesByDate[date] || null)
            : null,
          source: date ? cloneSerializable(provenance.resultSources.get(`${date}\u0000${storageDotKey}`) || null) : null,
          sourceReportedRange: date
            ? cloneSerializable(provenance.sourceReportedRanges.get(`${date}\u0000${storageDotKey}`) || null)
            : null,
          note: valueNote(importedData, marker, categoryKey, markerKey, date),
        });
      }
      if (results.length === 0) continue;

      resultCount += results.length;
      const latestResult = results[results.length - 1];
      if (latestResult.status === 'normal') inRangeCount++;
      else if (latestResult.status === 'unrated') unratedCount++;
      else if (latestResult.status === 'high' || latestResult.status === 'low') outOfRangeCount++;

      const storageDotKey = marker.storageDotKey || `${categoryKey}.${markerKey}`;
      const markerId = marker.markerId || storageDotKey;
      const trend = buildMarkerTrend(results);
      const markerData = {
        id: markerId,
        key: markerKey,
        categoryKey,
        storageDotKey,
        nativeCategoryKey: marker.nativeCategoryKey || categoryKey,
        name: marker.name || markerKey,
        unit: marker.unit || '',
        custom: !!marker.custom,
        calculated: !!marker.calculated || !!category.calculated,
        rangePolicy: marker.rangePolicy || 'reference',
        note: markerNote(importedData, marker, categoryKey, markerKey),
        results,
        latestResult,
        trend,
      };
      markers.push(markerData);

      if (latestResult.status === 'high' || latestResult.status === 'low') {
        flags.push({
          markerId,
          markerKey,
          categoryKey,
          storageDotKey,
          category: category.label || categoryKey,
          name: markerData.name,
          unit: markerData.unit,
          date: latestResult.date,
          value: latestResult.value,
          displayValue: latestResult.displayValue,
          status: latestResult.status,
          range: latestResult.ranges.judging,
          availableRanges: latestResult.ranges.available,
          displayedRanges: latestResult.ranges.displayed,
          note: latestResult.note,
        });
      }
      if (trend && trend.percentChange != null && Math.abs(trend.percentChange) > 10) {
        notableTrends.push({
          markerId,
          markerKey,
          categoryKey,
          name: markerData.name,
          unit: markerData.unit,
          ...trend,
        });
      }
    }
    if (markers.length > 0) {
      categories.push({
        key: categoryKey,
        label: category.label || categoryKey,
        group: category.group || null,
        singlePoint: !!category.singlePoint,
        markers,
      });
    }
  }

  return {
    dates: [...allDates].filter(Boolean).sort(),
    collectionContextByDate: cloneSerializable(Object.fromEntries(
      Object.entries(data.entryContextByDate || {}).filter(([date]) => allDates.has(date))
    )),
    collectionContextSourcesByDate: cloneSerializable(Object.fromEntries(
      Object.entries(provenance.collectionContextSourcesByDate).filter(([date]) => allDates.has(date))
    )),
    categories,
    flags,
    notableTrends,
    summary: {
      dateCount: allDates.size,
      categoryCount: categories.length,
      markerCount: categories.reduce((total, category) => total + category.markers.length, 0),
      resultCount,
      latestInRangeCount: inRangeCount,
      latestOutOfRangeCount: outOfRangeCount,
      latestUnratedCount: unratedCount,
    },
  };
}

function buildProfile(profile, includeContext) {
  return cloneSerializable({
    id: profile?.id || null,
    name: profile?.name || 'Profile',
    sex: profile?.sex || null,
    dob: profile?.dob || null,
    status: profile?.status || null,
    tags: includeContext ? profile?.tags || [] : [],
    notes: includeContext ? profile?.notes || '' : '',
    location: profile?.location || null,
    height: profile?.height ?? null,
    heightUnit: profile?.heightUnit || null,
  });
}

function formatAgentRange(range) {
  if (range?.min != null && range?.max != null) return `${formatValue(range.min)}-${formatValue(range.max)}`;
  if (range?.min != null) return `\u2265${formatValue(range.min)}`;
  if (range?.max != null) return `\u2264${formatValue(range.max)}`;
  return 'not specified';
}

function formatAgentRanges(ranges) {
  return ranges.map(range => `${range?.label || 'range'} ${formatAgentRange(range)}${range?.usedForStatus ? ' [status basis]' : ''}`).join('; ');
}

function reportAge(profile, generatedAt) {
  if (!profile?.dob) return '';
  const birth = new Date(`${profile.dob}T00:00:00`);
  const at = new Date(generatedAt || Date.now());
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(at.getTime())) return '';
  let age = at.getFullYear() - birth.getFullYear();
  const monthDelta = at.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getDate() < birth.getDate())) age--;
  return age >= 0 && age <= 130 ? `${age} years` : '';
}

function compactContextValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Produce bounded plain text for an agent from a portable report snapshot.
 * The snapshot remains the lossless contract; this projection deliberately
 * prioritizes latest abnormalities, representative markers, and notable trends.
 */
export function formatReportDataForAgent(reportData, {
  markerLimit = 32,
  flagLimit = 16,
  trendLimit = 12,
  contextLimit = 10,
} = {}) {
  if (!reportData) return '';
  const sections = new Set(reportData.scope?.sections || []);
  const profile = reportData.profile || {};
  const sex = profile.sex === 'female' ? 'Female' : profile.sex === 'male' ? 'Male' : 'Not specified';
  const lines = [
    `Profile: ${profile.name || 'Profile'}`,
    `Sex: ${sex}`,
    `Age: ${reportAge(profile, reportData.generatedAt) || 'not specified'}`,
    `Profile status: ${profile.status || 'not specified'}`,
    `Report type: ${reportData.scope?.presetLabel || 'Report'}`,
  ];

  const labs = reportData.labs;
  if (labs) {
    const firstDate = labs.dates?.[0];
    const lastDate = labs.dates?.[labs.dates.length - 1];
    const dateRange = firstDate
      ? (lastDate && lastDate !== firstDate ? `${firstDate} to ${lastDate}` : firstDate)
      : 'No lab dates in selected range';
    lines.push(
      `Selected report window: ${dateRange}`,
      `Range mode: ${reportData.scope?.rangeMode || 'optimal'} (status basis: ${reportData.scope?.statusBasis || 'selected range'})`,
      `Lab dates in report: ${labs.summary?.dateCount || 0}`,
      `Markers reviewed: ${labs.summary?.markerCount || 0}`,
      `Markers within selected range: ${labs.summary?.latestInRangeCount || 0}`,
      `Latest markers outside selected range: ${labs.summary?.latestOutOfRangeCount || 0}`,
    );
    if (labs.summary?.latestUnratedCount) lines.push(`Latest unrated markers: ${labs.summary.latestUnratedCount}`);

    const collectionEntries = Object.entries(labs.collectionContextByDate || {}).slice(-10);
    if (collectionEntries.length > 0) {
      lines.push('Lab collection context:');
      for (const [date, context] of collectionEntries) {
        const details = Object.entries(context || {})
          .filter(([, value]) => value != null && value !== '')
          .map(([key, value]) => `${key}=${compactContextValue(value)}`)
          .join(', ');
        if (details) lines.push(`- ${date}: ${details}`);
      }
    }

    if ((sections.has('flagged') || sections.has('summary')) && labs.flags?.length > 0) {
      lines.push('Latest out-of-range markers:');
      for (const flag of labs.flags.slice(0, flagLimit)) {
        lines.push(`- ${flag.name}: ${flag.displayValue} ${flag.unit || ''} ${flag.status} (${formatAgentRanges(flag.displayedRanges || [flag.range])}; ${flag.date || 'date not set'})`);
      }
    }

    if (sections.has('categories') || sections.has('summary')) {
      const markers = labs.categories.flatMap(category =>
        category.markers.map(marker => ({ category: category.label, marker }))
      ).sort((left, right) => {
        const leftPriority = left.marker.latestResult?.status === 'normal' ? 1 : 0;
        const rightPriority = right.marker.latestResult?.status === 'normal' ? 1 : 0;
        return leftPriority - rightPriority || left.marker.name.localeCompare(right.marker.name);
      });
      if (markers.length > 0) lines.push('Representative latest lab results:');
      for (const { category, marker } of markers.slice(0, markerLimit)) {
        const result = marker.latestResult;
        const notes = [marker.note, result.note].filter(Boolean).join('; ');
        lines.push(`- ${category}: ${marker.name} ${result.displayValue} ${marker.unit || ''} (${result.status}; ${formatAgentRanges(result.ranges.displayed)}; ${result.date || 'date not set'})${notes ? `; note: ${String(notes).replace(/\s+/g, ' ').slice(0, 180)}` : ''}`);
      }
    }

    if (sections.has('trends') && labs.notableTrends?.length > 0) {
      lines.push('Notable trends:');
      for (const trend of labs.notableTrends.slice(0, trendLimit)) {
        lines.push(`- ${trend.name} ${trend.direction} ${Math.abs(trend.percentChange).toFixed(0)}% (${formatValue(trend.first.value)} to ${formatValue(trend.latest.value)} ${trend.unit || ''}, ${trend.first.date || 'first result'} to ${trend.latest.date || 'latest result'})`);
      }
    }
  }

  if (sections.has('context') && Array.isArray(profile.tags) && profile.tags.length > 0) {
    lines.push(`Profile tags: ${profile.tags.slice(0, 8).join(', ')}`);
  }
  if (sections.has('context') && profile.notes) {
    lines.push(`Profile notes: ${String(profile.notes).replace(/\s+/g, ' ').slice(0, 280)}`);
  }
  if (sections.has('supplements') && reportData.supplements?.length > 0) {
    lines.push('Supplements and medications:');
    for (const supplement of reportData.supplements.slice(0, 12)) {
      const dosage = getSupplementDosageParts(supplement).join('; ').slice(0, 500);
      lines.push(`- ${supplement.name || 'Unnamed'} [${getSupplementStatus(supplement)}]${dosage ? ` (${dosage})` : ''}`);
    }
  }
  if (sections.has('notes') && reportData.notes?.length > 0) {
    lines.push('Recent report notes:');
    for (const note of reportData.notes.slice(-5)) {
      lines.push(`- ${note.date || 'undated'}: ${String(note.text || '').slice(0, 220)}`);
    }
  }
  if (sections.has('context') && reportData.context?.sections?.length > 0) {
    lines.push('Profile context:');
    for (const section of reportData.context.sections.slice(0, contextLimit)) {
      lines.push(`- ${section.title}: ${String(section.text || '').replace(/\s+/g, ' ').slice(0, 280)}`);
    }
  }
  if (sections.has('genetics') && reportData.genetics) {
    const genetics = reportData.genetics;
    lines.push('Genetics: direction, evidence strength, and personal relevance are separate; associations are not diagnoses.');
    const findings = selectReportGenomeFindings(genetics, reportData.scope);
    if (genetics.apoe && (reportData.scope.genomeMode === 'all' || (!reportData.scope.genomeMode && !(genetics.findings || []).length) || findings.some(finding => ['rs429358', 'rs7412'].includes(finding.rsid)))) lines.push(`Genetics: APOE ${genetics.apoe}`);
    if (genetics.mtdna && (!reportData.scope.genomeMode || reportData.scope.genomeMode === 'all')) lines.push(`mtDNA haplogroup: ${genetics.mtdna.haplogroup}`);
    for (const finding of findings.slice(0, 24)) {
      lines.push(`- ${finding.gene} ${finding.rsid} ${finding.genotype}: ${finding.direction}; evidence: ${finding.evidence.evidenceLabel}; relevance: ${finding.evidence.relevanceLabel}. ${finding.note} ${finding.evidence.scope} ${finding.evidence.context}`);
    }
    if (findings.length > 24) lines.push(`${findings.length - 24} additional genetic calls are present in the full report; this overview is selective.`);
  }

  for (const section of reportData.additionalSections || []) {
    const summary = section.summary || section;
    lines.push(`${section.title}: ${summary.note}`);
    for (const row of summary.rows) lines.push(row.map((value, index) => `${summary.columns[index]}: ${value}`).join('; '));
  }
  if (reportData.scope?.purpose) lines.unshift(`User's reason for sharing / questions: ${reportData.scope.purpose}`);
  return lines.join('\n');
}

/**
 * Build a detached, JSON-serializable snapshot of the selected report facts.
 * This function has no dependency on application state or PDF/HTML rendering,
 * so other agents and local integrations can consume the same resolved facts.
 */
export function buildReportDataSnapshot(/** @type {BuildReportDataSnapshotInput} */ input = {}) {
  const {
    data,
    profile,
    importedData,
    reportOptions,
    rangeMode = 'optimal',
    unitSystem = 'EU',
    contextSections = [],
    generatedAt = new Date().toISOString(),
    snpTable = null,
  } = input;
  const options = reportOptions || { preset: 'full', presetLabel: 'Full lab report', dateRange: 'all', sections: [] };
  const sections = new Set(options.sections || []);
  const normalizedRangeMode = normalizeRangeMode(rangeMode);
  const includesLabs = [...sections].some(section => LAB_SECTION_IDS.has(section));
  const safeImportedData = importedData || {};
  return {
    schemaVersion: REPORT_DATA_SCHEMA_VERSION,
    generatedAt,
    scope: {
      preset: options.preset || 'full',
      presetLabel: options.presetLabel || 'Report',
      dateRange: options.dateRange || 'all',
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      sections: [...sections],
      purpose: options.purpose || '',
      appendixSections: options.appendixSections || [],
      genomeVariants: options.genomeVariants || [],
      genomeMode: REPORT_GENOME_MODES.includes(options.genomeMode) ? options.genomeMode : null,
      categoryKeys: Array.isArray(options.categoryKeys) ? [...options.categoryKeys] : null,
      rangeMode: normalizedRangeMode,
      statusBasis: normalizedRangeMode === 'reference'
        ? 'reference'
        : 'optimal when available; otherwise reference; phase-specific reference ranges take precedence',
      unitSystem,
    },
    profile: buildProfile(profile || {}, sections.has('context') && !Array.isArray(options.contextTitles)),
    labs: includesLabs ? buildLabs(data || { dates: [], categories: {} }, safeImportedData, normalizedRangeMode) : null,
    notes: sections.has('notes') ? cloneSerializable(safeImportedData.notes || []) : [],
    supplements: sections.has('supplements') ? cloneSerializable(safeImportedData.supplements || []) : [],
    genetics: sections.has('genetics') ? buildReportGenetics(safeImportedData.genetics, snpTable) : null,
    additionalSections: buildExtraReportSections(safeImportedData, [...sections], { startDate: options.startDate, endDate: options.endDate, unitSystem }),
    context: sections.has('context') ? { sections: cloneSerializable(contextSections.filter(section => !Array.isArray(options.contextTitles) || options.contextTitles.includes(section.title))), raw: Array.isArray(options.contextTitles) ? {} : cloneSerializable(Object.fromEntries(CONTEXT_FIELDS.filter(key => safeImportedData[key] != null).map(key => [key, safeImportedData[key]]))) } : null,
  };
}
