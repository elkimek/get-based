#!/usr/bin/env node
// lab-ontology-coverage.mjs — provider catalogue ↔ getbased marker ontology audit.
//
// This is a reporting/review-queue script. It does not turn catalogue rows green
// by itself; production coverage remains driven by reviewed stable marker keys
// and provider matching tests.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LAB_MARKER_CROSSWALK } from '../js/lab-standards/marker-crosswalk.js';
import { findProviderCatalogueMatches, normalizeSearchText } from '../js/lab-providers/provider-catalog-matcher.js';
import { findLabshopCatalogueMatches } from '../js/lab-providers/cz/labshop-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_CATALOGUE_PATH = path.join(ROOT, 'data', 'lab-provider-catalogues.private.json');

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function rowSearchText(row = {}) {
  return normalizeSearchText([
    row.name,
    row.shortcut,
    row.groupName,
    row.description,
    row.preview,
  ].filter(Boolean).join(' '));
}

function isPanelRow(row = {}) {
  const text = rowSearchText(row);
  return /\b(panel|package|balicek|balicky|profil|komplex|basic|expert|plus)\b/.test(text);
}

function compactRow(row = {}) {
  return {
    providerProductId: String(row.providerProductId || ''),
    name: row.name || '',
    shortcut: row.shortcut || '',
    groupName: row.groupName || '',
    priceCzk: row.priceCzk ?? null,
  };
}

function markerIntentsForKeys(markerKeys = Object.keys(LAB_MARKER_CROSSWALK)) {
  return markerKeys
    .filter(key => LAB_MARKER_CROSSWALK[key])
    .map(key => ({
      markerKey: key,
      displayName: LAB_MARKER_CROSSWALK[key].canonicalName || key,
      priority: 'core',
    }));
}

function findProviderSpecificMatches(providerId, markerIntents, catalogueItems, options = {}) {
  if (providerId === 'cz.labshop') return findLabshopCatalogueMatches(markerIntents, catalogueItems);
  return findProviderCatalogueMatches(markerIntents, catalogueItems, options.matcherOptions || {});
}

export function buildLabOntologyCoverageReport(options = {}) {
  const providerId = options.providerId || 'cz.labshop';
  const catalogueItems = Array.isArray(options.catalogueItems) ? options.catalogueItems.filter(Boolean) : [];
  const markerIntents = markerIntentsForKeys(options.markerKeys || Object.keys(LAB_MARKER_CROSSWALK));
  const matches = findProviderSpecificMatches(providerId, markerIntents, catalogueItems, options);
  const matchedProductIds = new Set(matches.map(match => String(match.product?.providerProductId || '')).filter(Boolean));
  const coveredMarkerKeys = new Set(matches.map(match => match.markerKey).filter(Boolean));

  const mappedRows = [];
  const panelRows = [];
  const ambiguousRows = [];
  const unmappedRows = [];

  for (const row of catalogueItems) {
    const id = String(row.providerProductId || '');
    const compact = compactRow(row);
    if (matchedProductIds.has(id)) mappedRows.push({
      ...compact,
      matchedMarkerKeys: matches
        .filter(match => String(match.product?.providerProductId || '') === id)
        .map(match => match.markerKey),
      classification: 'already_mapped_exact',
    });
    else if (isPanelRow(row)) panelRows.push({ ...compact, classification: 'panel_or_package_review' });
    else if (rowSearchText(row)) ambiguousRows.push({ ...compact, classification: 'single_marker_candidate_review' });
    else unmappedRows.push({ ...compact, classification: 'unmapped_unknown' });
  }

  const missingOntologyMarkerKeys = markerIntents
    .map(marker => marker.markerKey)
    .filter(key => !coveredMarkerKeys.has(key));

  return {
    summary: {
      providerId,
      catalogueItems: catalogueItems.length,
      stableMarkerKeys: markerIntents.length,
      ontologyMarkersCovered: coveredMarkerKeys.size,
      ontologyMarkerCoveragePct: pct(coveredMarkerKeys.size, markerIntents.length),
      exactCatalogueRowsMapped: mappedRows.length,
      exactCatalogueRowsMappedPct: pct(mappedRows.length, catalogueItems.length),
      panelRows: panelRows.length,
      ambiguousRows: ambiguousRows.length,
      unmappedRows: unmappedRows.length,
    },
    mappedRows,
    panelRows,
    ambiguousRows,
    unmappedRows,
    missingOntologyMarkerKeys,
  };
}

export function formatLabOntologyCoverageReport(report) {
  const s = report.summary;
  const reviewCount = s.panelRows + s.ambiguousRows + s.unmappedRows;
  const lines = [
    `Lab ontology coverage — ${s.providerId}`,
    `Catalogue rows: ${s.catalogueItems}`,
    `Stable marker keys: ${s.stableMarkerKeys}`,
    `Ontology markers covered: ${s.ontologyMarkersCovered}/${s.stableMarkerKeys} (${s.ontologyMarkerCoveragePct}%)`,
    `Catalogue exact-mapped: ${s.exactCatalogueRowsMapped}/${s.catalogueItems} (${s.exactCatalogueRowsMappedPct}%)`,
    `Review queue: ${reviewCount} rows`,
    `  Panels/packages: ${s.panelRows}`,
    `  Single-marker candidates: ${s.ambiguousRows}`,
    `  Unknown/unmapped: ${s.unmappedRows}`,
  ];
  if (report.missingOntologyMarkerKeys.length) {
    lines.push(`Missing ontology markers: ${report.missingOntologyMarkerKeys.join(', ')}`);
  }
  return lines.join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { provider: 'cz.labshop', catalogue: DEFAULT_CATALOGUE_PATH, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--provider') args.provider = argv[++i];
    else if (arg.startsWith('--provider=')) args.provider = arg.slice('--provider='.length);
    else if (arg === '--catalogue') args.catalogue = path.resolve(argv[++i]);
    else if (arg.startsWith('--catalogue=')) args.catalogue = path.resolve(arg.slice('--catalogue='.length));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return `Audit provider catalogue coverage against getbased marker ontology\n\nOptions:\n  --provider <id>     Provider id (default: cz.labshop)\n  --catalogue <path>  Runtime catalogue JSON (default: data/lab-provider-catalogues.private.json)\n  --json              Print full JSON report\n`;
}

function readCatalogueRows(file, providerId) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return payload?.[providerId]?.catalogueItems || [];
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(helpText());
    return;
  }
  const catalogueItems = readCatalogueRows(args.catalogue, args.provider);
  const report = buildLabOntologyCoverageReport({ providerId: args.provider, catalogueItems });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatLabOntologyCoverageReport(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(`[lab-ontology-coverage] ${error.message}`);
    process.exit(1);
  });
}
