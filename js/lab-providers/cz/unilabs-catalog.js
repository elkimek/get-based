// cz/unilabs-catalog.js — Unilabs Online configurator catalogue adapter.
//
// Unilabs exposes its custom-test catalogue as server-rendered HTML on
// /sestavte-si-vlastni-vysetreni. Product rows carry data-id plus an AJAX
// add-product href. This module keeps provider scraping/matching outside the
// stable getbased marker ontology.

import {
  findProviderCatalogueMatches,
  normalizeSearchText,
} from '../provider-catalog-matcher.js';

export const UNILABS_PROVIDER_ID = 'cz.unilabs';
export const UNILABS_CONFIGURATOR_URL = 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni';
export const UNILABS_CONFIGURATOR_SOURCE = 'unilabs_online_configurator_html';

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function cleanText(value) {
  return decodeHtmlEntities(stripTags(value)).replace(/\s+/g, ' ').trim();
}

function parsePriceCzk(value) {
  const text = String(value || '').replace(/\s+/g, '');
  const match = text.match(/(\d+(?:[,.]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function normalizeUnilabsCatalogueProduct(product) {
  const providerProductId = String(product?.id || product?.providerProductId || product?.productId || '').trim();
  if (!providerProductId) return null;
  const name = String(product?.name || '').trim();
  const description = String(product?.description || '').trim();
  const priceText = String(product?.priceText || '').trim();
  const fields = [name, description].filter(Boolean);
  return {
    providerId: UNILABS_PROVIDER_ID,
    providerProductId,
    name,
    description,
    category: product?.category ? String(product.category) : null,
    priceCzk: product?.priceCzk ?? parsePriceCzk(priceText),
    priceText: priceText || null,
    addProductPath: product?.addProductPath || product?.href || null,
    searchableText: normalizeSearchText(fields.join(' ')),
    source: product?.source || UNILABS_CONFIGURATOR_SOURCE,
    raw: product,
  };
}

function extractRowBlocks(html) {
  const text = String(html || '');
  const starts = [...text.matchAll(/<div\s+data-id="\d+"\s+data-category="[^"]*"\s+class="product-configurator-item">/g)].map(m => m.index);
  return starts.map((start, idx) => text.slice(start, idx + 1 < starts.length ? starts[idx + 1] : text.length));
}

export function parseUnilabsConfiguratorCatalogue(html) {
  const rows = [];
  for (const block of extractRowBlocks(html)) {
    const id = block.match(/data-id="(\d+)"/)?.[1];
    const category = block.match(/data-category="([^"]*)"/)?.[1] || null;
    const name = block.match(/<div class="product-configurator-item__text">\s*<strong><strong>(.*?)<\/strong><\/strong>/s)?.[1] || '';
    const description = block.match(/<div class="product-configurator-item__text">.*?<\/strong><\/strong>\s*<div>(.*?)<\/div>/s)?.[1] || '';
    const priceText = block.match(/<div class="product-configurator-item__price">\s*(.*?)\s*<\/div>/s)?.[1] || '';
    const href = decodeHtmlEntities(block.match(/href="([^"]*do=AddProduct[^"]*)"/)?.[1] || '');
    const item = normalizeUnilabsCatalogueProduct({
      id,
      category,
      name: cleanText(name),
      description: cleanText(description),
      priceText: cleanText(priceText),
      addProductPath: href,
      source: UNILABS_CONFIGURATOR_SOURCE,
    });
    if (item) rows.push(item);
  }
  return [...new Map(rows.map(row => [row.providerProductId, row])).values()];
}

export async function fetchUnilabsConfiguratorCatalogue(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetchUnilabsConfiguratorCatalogue requires fetch');
  const url = options.url || UNILABS_CONFIGURATOR_URL;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0' },
    credentials: 'omit',
  });
  if (!response?.ok) throw new Error(`Unilabs configurator returned ${response?.status || 'network_error'}`);
  return parseUnilabsConfiguratorCatalogue(await response.text());
}

const UNILABS_MARKER_SEARCH_SYNONYMS = Object.freeze({
  'hormones.totalTestosterone': ['test na testosteron', 'testosteron', 'tst'],
  'hormones.estradiol': ['estradiol', 'estradiol e2'],
  'hormones.lh': ['lh luteinizacni hormon', 'luteinizacni hormon', 'lh'],
  'hormones.fsh': ['fsh folikulostimulacni hormon', 'folikulostimulacni hormon', 'fsh'],
  'metabolism.insulin': ['inzulin', 'insulin'],
  'biochemistry.glucose': ['glukoza', 'glucose'],
  'liver.alt': ['alt', 'alaninaminotransferaza'],
  'liver.ast': ['ast', 'aspartataminotransferaza'],
  'liver.ggt': ['ggt', 'gama glutamyltransferaza', 'gamma glutamyltransferase'],
  // Unilabs currently exposes CRP in the configurator. Treat this as the
  // provider's closest available CRP row for hs-CRP intent, with confidence in
  // the provider catalogue name; the UI still shows the exact product name.
  'inflammation.hsCRP': ['crp test', 'c reaktivni protein', 'crp'],
  'biochemistry.uricAcid': ['kyselina mocova', 'uric acid'],
  'biochemistry.creatinine': ['kreatinin', 'creatinine'],
  'minerals.calcium': ['vapnik kalcium calcium ca', 'vapnik', 'kalcium', 'calcium'],
  'electrolytes.zinc': ['zinek zincum zn', 'zinek', 'zincum', 'zinc'],
  'electrolytes.copper': ['med cuprum cu', 'med', 'cuprum', 'copper'],
  'electrolytes.phosphorus': ['fosfor phosphorus p', 'fosfor', 'phosphorus'],
  'coagulation.homocysteine': ['homocystein', 'homocysteine', 'hcy'],
  'vitamins.folate': ['kyselina listova folat vitamin b9', 'kyselina listova', 'folat'],
  'vitamins.vitaminB12': ['vitamin b12', 'vitamin b12'],
  'vitamins.holotranscobalamin': ['test na aktivni vitamin b12', 'aktivni vitamin b12', 'active b12'],
  'thyroid.tsh': ['tsh hormon stimulujici stitnou zlazu', 'tsh'],
  'thyroid.freeT4': ['ft4', 'f t4', 't4 volny'],
  'thyroid.freeT3': ['ft3', 'f t3', 't3 volny'],
  'diabetes.hba1c': ['hba1c', 'hb a1c', 'glykovany hemoglobin'],
  'lipids.cholesterol': ['test na cholesterol', 'cholesterol', 'total cholesterol', 'celkovy cholesterol'],
  'lipids.triglycerides': ['triacylglyceroly', 'triglyceridy', 'triglycerides'],
  'lipids.ldl': ['ldl cholesterol', 'ldl lipoproteiny', 'ldl'],
  'lipids.hdl': ['hdl cholesterol', 'hdl'],
  'lipids.apoB': ['test na apolipoprotein b apo b', 'apolipoprotein b', 'apo b', 'apob'],
  'lipids.apoAI': ['test na apolipoprotein a1 apo a1', 'apolipoprotein a1', 'apo a1', 'apo ai', 'apoa1'],
  'proteins.albumin': ['albumin'],
  'liver.bilirubinTotal': ['bilirubin', 'total bilirubin', 'celkovy bilirubin'],
});

export function findUnilabsCatalogueMatches(markerIntents = [], catalogueItems = []) {
  return findProviderCatalogueMatches(markerIntents, catalogueItems, {
    synonymMap: UNILABS_MARKER_SEARCH_SYNONYMS,
  });
}
