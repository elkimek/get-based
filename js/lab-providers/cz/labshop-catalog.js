// cz/labshop-catalog.js — Labshop embedded-catalogue adapter.
//
// Labshop's searchable individual-test catalogue is server-rendered into
// /produkty/vysetreni as #vysetreniView[data-source-products]. This module is
// deliberately catalogue-data oriented: provider rows come from fetched/parsing
// output, while code only owns parsing, normalization, and matching rules.

import {
  findProviderCatalogueMatches,
  normalizeSearchText,
} from '../provider-catalog-matcher.js';

export const LABSHOP_PROVIDER_ID = 'cz.labshop';
export const LABSHOP_CATALOGUE_PATH = '/produkty/vysetreni';
export const LABSHOP_CATALOGUE_SOURCE = 'labshop_embedded_data_source_products';

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export { normalizeSearchText };

function parsePriceCzk(product) {
  const numeric = Number(product?.Price);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  const text = String(product?.PriceTxt || '').replace(/\s+/g, '');
  const match = text.match(/(\d+(?:[,.]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function searchableFields(product) {
  const subMethods = Array.isArray(product?.SubMethods) ? product.SubMethods : [];
  return [
    product?.Name,
    product?.Shortcut,
    product?.GroupName,
    product?.Preview,
    product?.Collection,
    ...subMethods.flatMap(method => [method?.Name, method?.Shortcut, method?.Collection]),
  ].filter(Boolean);
}

export function normalizeLabshopCatalogueProduct(product) {
  const providerProductId = String(product?.IdProduct || '').trim();
  if (!providerProductId) return null;
  const fields = searchableFields(product);
  return {
    providerId: LABSHOP_PROVIDER_ID,
    providerProductId,
    name: String(product?.Name || '').trim(),
    shortcut: product?.Shortcut ? String(product.Shortcut).trim() : null,
    groupName: product?.GroupName ? String(product.GroupName).trim() : null,
    preview: product?.Preview ? String(product.Preview).trim() : '',
    priceCzk: parsePriceCzk(product),
    priceText: product?.PriceTxt ? String(product.PriceTxt).trim() : null,
    collection: product?.Collection || null,
    url: product?.Url || null,
    subMethods: Array.isArray(product?.SubMethods) ? product.SubMethods.map(method => ({
      name: method?.Name || null,
      shortcut: method?.Shortcut || null,
      collection: method?.Collection || null,
    })) : [],
    searchableText: normalizeSearchText(fields.join(' ')),
    source: LABSHOP_CATALOGUE_SOURCE,
    raw: product,
  };
}

function extractDataSourceProducts(html) {
  const text = String(html || '');
  const divStart = text.search(/<div\b[^>]*\bid=["']vysetreniView["'][^>]*>/i);
  if (divStart < 0) return null;
  const tagEnd = text.indexOf('>', divStart);
  if (tagEnd < 0) return null;
  const tag = text.slice(divStart, tagEnd + 1);
  const attr = 'data-source-products';
  const attrIdx = tag.toLowerCase().indexOf(attr);
  if (attrIdx < 0) return null;
  let i = attrIdx + attr.length;
  while (/\s/.test(tag[i] || '')) i += 1;
  if (tag[i] !== '=') return null;
  i += 1;
  while (/\s/.test(tag[i] || '')) i += 1;
  const quote = tag[i];
  if (quote !== '"' && quote !== "'") return null;
  i += 1;
  let out = '';
  while (i < tag.length) {
    if (tag[i] === quote) return out;
    out += tag[i];
    i += 1;
  }
  return null;
}

export function parseLabshopEmbeddedCatalogue(html) {
  const rawAttr = extractDataSourceProducts(html);
  if (!rawAttr) return [];
  let parsed;
  try {
    parsed = JSON.parse(decodeHtmlEntities(rawAttr));
  } catch (err) {
    console.warn('Failed to parse Labshop embedded catalogue', err);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeLabshopCatalogueProduct).filter(Boolean);
}

export async function fetchLabshopCatalogue(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetchLabshopCatalogue requires fetch');
  const baseUrl = String(options.baseUrl || 'https://www.labshop.cz').replace(/\/$/, '');
  const url = `${baseUrl}${LABSHOP_CATALOGUE_PATH}`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml' },
    credentials: 'omit',
  });
  if (!response?.ok) throw new Error(`Labshop catalogue returned ${response?.status || 'network_error'}`);
  return parseLabshopEmbeddedCatalogue(await response.text());
}

const LABSHOP_MARKER_SEARCH_SYNONYMS = Object.freeze({
  // Labshop abbreviates these public catalogue rows; keep provider naming quirks
  // in the provider adapter, not in the stable marker ontology.
  'thyroid.totalT4': ['t4'],
  'thyroid.totalT3': ['t3'],
  'vitamins.holotranscobalamin': ['vitamin akt b12', 'aktivni vitamin b12', 'active b12', 'ab12'],
  'vitamins.vitaminD': ['vitamin d celkovy', 'vitamin d3', 'd3', 's vitd', 'vitd'],
  'hormones.totalTestosterone': ['testosteron', 's testosteron'],
  'hormones.freeTestosterone': ['testosteron volny', 'volny testosteron', 's ftst', 'ftst'],
  'metabolism.insulin': ['insulin', 's ins'],
  'biochemistry.glucose': ['glukoza', 's glu'],
  'diabetes.hba1c': ['hba1c', 'hb a1c', 'glykovany hemoglobin', 'b hba1c'],
  'inflammation.hsCRP': ['hs crp'],
  'biochemistry.uricAcid': ['kyselina mocova', 's km'],
  'biochemistry.creatinine': ['kreatinin ckd epi', 's krea'],
  'metabolism.fructosamine': ['fruktozamin', 'fruktozamin s fruk', 'fruktozamin s fruk diabetes mellitus', 'fruktosamin', 'fruk', 's fruk'],
  'kidney.egfr': ['kreatinin ckd epi', 'ckd epi'],
  'minerals.calcium': ['vapnik', 's ca', 'kalcium'],
  'minerals.rbcMagnesium': ['horcik v erytrocytech', 'b mgery', 'mgery'],
  'electrolytes.zinc': ['zinek', 's zn'],
  'electrolytes.copper': ['med', 's cu'],
  'electrolytes.phosphorus': ['fosfor', 's p'],
  'electrolytes.selenium': ['selen', 's se'],
  'hormones.pth': ['pth 1 84', 's pth 1 84'],
  'thyroid.tpoAb': ['a tpo', 'atpo'],
  'thyroid.tgAb': ['a tg', 'atg'],
  'thyroid.tshReceptorAb': ['a tshr', 'atshr', 'a tsh'],
  'lipids.cholesterol': ['cholesterol', 's chol', 'total cholesterol', 'celkovy cholesterol'],
  'lipids.triglycerides': ['triacylglyceroly', 'triglyceridy', 'triglycerides', 's tag', 'tag'],
  'lipids.ldl': ['ldl cholesterol', 'ldl-cholesterol', 's ldl'],
  'lipids.hdl': ['hdl cholesterol', 'hdl-cholesterol', 's hdl'],
  'lipids.apoB': ['apo b', 'apob', 'apolipoprotein b', 's apo b'],
  'lipids.apoAI': ['apo a1', 'apo ai', 'apoa1', 'apoai', 'apolipoprotein a1', 'apolipoprotein ai', 's apo a1'],
  'lipids.lpa': ['lp a', 'lp(a)', 'lpa', 'lipoprotein a', 'lipoprotein(a)', 's lp a'],
  'proteins.albumin': ['albumin', 's alb'],
  'liver.bilirubinTotal': ['bilirubin', 'bilirubin celkovy', 'total bilirubin', 's bil'],
});

export function findLabshopCatalogueMatches(markerIntents = [], catalogueItems = []) {
  return findProviderCatalogueMatches(markerIntents, catalogueItems, {
    synonymMap: LABSHOP_MARKER_SEARCH_SYNONYMS,
  });
}
