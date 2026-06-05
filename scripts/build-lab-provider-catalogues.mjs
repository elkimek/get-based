#!/usr/bin/env node
// Build normalized private/runtime lab provider catalogue payload.
//
// This script deliberately produces deployment/runtime data, not public app
// source. Default output is gitignored so real provider rows, product IDs,
// prices, and future partner-specific supplemental offers do not get committed.
//
// Usage:
//   npm run lab:catalog
//   node scripts/build-lab-provider-catalogues.mjs --out /tmp/lab-catalogues.json
//   node scripts/build-lab-provider-catalogues.mjs --env

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { fetchLabshopCatalogue } from '../js/lab-providers/cz/labshop-catalog.js';
import { fetchUnilabsConfiguratorCatalogue } from '../js/lab-providers/cz/unilabs-catalog.js';
import { normalizeLabProviderCataloguesPayload } from '../api/lab-provider-catalogues.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'lab-provider-catalogues.private.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: DEFAULT_OUT, previous: '', env: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice('--out='.length));
    else if (arg === '--previous') args.previous = path.resolve(argv[++i]);
    else if (arg.startsWith('--previous=')) args.previous = path.resolve(arg.slice('--previous='.length));
    else if (arg === '--env') args.env = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return `Build private lab provider catalogue payload\n\nOptions:\n  --out <path>       Write JSON payload (default: data/lab-provider-catalogues.private.json)\n  --previous <path>  Compare against a previous payload and print diff summary\n  --env              Print LAB_PROVIDER_CATALOGUES_JSON=<compact-json> to stdout instead of file\n  --dry-run          Fetch/build/print summary without writing\n`;
}

function stripRuntimeRow(row) {
  const { raw, ...rest } = row || {};
  return { ...rest };
}

function sortRows(rows = []) {
  return [...rows]
    .map(stripRuntimeRow)
    .sort((a, b) => String(a.providerProductId || '').localeCompare(String(b.providerProductId || ''), 'en'));
}

export async function buildLabProviderCataloguesPayload(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const [labshopRows, unilabsRows] = await Promise.all([
    fetchLabshopCatalogue({ fetch: fetchImpl, ...(options.labshop || {}) }),
    fetchUnilabsConfiguratorCatalogue({ fetch: fetchImpl, ...(options.unilabs || {}) }),
  ]);

  return normalizeLabProviderCataloguesPayload({
    'cz.labshop': {
      catalogueItems: sortRows(labshopRows),
    },
    'cz.unilabs': {
      catalogueItems: sortRows(unilabsRows),
      ...(Array.isArray(options.unilabsSupplementalOffers) && options.unilabsSupplementalOffers.length
        ? { supplementalOffers: options.unilabsSupplementalOffers.map(stripRuntimeRow) }
        : {}),
    },
  });
}

function rowsById(payload, providerId) {
  const rows = payload?.[providerId]?.catalogueItems || [];
  return new Map(rows.map(row => [String(row.providerProductId || ''), row]).filter(([id]) => id));
}

export function diffProviderCatalogues(previous = {}, current = {}) {
  const providerIds = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  const out = {};
  for (const providerId of providerIds) {
    const before = rowsById(previous, providerId);
    const after = rowsById(current, providerId);
    const added = [];
    const removed = [];
    const priceChanged = [];
    const renamed = [];

    for (const [id, row] of after.entries()) {
      const prior = before.get(id);
      if (!prior) {
        added.push(row);
        continue;
      }
      if (prior.priceCzk !== row.priceCzk) {
        priceChanged.push({ providerProductId: id, name: row.name, before: prior.priceCzk ?? null, after: row.priceCzk ?? null });
      }
      if (String(prior.name || '') !== String(row.name || '')) {
        renamed.push({ providerProductId: id, before: prior.name || '', after: row.name || '' });
      }
    }
    for (const [id, row] of before.entries()) {
      if (!after.has(id)) removed.push(row);
    }
    out[providerId] = { added, removed, priceChanged, renamed };
  }
  return out;
}

export function serializeLabProviderCataloguesEnv(payload) {
  return JSON.stringify(normalizeLabProviderCataloguesPayload(payload || {}));
}

function readJsonIfExists(file) {
  if (!file) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

function summarizePayload(payload) {
  return Object.fromEntries(Object.entries(payload || {}).map(([providerId, value]) => [providerId, {
    catalogueItems: (value.catalogueItems || []).length,
    supplementalOffers: (value.supplementalOffers || []).length,
  }]));
}

function summarizeDiff(diff) {
  return Object.fromEntries(Object.entries(diff || {}).map(([providerId, value]) => [providerId, {
    added: value.added.length,
    removed: value.removed.length,
    priceChanged: value.priceChanged.length,
    renamed: value.renamed.length,
  }]));
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(helpText());
    return;
  }

  const payload = await buildLabProviderCataloguesPayload();
  const previous = args.previous || fs.existsSync(args.out) ? readJsonIfExists(args.previous || args.out) : {};
  const diff = diffProviderCatalogues(previous, payload);

  if (args.env) {
    console.log(`LAB_PROVIDER_CATALOGUES_JSON=${serializeLabProviderCataloguesEnv(payload)}`);
  } else if (!args.dryRun) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`);
  }

  console.error('[lab-provider-catalogues] summary', JSON.stringify(summarizePayload(payload)));
  console.error('[lab-provider-catalogues] diff', JSON.stringify(summarizeDiff(diff)));
  if (!args.env && !args.dryRun) console.error(`[lab-provider-catalogues] wrote ${args.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(`[lab-provider-catalogues] ${error.message}`);
    process.exit(1);
  });
}
