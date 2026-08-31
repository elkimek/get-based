// @ts-check
import { SPECIALTY_MARKER_DEFS } from './adapters.js';

const UNIT = 'mmol/mol creatinine';
/** @type {[string, string, string, string, number, number][]} */
const SECTION_ROWS = [
  ['yeastFungal', 'Yeast and Fungal Markers', '🍄', 'oatMicrobial', 0, 9],
  ['bacterial', 'Bacterial Markers', '🦠', 'oatMicrobial', 9, 14],
  ['clostridia', 'Clostridia Bacterial Markers', '🦠', 'oatMicrobial', 14, 18],
  ['oxalate', 'Oxalate Metabolites', '🧪', 'oatMetabolic', 0, 3],
  ['glycolytic', 'Glycolytic Metabolites', '⚗️', 'oatMetabolic', 3, 5],
  ['mitochondrial', 'Mitochondrial Markers', '⚗️', 'oatMetabolic', 5, 14],
  ['neurotransmitters', 'Neurotransmitter Metabolites', '🧠', 'oatNeuro', 0, 8],
  ['pyrimidine', 'Pyrimidine Metabolites - Folate Metabolism', '🧬', 'oatNeuro', 8, 10],
  ['ketoneFatty', 'Ketone and Fatty Acid Oxidation', '🔬', 'oatAminoFatty', 0, 7],
  ['nutritional', 'Nutritional Markers', '🌿', 'oatNutritional', 0, 8],
  ['detoxification', 'Indicators of Detoxification', '🔥', 'oatNutritional', 8, 12],
  ['aminoAcid', 'Amino Acid Metabolites', '🧬', 'oatAminoFatty', 7, 21],
  ['mineral', 'Mineral Metabolism', '⚖️', 'oatAminoFatty', 21, 22],
];

export const MOSAIC_OAT_SECTIONS = Object.fromEntries([
  ...SECTION_ROWS.map(([key, label, icon]) => [key, { prefix: `mosaicOat${key[0].toUpperCase()}${key.slice(1)}`, label, icon }]),
  ['fluidIntake', { prefix: 'mosaicOatFluidIntake', label: 'Indicator of Fluid Intake', icon: '💧' }],
]);

const SPECIAL_ALIASES = {
  furancarbonylglycine: '2-Furoylglycine', hva: 'Homovanillic (HVA)|HVA',
  vma: 'Vanillylmandelic (VMA)|Vanillmandelic Acid (VMA)|VMA', dopac: 'Dihydroxyphenylacetic (DOPAC)|DOPAC',
  hiaa5: '5-Hydroxyindoleacetic (5-HIAA)|5-HIAA', hmg: '3-OH-3-Methylglutaric Acid',
};

function reportStyleName(name) {
  return name.replace(/\s+Acid(?=\s*(?:\(|$))/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const analytes = SECTION_ROWS.flatMap(([section, , , source, start, end]) =>
  Object.entries(SPECIALTY_MARKER_DEFS).filter(([key]) => key.startsWith(`${source}.`)).slice(start, end)
    .map(([key, def]) => {
      const markerPart = key.split('.')[1];
      const name = def.name;
      const aliases = [name, reportStyleName(name), ...(SPECIAL_ALIASES[markerPart] || '').split('|')].filter(Boolean);
      return { section, markerPart, name, aliases };
    }));

export const MOSAIC_OAT_ANALYTES = analytes.map((analyte, index) => ({ number: index + 1, ...analyte }));
const ALIASES = new Map();
const PARTS = new Map();
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const analyte of MOSAIC_OAT_ANALYTES) {
  PARTS.set(analyte.markerPart.toLowerCase(), analyte);
  for (const alias of analyte.aliases) ALIASES.set(normalized(alias), analyte);
}

export function findMosaicOatAnalyte(markerPart, ...labels) {
  const direct = PARTS.get(String(markerPart || '').toLowerCase());
  if (direct) return direct;
  for (const label of labels) {
    const match = ALIASES.get(normalized(label));
    if (match) return match;
  }
  return null;
}

const MOAT_PARTS = new Set([
  ...MOSAIC_OAT_ANALYTES.slice(0, 18).map(analyte => analyte.markerPart),
  'hmg', 'hydroxyhippuric2', 'urineCreatinine',
]);

export function mosaicMoatSectionLabel(markerPart) {
  if (markerPart === 'urineCreatinine') return 'Indicator of Fluid Intake';
  if (markerPart === 'hmg' || markerPart === 'hydroxyhippuric2') return 'Additional Indicators';
  const analyte = findMosaicOatAnalyte(markerPart);
  return analyte ? MOSAIC_OAT_SECTIONS[analyte.section].label : 'Other Results';
}

export const MOSAIC_OAT_MARKERS = Object.fromEntries(MOSAIC_OAT_ANALYTES.map(analyte => {
  const section = MOSAIC_OAT_SECTIONS[analyte.section];
  return [`${section.prefix}.${analyte.markerPart}`, {
    name: analyte.name, unit: analyte.markerPart.endsWith('Ratio') ? '' : UNIT, refMin: null, refMax: null,
    categoryLabel: `Mosaic OAT: ${section.label}`, icon: section.icon, group: 'Mosaic OAT',
  }];
}));
MOSAIC_OAT_MARKERS['mosaicOatFluidIntake.urineCreatinine'] = {
  name: 'Creatinine (Urine)', unit: 'mg/dL', refMin: null, refMax: null,
  categoryLabel: 'Mosaic OAT: Indicator of Fluid Intake', icon: '💧', group: 'Mosaic OAT',
};

export const MOSAIC_MOAT_MARKERS = Object.fromEntries([...MOAT_PARTS].map(markerPart => {
  const analyte = findMosaicOatAnalyte(markerPart);
  return [`mosaicMoat.${markerPart}`, {
    name: analyte?.name || 'Creatinine (Urine)', unit: markerPart === 'urineCreatinine' ? 'mg/dL' : UNIT,
    refMin: null, refMax: null, categoryLabel: `Mosaic MOAT: ${mosaicMoatSectionLabel(markerPart)}`,
    icon: '🦠', group: 'Mosaic MOAT',
  }];
}));
