// @ts-check
// adapters.js — Parser adapter registry for specialty lab products
//
// Each adapter provides a marker map and optional detection/normalization
// for a specific test type or product. The main AI pipeline uses adapters to:
// 1. Include adapter markers in buildMarkerReference() so AI can match them
// 2. Detect products from filename/text content
// 3. Post-process AI output (normalize keys, deduplicate, skip calculated)
//
// Adapter interface:
//   id:         unique string identifier
//   testTypes:  array of testType values this adapter handles
//   productScoped: true when the lazy import normalizer guarantees product-specific keys
//   products:   optional array of { patterns, prefix, label } for product detection
//   markers:    object of "category.markerKey" → { name, unit, refMin, refMax, categoryLabel, icon, group, singlePoint? }
//   detect:     optional (fileName, text) → { prefix, label } | null
//   normalize:  optional (markers, fileName, text, detectedProduct) → void (mutates markers array)
//   config:     { group, singlePoint } defaults for this adapter

import { MARKER_SCHEMA } from './schema.js';
import { isDebugMode } from './utils.js';

// ═══════════════════════════════════════════════
// Legacy organic-acid marker catalog. These keys remain available so existing
// profiles keep working, but new imports are normalized to product-specific
// categories below (Metabolomix+, Mosaic OAT/MOAT, or a lab-scoped OAT).
// ═══════════════════════════════════════════════
const OAT_MARKERS = {
  "oatMicrobial.citramalic": { name: "Citramalic Acid", unit: "mmol/mol creatinine", refMin: 0.11, refMax: 2, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hydroxymethylfuroic": { name: "5-Hydroxymethyl-2-furoic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 18, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.oxoglutaric3": { name: "3-Oxoglutaric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.11, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.furandicarboxylic": { name: "Furan-2,5-dicarboxylic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 13, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.furancarbonylglycine": { name: "Furancarbonylglycine", unit: "mmol/mol creatinine", refMin: null, refMax: 2.3, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.tartaric": { name: "Tartaric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 5.3, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.arabinose": { name: "Arabinose", unit: "mmol/mol creatinine", refMin: null, refMax: 20, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.carboxycitric": { name: "Carboxycitric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 20, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.tricarballylic": { name: "Tricarballylic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.58, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hippuric": { name: "Hippuric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 241, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hydroxyphenylacetic2": { name: "2-Hydroxyphenylacetic Acid", unit: "mmol/mol creatinine", refMin: 0.03, refMax: 0.47, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hydroxybenzoic4": { name: "4-Hydroxybenzoic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.73, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hydroxyhippuric4": { name: "4-Hydroxyhippuric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 14, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.dhppa": { name: "DHPPA (Beneficial Bacteria)", unit: "mmol/mol creatinine", refMin: null, refMax: 0.23, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hydroxyphenylacetic4": { name: "4-Hydroxyphenylacetic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 18, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hphpa": { name: "HPHPA", unit: "mmol/mol creatinine", refMin: null, refMax: 102, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.cresol4": { name: "4-Cresol", unit: "mmol/mol creatinine", refMin: null, refMax: 39, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.indoleacetic3": { name: "3-Indoleacetic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 6.8, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.urineCreatinine": { name: "Creatinine (Urine)", unit: "mg/dL", refMin: 20, refMax: 300, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.phenylacetic": { name: "Phenylacetic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.12, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.hydroxyphenylacetic3": { name: "3-Hydroxyphenylacetic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 8.1, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.benzoic": { name: "Benzoic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.05, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMicrobial.dArabinitol": { name: "D-Arabinitol", unit: "mmol/mol creatinine", refMin: null, refMax: 36, categoryLabel: "OAT: Microbial Overgrowth", icon: "\uD83E\uDDA0", group: "OAT" },
  "oatMetabolic.glyceric": { name: "Glyceric Acid", unit: "mmol/mol creatinine", refMin: 0.21, refMax: 4.9, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.glycolic": { name: "Glycolic Acid", unit: "mmol/mol creatinine", refMin: 18, refMax: 81, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.oxalic": { name: "Oxalic Acid", unit: "mmol/mol creatinine", refMin: 8.9, refMax: 67, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.lactic": { name: "Lactic Acid", unit: "mmol/mol creatinine", refMin: 0.74, refMax: 19, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.pyruvic": { name: "Pyruvic Acid", unit: "mmol/mol creatinine", refMin: 0.28, refMax: 6.7, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.succinic": { name: "Succinic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 5.3, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.fumaric": { name: "Fumaric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.49, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.malic": { name: "Malic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 1.1, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.oxoglutaric2": { name: "2-Oxoglutaric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 18, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.aconitic": { name: "Aconitic Acid", unit: "mmol/mol creatinine", refMin: 4.1, refMax: 23, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.citric": { name: "Citric Acid", unit: "mmol/mol creatinine", refMin: 2.2, refMax: 260, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.methylglutaric3": { name: "3-Methylglutaric Acid", unit: "mmol/mol creatinine", refMin: 0.02, refMax: 0.38, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.hydroxyglutaric3": { name: "3-Hydroxyglutaric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 4.6, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.methylglutaconic3": { name: "3-Methylglutaconic Acid", unit: "mmol/mol creatinine", refMin: 0.38, refMax: 2, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatMetabolic.isocitric": { name: "Isocitric Acid", unit: "mmol/mol creatinine", refMin: 22, refMax: 65, categoryLabel: "OAT: Metabolic", icon: "\u2697\uFE0F", group: "OAT" },
  "oatNeuro.hva": { name: "HVA (Homovanillic Acid)", unit: "mmol/mol creatinine", refMin: 0.39, refMax: 2.2, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.vma": { name: "VMA (Vanillylmandelic Acid)", unit: "mmol/mol creatinine", refMin: 0.53, refMax: 2.2, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.hvaVmaRatio": { name: "HVA/VMA Ratio", unit: "", refMin: 0.32, refMax: 1.4, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.dopac": { name: "DOPAC (Dihydroxyphenylacetic)", unit: "mmol/mol creatinine", refMin: 0.27, refMax: 1.9, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.hvaDopacRatio": { name: "HVA/DOPAC Ratio", unit: "", refMin: 0.17, refMax: 1.6, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.hiaa5": { name: "5-HIAA (5-Hydroxyindoleacetic)", unit: "mmol/mol creatinine", refMin: null, refMax: 2.9, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.quinolinic": { name: "Quinolinic Acid", unit: "mmol/mol creatinine", refMin: 0.52, refMax: 2.4, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.kynurenic": { name: "Kynurenic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 1.8, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.uracil": { name: "Uracil", unit: "mmol/mol creatinine", refMin: null, refMax: 6.9, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.thymine": { name: "Thymine", unit: "mmol/mol creatinine", refMin: null, refMax: 0.36, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.xanthurenic": { name: "Xanthurenic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.96, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.mhpg": { name: "MHPG (3-Methyl-4-OH-Phenylglycol)", unit: "mmol/mol creatinine", refMin: 0.02, refMax: 0.22, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNeuro.kynurenicQuinolinicRatio": { name: "Kynurenic/Quinolinic Ratio", unit: "", refMin: 0.44, refMax: null, categoryLabel: "OAT: Neurotransmitters", icon: "\uD83E\uDDE0", group: "OAT" },
  "oatNutritional.methylmalonic": { name: "Methylmalonic Acid (B12)", unit: "mmol/mol creatinine", refMin: null, refMax: 2.3, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.pyridoxic": { name: "Pyridoxic Acid (B6)", unit: "mmol/mol creatinine", refMin: null, refMax: 26, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.pantothenic": { name: "Pantothenic Acid (B5)", unit: "mmol/mol creatinine", refMin: null, refMax: 5.4, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.glutaric": { name: "Glutaric Acid (B2)", unit: "mmol/mol creatinine", refMin: null, refMax: 0.43, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.ascorbic": { name: "Ascorbic Acid (Vitamin C)", unit: "mmol/mol creatinine", refMin: 10, refMax: 200, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.hmg": { name: "3-Hydroxy-3-methylglutaric (CoQ10)", unit: "mmol/mol creatinine", refMin: null, refMax: 26, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.nac": { name: "N-Acetylcysteine (NAC)", unit: "mmol/mol creatinine", refMin: null, refMax: 0.13, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.methylcitric": { name: "Methylcitric Acid (Biotin)", unit: "mmol/mol creatinine", refMin: 0.15, refMax: 1.7, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.pyroglutamic": { name: "Pyroglutamic Acid", unit: "mmol/mol creatinine", refMin: 5.7, refMax: 25, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.hydroxybutyric2": { name: "2-Hydroxybutyric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 1.2, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.orotic": { name: "Orotic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.46, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.hydroxyhippuric2": { name: "2-Hydroxyhippuric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.86, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.figlu": { name: "FIGLU (Formiminoglutamic Acid)", unit: "mmol/mol creatinine", refMin: null, refMax: 1.5, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.hydroxypropionic3": { name: "3-Hydroxypropionic Acid", unit: "mmol/mol creatinine", refMin: 5, refMax: 22, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.hydroxyisovaleric3": { name: "3-Hydroxyisovaleric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 29, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.ketophenylacetic": { name: "\u03b1-Ketophenylacetic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.46, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatNutritional.hydroxyisobutyric": { name: "\u03b1-Hydroxyisobutyric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 6.7, categoryLabel: "OAT: Nutritional & Detox", icon: "\uD83C\uDF3F", group: "OAT" },
  "oatAminoFatty.hydroxybutyric3": { name: "3-Hydroxybutyric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 1.9, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.acetoacetic": { name: "Acetoacetic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 10, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.ethylmalonic": { name: "Ethylmalonic Acid", unit: "mmol/mol creatinine", refMin: 0.13, refMax: 2.7, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.methylsuccinic": { name: "Methylsuccinic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2.3, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.adipic": { name: "Adipic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2.9, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.suberic": { name: "Suberic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 1.9, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.sebacic": { name: "Sebacic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 0.14, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.hydroxyisovaleric2": { name: "2-Hydroxyisovaleric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.oxoisovaleric2": { name: "2-Oxoisovaleric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.methyl2oxovaleric3": { name: "3-Methyl-2-oxovaleric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.hydroxyisocaproic2": { name: "2-Hydroxyisocaproic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.oxoisocaproic2": { name: "2-Oxoisocaproic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.oxo4methiolbutyric2": { name: "2-Oxo-4-methiolbutyric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.mandelic": { name: "Mandelic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.phenyllactic": { name: "Phenyllactic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.phenylpyruvic": { name: "Phenylpyruvic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.homogentisic": { name: "Homogentisic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.hydroxyphenyllactic4": { name: "4-Hydroxyphenyllactic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 2, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.nAcetylaspartic": { name: "N-Acetylaspartic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 38, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.malonic": { name: "Malonic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 9.9, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.hydroxybutyric4": { name: "4-Hydroxybutyric Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 4.3, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.phosphoric": { name: "Phosphoric Acid", unit: "mmol/mol creatinine", refMin: 1000, refMax: 4900, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.isovalerylglycine": { name: "Isovalerylglycine", unit: "mmol/mol creatinine", refMin: null, refMax: 3.7, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oatAminoFatty.ketoadipic": { name: "\u03b1-Ketoadipic Acid", unit: "mmol/mol creatinine", refMin: null, refMax: 1.7, categoryLabel: "OAT: Amino Acids & Lipids", icon: "\uD83D\uDD2C", group: "OAT" },
  "oxidativeStress.lipidPeroxides": { name: "Lipid Peroxides (Urine)", unit: "\u00b5mol/g creatinine", refMin: null, refMax: 10, categoryLabel: "Oxidative Stress", icon: "\uD83D\uDD25", group: "OAT" },
  "oxidativeStress.ohdg8": { name: "8-OHdG (Urine)", unit: "mcg/g creatinine", refMin: null, refMax: 15, categoryLabel: "Oxidative Stress", icon: "\uD83D\uDD25", group: "OAT" },
  "urineAmino.arginine": { name: "Arginine", unit: "\u00b5mol/g creatinine", refMin: 3, refMax: 33, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.histidine": { name: "Histidine", unit: "\u00b5mol/g creatinine", refMin: 127, refMax: 800, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.isoleucine": { name: "Isoleucine", unit: "\u00b5mol/g creatinine", refMin: 3, refMax: 28, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.leucine": { name: "Leucine", unit: "\u00b5mol/g creatinine", refMin: 4, refMax: 46, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.lysine": { name: "Lysine", unit: "\u00b5mol/g creatinine", refMin: 11, refMax: 175, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.methionine": { name: "Methionine", unit: "\u00b5mol/g creatinine", refMin: 2, refMax: 18, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.phenylalanine": { name: "Phenylalanine", unit: "\u00b5mol/g creatinine", refMin: 8, refMax: 71, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.taurine": { name: "Taurine", unit: "\u00b5mol/g creatinine", refMin: 21, refMax: 424, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.threonine": { name: "Threonine", unit: "\u00b5mol/g creatinine", refMin: 12, refMax: 123, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.tryptophan": { name: "Tryptophan", unit: "\u00b5mol/g creatinine", refMin: 5, refMax: 53, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.valine": { name: "Valine", unit: "\u00b5mol/g creatinine", refMin: 7, refMax: 49, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.alanine": { name: "Alanine", unit: "\u00b5mol/g creatinine", refMin: 63, refMax: 295, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.asparagine": { name: "Asparagine", unit: "\u00b5mol/g creatinine", refMin: 25, refMax: 119, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.asparticAcid": { name: "Aspartic Acid", unit: "\u00b5mol/g creatinine", refMin: null, refMax: 14, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.cysteine": { name: "Cysteine", unit: "\u00b5mol/g creatinine", refMin: 8, refMax: 74, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.cystine": { name: "Cystine", unit: "\u00b5mol/g creatinine", refMin: 10, refMax: 104, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.gaba": { name: "GABA", unit: "\u00b5mol/g creatinine", refMin: null, refMax: 5, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.glutamicAcid": { name: "Glutamic Acid", unit: "\u00b5mol/g creatinine", refMin: 4, refMax: 27, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.glutamine": { name: "Glutamine", unit: "\u00b5mol/g creatinine", refMin: 110, refMax: 528, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.proline": { name: "Proline", unit: "\u00b5mol/g creatinine", refMin: 1, refMax: 13, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAmino.tyrosine": { name: "Tyrosine", unit: "\u00b5mol/g creatinine", refMin: 11, refMax: 135, categoryLabel: "Urine Amino Acids", icon: "\uD83E\uDDEC", group: "OAT" },
  "urineAminoMetab.aminoadipic": { name: "\u03b1-Aminoadipic Acid", unit: "\u00b5mol/g creatinine", refMin: 2, refMax: 47, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.aminoNbutyric": { name: "\u03b1-Amino-N-butyric Acid", unit: "\u00b5mol/g creatinine", refMin: 2, refMax: 25, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.aminoisobutyric": { name: "\u03b2-Aminoisobutyric Acid", unit: "\u00b5mol/g creatinine", refMin: 11, refMax: 160, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.cystathionine": { name: "Cystathionine", unit: "\u00b5mol/g creatinine", refMin: 2, refMax: 68, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.citrulline": { name: "Citrulline", unit: "\u00b5mol/g creatinine", refMin: 0.6, refMax: 3.9, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.ornithine": { name: "Ornithine", unit: "\u00b5mol/g creatinine", refMin: 2, refMax: 21, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.urea": { name: "Urea", unit: "mg/g creatinine", refMin: 168, refMax: 465, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.glycine": { name: "Glycine", unit: "\u00b5mol/g creatinine", refMin: 95, refMax: 683, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.serine": { name: "Serine", unit: "\u00b5mol/g creatinine", refMin: 40, refMax: 163, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.ethanolamine": { name: "Ethanolamine", unit: "\u00b5mol/g creatinine", refMin: 50, refMax: 235, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.phosphoethanolamine": { name: "Phosphoethanolamine", unit: "\u00b5mol/g creatinine", refMin: 1, refMax: 13, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.phosphoserine": { name: "Phosphoserine", unit: "\u00b5mol/g creatinine", refMin: null, refMax: 13, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.sarcosine": { name: "Sarcosine", unit: "\u00b5mol/g creatinine", refMin: null, refMax: 1.2, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.anserine": { name: "Anserine", unit: "\u00b5mol/g creatinine", refMin: 0.4, refMax: 105.1, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.carnosine": { name: "Carnosine", unit: "\u00b5mol/g creatinine", refMin: 1, refMax: 28, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.methylhistidine1": { name: "1-Methylhistidine", unit: "\u00b5mol/g creatinine", refMin: 38, refMax: 988, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.methylhistidine3": { name: "3-Methylhistidine", unit: "\u00b5mol/g creatinine", refMin: 44, refMax: 281, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "urineAminoMetab.betaAlanine": { name: "\u03b2-Alanine", unit: "\u00b5mol/g creatinine", refMin: null, refMax: 22, categoryLabel: "Urine Amino Metabolites", icon: "\uD83D\uDD04", group: "OAT" },
  "toxicElements.lead": { name: "Lead", unit: "\u00b5g/g creatinine", refMin: null, refMax: 1.4, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.mercury": { name: "Mercury", unit: "\u00b5g/g creatinine", refMin: null, refMax: 2.19, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.aluminum": { name: "Aluminum", unit: "\u00b5g/g creatinine", refMin: null, refMax: 22.3, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.antimony": { name: "Antimony", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.149, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.arsenic": { name: "Arsenic", unit: "\u00b5g/g creatinine", refMin: null, refMax: 50, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.barium": { name: "Barium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 6.7, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.bismuth": { name: "Bismuth", unit: "\u00b5g/g creatinine", refMin: null, refMax: 2.28, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.cadmium": { name: "Cadmium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.64, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.cesium": { name: "Cesium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 10.5, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.gadolinium": { name: "Gadolinium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.019, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.gallium": { name: "Gallium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.028, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.nickel": { name: "Nickel", unit: "\u00b5g/g creatinine", refMin: null, refMax: 3.88, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.platinum": { name: "Platinum", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.033, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.rubidium": { name: "Rubidium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 2263, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.thallium": { name: "Thallium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.298, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.tin": { name: "Tin", unit: "\u00b5g/g creatinine", refMin: null, refMax: 2.04, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.tungsten": { name: "Tungsten", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.211, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "toxicElements.uranium": { name: "Uranium", unit: "\u00b5g/g creatinine", refMin: null, refMax: 0.026, categoryLabel: "Toxic Elements", icon: "\u2620\uFE0F", group: "OAT" },
  "nutrientElements.chromium": { name: "Chromium", unit: "\u00b5g/g creatinine", refMin: 0.6, refMax: 9.4, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.cobalt": { name: "Cobalt", unit: "\u00b5g/g creatinine", refMin: 0.01, refMax: 2.60, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.copper": { name: "Copper (Urine)", unit: "\u00b5g/g creatinine", refMin: 4.0, refMax: 11.4, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.iron": { name: "Iron (Urine)", unit: "\u00b5g/g creatinine", refMin: 5, refMax: 64, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.lithium": { name: "Lithium", unit: "\u00b5g/g creatinine", refMin: 9, refMax: 129, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.manganese": { name: "Manganese", unit: "\u00b5g/g creatinine", refMin: 0.03, refMax: 1.16, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.molybdenum": { name: "Molybdenum", unit: "\u00b5g/g creatinine", refMin: 15, refMax: 175, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.selenium": { name: "Selenium", unit: "\u00b5g/g creatinine", refMin: 32, refMax: 333, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.strontium": { name: "Strontium", unit: "\u00b5g/g creatinine", refMin: 47, refMax: 346, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.vanadium": { name: "Vanadium", unit: "\u00b5g/g creatinine", refMin: 0.1, refMax: 3.2, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.zinc": { name: "Zinc (Urine)", unit: "\u00b5g/g creatinine", refMin: 63, refMax: 688, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.calcium": { name: "Calcium (Urine)", unit: "mg/g creatinine", refMin: 37, refMax: 313, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.magnesiumUrine": { name: "Magnesium (Urine)", unit: "mg/g creatinine", refMin: 41, refMax: 267, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
  "nutrientElements.sulfur": { name: "Sulfur", unit: "mg/g creatinine", refMin: 367, refMax: 1328, categoryLabel: "Nutrient Elements", icon: "\u2699\uFE0F", group: "OAT" },
};

// ═══════════════════════════════════════════════
// Fatty Acids Adapter — product-specific (Spadia, ZinZino, OmegaQuant)
// ═══════════════════════════════════════════════
const FA_SUMMARY_MARKER = { unit: "wt %", refMin: null, refMax: null, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" };
const FA_MARKERS = {
  "fattyAcids.palmiticC16": { name: "Palmitic Acid C16:0", unit: "%", refMin: 28.1, refMax: 30.1, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.stearicC18": { name: "Stearic Acid C18:0", unit: "%", refMin: 12.5, refMax: 13.8, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.oleicC18_1": { name: "Oleic Acid C18:1", unit: "%", refMin: 20.9, refMax: 23.4, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.linoleicC18_2": { name: "Linoleic Acid C18:2", unit: "%", refMin: 18.4, refMax: 21.3, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.glaC18_3": { name: "GLA C18:3", unit: "%", refMin: 0.11, refMax: 0.22, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.arachidonicC20_4": { name: "Arachidonic C20:4", unit: "%", refMin: 5.50, refMax: 8.50, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.dglaC20_3": { name: "DGLA C20:3", unit: "%", refMin: 0.91, refMax: 1.16, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.alaC18_3": { name: "ALA C18:3", unit: "%", refMin: 0.58, refMax: 0.89, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.epaC20_5": { name: "EPA C20:5", unit: "%", refMin: 3.23, refMax: 4.72, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.dpaC22_5": { name: "DPA C22:5", unit: "%", refMin: 1.95, refMax: 2.36, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.dhaC22_6": { name: "DHA C22:6", unit: "%", refMin: 3.95, refMax: 4.64, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.omega3Index": { name: "Omega-3 Index", unit: "%", refMin: 8.0, refMax: 12.0, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.omega6to3Ratio": { name: "Omega-6/3 Ratio", unit: "", refMin: 1.0, refMax: 4.0, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.membraneFluidity": { name: "Membrane Fluidity", unit: "", refMin: 1.0, refMax: 4.0, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.mentalResilience": { name: "Mental Resilience Idx", unit: "", refMin: 0.5, refMax: 1.0, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.nervonicC24_1": { name: "Nervonic Acid C24:1", unit: "%", refMin: 1.1, refMax: 1.8, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.arachidicC20_0": { name: "Arachidic Acid C20:0", unit: "%", refMin: 0.24, refMax: 0.40, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.behenicC22_0": { name: "Behenic Acid C22:0", unit: "%", refMin: 0.88, refMax: 1.61, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.tricosanoicC23_0": { name: "Tricosanoic Acid C23:0", unit: "%", refMin: 0.19, refMax: 0.26, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.lignocericC24_0": { name: "Lignoceric Acid C24:0", unit: "%", refMin: 1.1, refMax: 1.9, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.pentadecanoicC15_0": { name: "Pentadecanoic Acid C15:0", unit: "%", refMin: 0.14, refMax: 0.30, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.margaricC17_0": { name: "Margaric Acid C17:0", unit: "%", refMin: 0.24, refMax: 0.45, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.palmitoleicC16_1n7": { name: "Palmitoleic Acid C16:1n7", unit: "%", refMin: null, refMax: 2.58, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.vaccenicC18_1n7": { name: "Vaccenic Acid C18:1n7", unit: "%", refMin: null, refMax: 1.65, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.elaidicC18_1n9t": { name: "Elaidic Acid C18:1n9t", unit: "%", refMin: null, refMax: 0.59, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.docosatetraenoicC22_4n6": { name: "Docosatetraenoic Acid C22:4n6", unit: "%", refMin: 0.45, refMax: 1.25, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.eicosadienoicC20_2n6": { name: "Eicosadienoic Acid C20:2n6", unit: "%", refMin: null, refMax: 0.26, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.aaEpaRatio": { name: "AA/EPA Ratio", unit: "", refMin: 10, refMax: 86, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  "fattyAcids.linoleicDglaRatio": { name: "Linoleic/DGLA Ratio", unit: "", refMin: 12.6, refMax: 31.5, categoryLabel: "Fatty Acids", icon: "\uD83D\uDC1F", group: "Fatty Acids" },
  // Genova Metabolomix+ reports these summary analytes separately. Keep their
  // ranges null here because the importer must use the patient's printed range.
  "fattyAcids.omega3Total": { ...FA_SUMMARY_MARKER, name: "Total Omega-3 Fatty Acids" },
  "fattyAcids.omega6Total": { ...FA_SUMMARY_MARKER, name: "Total Omega-6 Fatty Acids" },
  "fattyAcids.omega9Total": { ...FA_SUMMARY_MARKER, name: "Total Omega-9 Fatty Acids" },
  "fattyAcids.saturatedFatTotal": { ...FA_SUMMARY_MARKER, name: "Total Saturated Fatty Acids" },
  "fattyAcids.omega6ToOmega3Index": { ...FA_SUMMARY_MARKER, name: "Omega-6s / Omega-3 Index", unit: "" },
};

const FA_PRODUCTS = [
  { patterns: ['zinzino', 'balancetest', 'balance test'], prefix: 'zinzinoFA', label: 'ZinZino' },
  { patterns: ['omegaquant', 'ayumetrix'], prefix: 'omegaquantFA', label: 'OmegaQuant' },
  { patterns: ['spadia'], prefix: 'spadiaFA', label: 'Spadia' },
];

function _detectFAProduct(fileName, pdfText) {
  const fnLower = (fileName || '').toLowerCase();
  const textLower = (pdfText || '').slice(0, 3000).toLowerCase();
  for (const p of FA_PRODUCTS) {
    for (const pat of p.patterns) {
      if (fnLower.includes(pat) || textLower.includes(pat)) return { prefix: p.prefix, label: p.label };
    }
  }
  return null;
}

function _normalizeFAMarkers(markers, fileName, pdfText, detectedProduct) {
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  let product = detectedProduct || _detectFAProduct(fileName, pdfText);
  // Fallback: derive from first non-generic suggestedGroup the AI returned
  if (!product) {
    const firstLabel = markers.find(m => m.suggestedCategoryLabel && !/fatty|omega|saturated|trans|mono/i.test(m.suggestedCategoryLabel))?.suggestedCategoryLabel;
    if (firstLabel) {
      const prefix = firstLabel.toLowerCase().replace(/[^a-z0-9]/g, '') + 'FA';
      product = { prefix, label: firstLabel };
    } else {
      product = { prefix: 'fattyAcidsTest', label: 'Fatty Acids Test' };
    }
  }
  for (const m of markers) {
    // Never rewrite markers already matched to standard schema categories
    if (m.mappedKey) {
      const catKey = m.mappedKey.split('.')[0];
      if (standardCats.has(catKey)) {
        if (isDebugMode()) console.log(`[FA Normalize] Skipping ${m.mappedKey} — standard category`);
        continue;
      }
    }
    const markerPart = m.suggestedKey ? m.suggestedKey.split('.').pop()
      : m.mappedKey ? m.mappedKey.split('.').pop()
      : m.rawName.replace(/[^a-zA-Z0-9_]/g, '');
    if (!markerPart) continue;
    m.mappedKey = null;
    m.suggestedKey = `${product.prefix}.${markerPart}`;
    m.suggestedCategoryLabel = product.label;
    m.suggestedGroup = 'Fatty Acids';
  }
}

// ═══════════════════════════════════════════════
// Metabolomix+ Adapter — Genova Diagnostics combined panel
// OAT + amino acids + elements + optional FA bloodspot add-on
// ═══════════════════════════════════════════════
function _detectMetabolomix(fileName, pdfText) {
  const haystack = `${fileName || ''}\n${String(pdfText || '').slice(0, 6000)}`.toLowerCase();
  const explicitProduct = /\bmetabolomix\s*\+?/i.test(haystack);
  const officialCode = /\b3200\b/.test(haystack) && /genova/.test(haystack);
  return explicitProduct || officialCode
    ? { prefix: 'metabolomix', label: 'Metabolomix+', group: 'Metabolomix+' }
    : null;
}

function _detectMosaicOAT(fileName, pdfText) {
  const haystack = `${fileName || ''}\n${String(pdfText || '').slice(0, 6000)}`.toLowerCase();
  const hasMosaicLab = /mosaic\s*(?:diagnostics|dx)|mosaicdx|great plains laborator|\bmdx[_ -]/i.test(haystack);
  if (!hasMosaicLab) return null;
  if (/microbial organic acids test|(?:^|[_ -])moat(?:[_ .-]|$)/im.test(haystack)) {
    return { prefix: 'mosaicMoat', label: 'Mosaic MOAT', group: 'Mosaic MOAT', kind: 'moat' };
  }
  if (/organic acids? test|(?:^|[_ -])oat(?:[_ .-]|$)/im.test(haystack)) {
    return { prefix: 'mosaicOat', label: 'Mosaic OAT', group: 'Mosaic OAT', kind: 'oat' };
  }
  return null;
}

// ═══════════════════════════════════════════════
// BioStarks Adapter — dried blood spot (amino acids, fatty acids, minerals, vitamins, hormones, metabolism)
// ═══════════════════════════════════════════════
const BIOSTARKS_MARKERS = {
  // Amino Acids (12) — blood serum, µmol/L
  "biostarksAmino.arginine": { name: "Arginine", unit: "µmol/L", refMin: 59, refMax: 180, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.asparagine": { name: "Asparagine", unit: "µmol/L", refMin: 29, refMax: 110, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.bcaa": { name: "Branched-chain Amino Acids", unit: "µmol/L", refMin: 270, refMax: 700, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.carnitine": { name: "Carnitine", unit: "µmol/L", refMin: 25, refMax: 80, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.citrulline": { name: "Citrulline", unit: "µmol/L", refMin: 17, refMax: 96, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.glutamine": { name: "Glutamine", unit: "µmol/L", refMin: 320, refMax: 1100, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.proline": { name: "Proline", unit: "µmol/L", refMin: 78, refMax: 550, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.taurine": { name: "Taurine", unit: "µmol/L", refMin: 25, refMax: 140, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.threonine": { name: "Threonine", unit: "µmol/L", refMin: 70, refMax: 360, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.tryptophan": { name: "Tryptophan", unit: "µmol/L", refMin: 33, refMax: 140, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.tyrosine": { name: "Tyrosine", unit: "µmol/L", refMin: 45, refMax: 180, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksAmino.valine": { name: "Valine", unit: "µmol/L", refMin: 230, refMax: 460, categoryLabel: "BioStarks: Amino Acids", icon: "\uD83E\uDDEC", group: "BioStarks" },
  // Fatty Acids (5) — serum concentration in µmol/L (NOT % like Spadia/ZinZino)
  "biostarksFA.dha": { name: "DHA", unit: "µmol/L", refMin: 40, refMax: 290, categoryLabel: "BioStarks: Fatty Acids", icon: "\uD83D\uDC1F", group: "BioStarks" },
  "biostarksFA.epa": { name: "EPA", unit: "µmol/L", refMin: 3, refMax: 20, categoryLabel: "BioStarks: Fatty Acids", icon: "\uD83D\uDC1F", group: "BioStarks" },
  "biostarksFA.linoleicAcid": { name: "Linoleic Acid", unit: "µmol/L", refMin: 500, refMax: 2000, categoryLabel: "BioStarks: Fatty Acids", icon: "\uD83D\uDC1F", group: "BioStarks" },
  "biostarksFA.oleicAcid": { name: "Oleic Acid", unit: "µmol/L", refMin: 300, refMax: 2300, categoryLabel: "BioStarks: Fatty Acids", icon: "\uD83D\uDC1F", group: "BioStarks" },
  "biostarksFA.omega3Index": { name: "Omega-3 Index", unit: "%", refMin: 8, refMax: 15, categoryLabel: "BioStarks: Fatty Acids", icon: "\uD83D\uDC1F", group: "BioStarks" },
  // Intracellular Minerals (3) — RBC, µg/gHb (NOT serum)
  "biostarksMineral.magnesium": { name: "Magnesium (RBC)", unit: "µg/gHb", refMin: 250, refMax: 480, categoryLabel: "BioStarks: Minerals", icon: "\u2696\uFE0F", group: "BioStarks" },
  "biostarksMineral.selenium": { name: "Selenium (RBC)", unit: "µg/gHb", refMin: 0.57, refMax: 1.2, categoryLabel: "BioStarks: Minerals", icon: "\u2696\uFE0F", group: "BioStarks" },
  "biostarksMineral.zinc": { name: "Zinc (RBC)", unit: "µg/gHb", refMin: 35, refMax: 91, categoryLabel: "BioStarks: Minerals", icon: "\u2696\uFE0F", group: "BioStarks" },
  // Hormones (2)
  "biostarksHormone.cortisol": { name: "Cortisol", unit: "nmol/L", refMin: 140, refMax: 620, categoryLabel: "BioStarks: Hormones", icon: "\uD83E\uDDEC", group: "BioStarks" },
  "biostarksHormone.testCortisolRatio": { name: "Testosterone/Cortisol Ratio", unit: "U", refMin: 3.5, refMax: 15, categoryLabel: "BioStarks: Hormones", icon: "\uD83E\uDDEC", group: "BioStarks" },
  // Vitamins (1)
  "biostarksVitamin.vitaminE": { name: "Vitamin E Alpha-Tocopherol", unit: "mg/L", refMin: 11, refMax: 42, categoryLabel: "BioStarks: Vitamins", icon: "\u2600\uFE0F", group: "BioStarks" },
};

const BIOSTARKS_PATTERNS = ['biostarks', 'bio starks', 'bio-starks'];

function _detectBiostarks(fileName, pdfText) {
  const fnLower = (fileName || '').toLowerCase();
  const textLower = (pdfText || '').slice(0, 3000).toLowerCase();
  for (const pat of BIOSTARKS_PATTERNS) {
    if (fnLower.includes(pat) || textLower.includes(pat)) return { prefix: 'biostarks', label: 'BioStarks' };
  }
  return null;
}

function _normalizeBiostarks(markers) {
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  const biostarksKeys = new Set(Object.keys(BIOSTARKS_MARKERS));

  // Name → adapter key lookup (exact + aliases)
  const nameLookup = new Map();
  for (const [key, def] of Object.entries(BIOSTARKS_MARKERS)) {
    nameLookup.set(def.name.toLowerCase(), key);
  }
  nameLookup.set('bcaa', 'biostarksAmino.bcaa');
  nameLookup.set('branched chain amino acids', 'biostarksAmino.bcaa');
  nameLookup.set('branched-chain amino acids', 'biostarksAmino.bcaa');
  nameLookup.set('omega-3 index', 'biostarksFA.omega3Index');
  nameLookup.set('omega 3 index', 'biostarksFA.omega3Index');
  nameLookup.set('vitamin e', 'biostarksVitamin.vitaminE');
  nameLookup.set('alpha-tocopherol', 'biostarksVitamin.vitaminE');
  nameLookup.set('vitamin e alpha-tocopherol', 'biostarksVitamin.vitaminE');
  nameLookup.set('testosterone / cortisol ratio', 'biostarksHormone.testCortisolRatio');
  nameLookup.set('testosterone/cortisol ratio', 'biostarksHormone.testCortisolRatio');
  nameLookup.set('t/c ratio', 'biostarksHormone.testCortisolRatio');
  nameLookup.set('linoleic acid', 'biostarksFA.linoleicAcid');
  nameLookup.set('oleic acid', 'biostarksFA.oleicAcid');
  // Bare mineral names (AI may omit "(RBC)" suffix — selenium has no standard schema fallback)
  nameLookup.set('magnesium', 'biostarksMineral.magnesium');
  nameLookup.set('selenium', 'biostarksMineral.selenium');
  nameLookup.set('zinc', 'biostarksMineral.zinc');
  nameLookup.set('magnesium rbc', 'biostarksMineral.magnesium');
  nameLookup.set('selenium rbc', 'biostarksMineral.selenium');
  nameLookup.set('zinc rbc', 'biostarksMineral.zinc');
  // L-prefixed amino acids
  nameLookup.set('l-arginine', 'biostarksAmino.arginine');
  nameLookup.set('l-glutamine', 'biostarksAmino.glutamine');
  nameLookup.set('l-tryptophan', 'biostarksAmino.tryptophan');
  nameLookup.set('l-carnitine', 'biostarksAmino.carnitine');
  nameLookup.set('l-proline', 'biostarksAmino.proline');
  nameLookup.set('l-threonine', 'biostarksAmino.threonine');
  nameLookup.set('l-tyrosine', 'biostarksAmino.tyrosine');
  nameLookup.set('l-valine', 'biostarksAmino.valine');
  nameLookup.set('l-citrulline', 'biostarksAmino.citrulline');
  nameLookup.set('l-asparagine', 'biostarksAmino.asparagine');
  // FA chemical names
  nameLookup.set('docosahexaenoic acid', 'biostarksFA.dha');
  nameLookup.set('eicosapentaenoic acid', 'biostarksFA.epa');
  nameLookup.set('free carnitine', 'biostarksAmino.carnitine');

  for (const m of markers) {
    const name = (m.rawName || m.suggestedName || '').toLowerCase().trim();
    const key = m.mappedKey || m.suggestedKey || '';

    // Already correctly mapped to a BioStarks adapter key — skip
    if (biostarksKeys.has(key)) continue;

    // BioStarks is a hybrid panel: ordinary serum-style markers can stay in the
    // standard schema, but BioStarks-specific amino acids, fatty acids,
    // intracellular minerals, vitamin E, and ratio markers must not be left in
    // lookalike generic/OAT categories just because the AI found a standard name.
    const match = nameLookup.get(name);
    if (match) {
      const def = BIOSTARKS_MARKERS[match];
      m.mappedKey = null;
      m.suggestedKey = match;
      m.suggestedCategoryLabel = def.categoryLabel;
      m.suggestedGroup = 'BioStarks';
      if (isDebugMode()) console.log(`[BioStarks] Normalized ${name} → ${match}`);
      continue;
    }

    // Standard schema mapping — keep for BioStarks markers not defined in the
    // adapter (e.g. active B12, vitamin D, ferritin, lipids, glucose), but keep
    // the old unit-based mineral guard as a fallback for variant RBC labels.
    if (m.mappedKey) {
      const catKey = m.mappedKey.split('.')[0];
      if (standardCats.has(catKey)) {
        const unit = (m.unit || '').toLowerCase();
        if (unit.includes('ghb') || unit.includes('g hb')) {
          const markerPart = m.mappedKey.split('.')[1];
          const mineralKey = `biostarksMineral.${markerPart}`;
          if (BIOSTARKS_MARKERS[mineralKey]) {
            const def = BIOSTARKS_MARKERS[mineralKey];
            m.mappedKey = null;
            m.suggestedKey = mineralKey;
            m.suggestedCategoryLabel = def.categoryLabel;
            m.suggestedGroup = 'BioStarks';
            if (isDebugMode()) console.log(`[BioStarks] Remapped intracellular ${name} → ${mineralKey}`);
          }
        }
        continue;
      }
    }
  }
}

// ═══════════════════════════════════════════════
// Gut/Stool Adapter — GI barrier + inflammatory stool markers
// ═══════════════════════════════════════════════
const GUT_STOOL_MARKERS = {
  "stool.calprotectin": { name: "Calprotectin", unit: "µg/g", refMin: null, refMax: 50, categoryLabel: "Stool / Gut Barrier", icon: "🧫", group: "Gut" },
  "stool.zonulin": { name: "Zonulin", unit: "ng/ml", refMin: null, refMax: 60, categoryLabel: "Stool / Gut Barrier", icon: "🧫", group: "Gut" },
  "stool.secretoryIgA": { name: "Secretory IgA", unit: "µg/g", refMin: 510, refMax: 2040, categoryLabel: "Stool / Gut Barrier", icon: "🧫", group: "Gut" },
};

// ═══════════════════════════════════════════════
// Adapter Registry
// ═══════════════════════════════════════════════
const ADAPTERS = [
  {
    id: 'fattyAcids',
    testTypes: ['fattyAcids'],
    markers: FA_MARKERS,
    detect(fileName, pdfText) { return _detectFAProduct(fileName, pdfText); },
    normalize(markers, fileName, pdfText, detected) { _normalizeFAMarkers(markers, fileName, pdfText, detected); },
  },
  {
    id: 'metabolomix',
    testTypes: ['metabolomix', 'Metabolomix+'],
    productScoped: true,
    markers: {}, // Reuses OAT + FA markers (no unique markers)
    detect(fileName, pdfText) { return _detectMetabolomix(fileName, pdfText); },
  },
  {
    id: 'mosaicOat',
    testTypes: ['Mosaic OAT', 'Mosaic MOAT', 'MOAT'],
    productScoped: true,
    markers: {}, // Uses the legacy OAT catalog, then scopes keys to the Mosaic product
    detect(fileName, pdfText) { return _detectMosaicOAT(fileName, pdfText); },
  },
  {
    id: 'oat',
    testTypes: ['OAT'],
    productScoped: true,
    markers: OAT_MARKERS,
  },
  {
    id: 'gutStool',
    testTypes: ['stool', 'gut', 'giMap', 'GI-MAP', 'GI Effects'],
    markers: GUT_STOOL_MARKERS,
  },
  {
    id: 'biostarks',
    testTypes: ['biostarks'],
    markers: BIOSTARKS_MARKERS,
    detect(fileName, pdfText) { return _detectBiostarks(fileName, pdfText); },
    normalize(markers, _fileName, _pdfText, _detected) { _normalizeBiostarks(markers); },
  },
  // Future adapters: DUTCH, HTMA, GI-MAP, HealthieOne, etc.
];

// ═══════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════

/** Get all adapter markers merged into a single object (for buildMarkerReference) */
export function getAllAdapterMarkers() {
  const all = {};
  for (const adapter of ADAPTERS) {
    Object.assign(all, adapter.markers);
  }
  return all;
}

/** Find an adapter by testType */
export function getAdapterByTestType(testType) {
  return ADAPTERS.find(a => a.testTypes.includes(testType)) || null;
}

/** Detect product from filename/text across all adapters */
export function detectProduct(fileName, pdfText) {
  for (const adapter of ADAPTERS) {
    if (adapter.detect) {
      const result = adapter.detect(fileName, pdfText);
      if (result) return { adapter, product: result };
    }
  }
  return null;
}

/** Run adapter normalization on parsed markers (post-AI) */
export function normalizeWithAdapter(adapter, markers, fileName, pdfText, detectedProduct) {
  if (adapter?.normalize) {
    adapter.normalize(markers, fileName, pdfText, detectedProduct);
  }
}

/** All adapter markers, with the legacy specialty name kept at this ownership boundary. */
export const ADAPTER_MARKERS = getAllAdapterMarkers();
export { ADAPTER_MARKERS as SPECIALTY_MARKER_DEFS };
