import { defineConcentrationMappings } from './definitions.js';

// Reviewed LOINC mappings with the native six-part term context.
export const LOINC_TERMINOLOGY_MAPPINGS = defineConcentrationMappings(
  'loinc',
  { url: code => `https://loinc.org/${code}`, release: "2.82", verifiedOn: "2026-08-11" },
  { property: "SCnc", timeAspect: "Pt", scale: "Qn", method: null },
  [
    ["gb:marker:glucose", "14749-6", "Glucose [Moles/volume] in Serum or Plasma", "Ser/Plas", "Glucose"],
    ["gb:marker:sodium", "2951-2", "Sodium [Moles/volume] in Serum or Plasma", "Ser/Plas", "Sodium"],
  ],
);
