import { defineConcentrationMappings } from './definitions.js';

// Reviewed NPU mappings from the official IFCC English database.
export const NPU_TERMINOLOGY_MAPPINGS = defineConcentrationMappings(
  'npu',
  { url: "https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv", release: "2026-06-30", verifiedOn: "2026-08-11" },
  { property: "substance concentration", timeAspect: null, scale: "Ratio", method: null },
  [
    ["gb:marker:glucose", "NPU02192", "Plasma—Glucose; substance concentration = ? millimole per litre", "Plasma", "Glucose"],
    ["gb:marker:sodium", "NPU03429", "Plasma—Sodium ion; substance concentration = ? millimole per litre", "Plasma", "Sodium ion"],
  ],
);
