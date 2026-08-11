// @ts-check
// marker-schema/index.js — Authoring composition for the generated runtime catalog.

import { BIOCHEMISTRY_CATEGORY } from './biochemistry.js';
import { HORMONES_CATEGORY } from './hormones.js';
import { ELECTROLYTES_CATEGORY } from './electrolytes.js';
import { LIPIDS_CATEGORY } from './lipids.js';
import { IRON_CATEGORY } from './iron.js';
import { PROTEINS_CATEGORY } from './proteins.js';
import { THYROID_CATEGORY } from './thyroid.js';
import { VITAMINS_CATEGORY } from './vitamins.js';
import { DIABETES_CATEGORY } from './diabetes.js';
import { TUMOR_MARKERS_CATEGORY } from './tumor-markers.js';
import { COAGULATION_CATEGORY } from './coagulation.js';
import { HEMATOLOGY_CATEGORY } from './hematology.js';
import { DIFFERENTIAL_CATEGORY } from './differential.js';
import { BONE_METABOLISM_CATEGORY } from './bone-metabolism.js';
import { URINALYSIS_CATEGORY } from './urinalysis.js';
import { BODY_COMPOSITION_CATEGORY } from './body-composition.js';
import { BONE_DENSITY_CATEGORY } from './bone-density.js';
import { CALCULATED_RATIOS_CATEGORY } from './calculated-ratios.js';

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
