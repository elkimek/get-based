// @ts-check
// marker-schema.js — Stable built-in biomarker catalog composition.

import { BIOCHEMISTRY_CATEGORY } from './marker-schema/biochemistry.js';
import { HORMONES_CATEGORY } from './marker-schema/hormones.js';
import { ELECTROLYTES_CATEGORY } from './marker-schema/electrolytes.js';
import { LIPIDS_CATEGORY } from './marker-schema/lipids.js';
import { IRON_CATEGORY } from './marker-schema/iron.js';
import { PROTEINS_CATEGORY } from './marker-schema/proteins.js';
import { THYROID_CATEGORY } from './marker-schema/thyroid.js';
import { VITAMINS_CATEGORY } from './marker-schema/vitamins.js';
import { DIABETES_CATEGORY } from './marker-schema/diabetes.js';
import { TUMOR_MARKERS_CATEGORY } from './marker-schema/tumor-markers.js';
import { COAGULATION_CATEGORY } from './marker-schema/coagulation.js';
import { HEMATOLOGY_CATEGORY } from './marker-schema/hematology.js';
import { DIFFERENTIAL_CATEGORY } from './marker-schema/differential.js';
import { BONE_METABOLISM_CATEGORY } from './marker-schema/bone-metabolism.js';
import { URINALYSIS_CATEGORY } from './marker-schema/urinalysis.js';
import { BODY_COMPOSITION_CATEGORY } from './marker-schema/body-composition.js';
import { BONE_DENSITY_CATEGORY } from './marker-schema/bone-density.js';
import { CALCULATED_RATIOS_CATEGORY } from './marker-schema/calculated-ratios.js';

// Keep category order stable: it is part of the public schema contract.
export const MARKER_SCHEMA = {
  biochemistry: BIOCHEMISTRY_CATEGORY,
  hormones: HORMONES_CATEGORY,
  electrolytes: ELECTROLYTES_CATEGORY,
  lipids: LIPIDS_CATEGORY,
  iron: IRON_CATEGORY,
  proteins: PROTEINS_CATEGORY,
  thyroid: THYROID_CATEGORY,
  vitamins: VITAMINS_CATEGORY,
  diabetes: DIABETES_CATEGORY,
  tumorMarkers: TUMOR_MARKERS_CATEGORY,
  coagulation: COAGULATION_CATEGORY,
  hematology: HEMATOLOGY_CATEGORY,
  differential: DIFFERENTIAL_CATEGORY,
  boneMetabolism: BONE_METABOLISM_CATEGORY,
  urinalysis: URINALYSIS_CATEGORY,
  bodyComposition: BODY_COMPOSITION_CATEGORY,
  boneDensity: BONE_DENSITY_CATEGORY,
  calculatedRatios: CALCULATED_RATIOS_CATEGORY,
};
