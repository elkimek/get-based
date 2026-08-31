// @ts-check
// Product-safe organic-acid normalization, loaded only with the PDF importer.

import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { findMosaicOatAnalyte, mosaicMoatSectionLabel, MOSAIC_OAT_SECTIONS } from './mosaic-oat-catalog.js';

const SAFE_MARKER_PART_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const OAT_SECTIONS = {
  oatMicrobial: ['Microbial', 'Microbial Overgrowth'],
  oatMetabolic: ['Mitochondrial', 'Mitochondrial Health'],
  oatNeuro: ['Neurotransmitters', 'Neurotransmitter Metabolites'],
  oatNutritional: ['Nutritional', 'Nutrient Needs & Detoxification'],
  oatAminoFatty: ['AminoFatty', 'Fatty Acid & Amino Acid Metabolism'],
  oxidativeStress: ['OxidativeStress', 'Oxidative Stress'],
  urineAmino: ['AminoAcids', 'Amino Acids'],
  urineAminoMetab: ['AminoMetabolites', 'Amino Acid Metabolites'],
  toxicElements: ['ToxicElements', 'Toxic Elements'],
  nutrientElements: ['NutrientElements', 'Nutrient Elements'],
};
const OAT_SECTION_LABELS = Object.fromEntries(Object.values(OAT_SECTIONS));

function markerPart(value) {
  const words = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const key = words.map((word, index) => {
    const normalized = index === 0 && /^[0-9]/.test(word) ? `n${word}` : word;
    return index ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }).join('');
  return SAFE_MARKER_PART_RE.test(key) ? key : '';
}

function markerSource(marker) {
  const [category = '', keyPart = ''] = String(marker.mappedKey || marker.suggestedKey || '').split('.');
  return {
    category,
    markerPart: SAFE_MARKER_PART_RE.test(keyPart) ? keyPart : markerPart(marker.rawName || marker.suggestedName),
  };
}

function catalogMarkerSource(marker, group) {
  const labels = [marker.rawName, marker.suggestedName].filter(Boolean)
    .map(label => markerPart(String(label).replace(/\s*\([^)]*\)\s*/g, ' '))).filter(Boolean);
  if (!labels.length) return null;
  for (const [key, def] of Object.entries(SPECIALTY_MARKER_DEFS)) {
    if (def.group !== group) continue;
    const catalogLabel = markerPart(String(def.name || '').replace(/\s*\([^)]*\)\s*/g, ' '));
    if (!labels.includes(catalogLabel)) continue;
    const [category, keyPart] = key.split('.');
    return { category, markerPart: keyPart };
  }
  return null;
}

function scopeMarker(marker, prefix, keyPart, label, group, suggestedName) {
  if (!prefix || !keyPart) return;
  const originalDef = SPECIALTY_MARKER_DEFS[marker.mappedKey || marker.suggestedKey];
  marker.mappedKey = null;
  marker.suggestedKey = `${prefix}.${keyPart}`;
  marker.suggestedName ||= suggestedName || originalDef?.name || marker.rawName;
  marker.suggestedCategoryLabel = label;
  marker.suggestedGroup = group;
}

function safeLabPrefix(value) {
  const words = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const prefix = words.map((word, index) => index
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : word.charAt(0).toLowerCase() + word.slice(1)).join('').slice(0, 48);
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(prefix) ? prefix : '';
}

function oatProductFromLabName(labName) {
  const clean = String(labName || '').trim();
  const lower = clean.toLowerCase();
  if (/mosaic|great plains/.test(lower)) {
    return /\bmoat\b|microbial organic acids?/.test(lower)
      ? { prefix: 'mosaicMoat', label: 'Mosaic MOAT', group: 'Mosaic MOAT', kind: 'moat' }
      : { prefix: 'mosaicOat', label: 'Mosaic OAT', group: 'Mosaic OAT', kind: 'oat' };
  }
  if (!clean || /^(unknown|oat|organic acids?(?: test)?|laboratory|lab)$/i.test(clean)) {
    return { prefix: 'organicAcids', label: 'Organic Acids Test', group: 'Organic Acids', kind: 'oat' };
  }
  const prefixSource = clean.replace(/\borganic acids? test\b|\boat\b/gi, '').trim() || clean;
  const label = /\boat\b|organic acids?/i.test(clean) ? clean : `${clean} OAT`;
  return { prefix: `${safeLabPrefix(prefixSource) || 'organicAcids'}Oat`, label, group: label, kind: 'oat' };
}

function normalizeOatProduct(markers, detectedProduct, labName) {
  const product = detectedProduct || oatProductFromLabName(labName);
  for (const marker of markers) {
    let { category, markerPart } = markerSource(marker);
    if (product.prefix === 'mosaicOat' || product.kind === 'moat') {
      const analyte = findMosaicOatAnalyte(markerPart, marker.rawName, marker.suggestedName);
      const isCreatinine = markerPart === 'urineCreatinine'
        || /\bcreatinine\b/i.test(`${marker.rawName || ''} ${marker.suggestedName || ''}`);
      if (product.kind === 'moat') {
        const keyPart = analyte?.markerPart || (isCreatinine ? 'urineCreatinine' : markerPart);
        const sectionLabel = mosaicMoatSectionLabel(keyPart);
        scopeMarker(marker, 'mosaicMoat', keyPart, `Mosaic MOAT: ${sectionLabel}`, 'Mosaic MOAT', analyte?.name);
        continue;
      }
      if (analyte) {
        const section = MOSAIC_OAT_SECTIONS[analyte.section];
        scopeMarker(marker, section.prefix, analyte.markerPart, `Mosaic OAT: ${section.label}`, 'Mosaic OAT', analyte.name);
        continue;
      }
      if (isCreatinine) {
        const section = MOSAIC_OAT_SECTIONS.fluidIntake;
        scopeMarker(marker, section.prefix, 'urineCreatinine', `Mosaic OAT: ${section.label}`, 'Mosaic OAT', 'Creatinine (Urine)');
        continue;
      }
    }
    if (!OAT_SECTIONS[category] && !category.startsWith(product.prefix)) {
      const catalogSource = catalogMarkerSource(marker, 'OAT');
      if (catalogSource) ({ category, markerPart } = catalogSource);
    }
    let [suffix, sectionLabel] = OAT_SECTIONS[category] || [];
    if (!suffix && category.startsWith(product.prefix)) {
      suffix = category.slice(product.prefix.length);
      sectionLabel = OAT_SECTION_LABELS[suffix];
    }
    suffix ||= 'OrganicAcids';
    sectionLabel ||= 'Organic Acids';
    const prefix = product.prefix === 'organicAcids' && suffix === 'OrganicAcids' ? product.prefix : `${product.prefix}${suffix}`;
    scopeMarker(marker, prefix, markerPart, `${product.label}: ${sectionLabel}`, product.group);
  }
}

const METABOLOMIX_LABELS = {
  metabolomixDysbiosis: 'Malabsorption & Dysbiosis',
  metabolomixVitamins: 'Vitamin Markers',
  metabolomixBranchedChain: 'Branched-Chain Catabolites',
  metabolomixMitochondrial: 'Cellular Energy & Mitochondrial',
  metabolomixNeurotransmitters: 'Neurotransmitter Metabolites',
  metabolomixDetox: 'Toxin & Detoxification',
  metabolomixOrganicAcids: 'Organic Acids',
  metabolomixOxidativeStress: 'Oxidative Stress',
  metabolomixAminoAcids: 'Amino Acids',
  metabolomixAminoMetabolites: 'Amino Acid Metabolites',
  metabolomixFA: 'Essential & Metabolic Fatty Acids',
  metabolomixToxicElements: 'Toxic Elements',
  metabolomixNutrientElements: 'Nutrient Elements',
};
const METABOLOMIX_SOURCE_CATEGORIES = {
  oatMicrobial: 'metabolomixDysbiosis',
  oatMetabolic: 'metabolomixMitochondrial',
  oatNeuro: 'metabolomixNeurotransmitters',
  oxidativeStress: 'metabolomixOxidativeStress',
  urineAmino: 'metabolomixAminoAcids',
  urineAminoMetab: 'metabolomixAminoMetabolites',
  toxicElements: 'metabolomixToxicElements',
  nutrientElements: 'metabolomixNutrientElements',
};
const METABOLOMIX_DETOX = new Set(['pyroglutamic', 'hydroxybutyric2', 'orotic', 'ketophenylacetic', 'hydroxyisobutyric']);
const METABOLOMIX_BRANCH = new Set(['hydroxyisovaleric2', 'oxoisovaleric2', 'methyl2oxovaleric3', 'hydroxyisocaproic2', 'oxoisocaproic2', 'oxo4methiolbutyric2', 'isovalerylglycine', 'ketoadipic']);
const METABOLOMIX_MITO = new Set(['hydroxybutyric3', 'acetoacetic', 'ethylmalonic', 'methylsuccinic', 'adipic', 'suberic', 'sebacic']);

function metabolomixCategory(category, markerPart, marker) {
  if (METABOLOMIX_LABELS[category]) return category;
  const label = `${marker.rawName || ''} ${marker.suggestedName || ''} ${marker.suggestedCategoryLabel || ''}`;
  if (category === 'fattyAcids' || /omega|fatty|linole|palmit|stear|arachi|eicosa|docosa|oleic|\bepa\b|\bdha\b/i.test(label)) return 'metabolomixFA';
  if (category === 'oatNutritional') return METABOLOMIX_DETOX.has(markerPart) ? 'metabolomixDetox' : 'metabolomixVitamins';
  if (category === 'oatAminoFatty') {
    if (METABOLOMIX_BRANCH.has(markerPart)) return 'metabolomixBranchedChain';
    return METABOLOMIX_MITO.has(markerPart) ? 'metabolomixMitochondrial' : 'metabolomixOrganicAcids';
  }
  return METABOLOMIX_SOURCE_CATEGORIES[category] || 'metabolomixOrganicAcids';
}

function normalizeMetabolomixProduct(markers) {
  for (const marker of markers) {
    let { category, markerPart } = markerSource(marker);
    if (!METABOLOMIX_LABELS[category] && !OAT_SECTIONS[category] && category !== 'fattyAcids') {
      const catalogSource = catalogMarkerSource(marker, 'OAT') || catalogMarkerSource(marker, 'Fatty Acids');
      if (catalogSource) ({ category, markerPart } = catalogSource);
    }
    const target = metabolomixCategory(category, markerPart, marker);
    scopeMarker(marker, target, markerPart, `Metabolomix+: ${METABOLOMIX_LABELS[target]}`, 'Metabolomix+');
  }
}

export function normalizeProductScopedAdapterMarkers(adapter, markers, detectedProduct, labName, testType) {
  if (adapter?.id === 'metabolomix') normalizeMetabolomixProduct(markers);
  else if (adapter?.id === 'mosaicOat' || adapter?.id === 'oat') {
    let product = detectedProduct;
    if (!product && adapter.id === 'mosaicOat') {
      product = /(?:^|\s)moat$/i.test(String(testType || ''))
        ? { prefix: 'mosaicMoat', label: 'Mosaic MOAT', group: 'Mosaic MOAT', kind: 'moat' }
        : { prefix: 'mosaicOat', label: 'Mosaic OAT', group: 'Mosaic OAT', kind: 'oat' };
    }
    normalizeOatProduct(markers, product, labName);
  }
}
