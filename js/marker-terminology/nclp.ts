import { defineConcentrationMappings } from './definitions.js';

// Reviewed NČLP mappings from the official Czech DASTA catalog.
export const NCLP_TERMINOLOGY_MAPPINGS = defineConcentrationMappings(
  'nclp',
  { url: "https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml", release: "02.99.01 / 202630", verifiedOn: "2026-08-11" },
  { property: "látková konc.", timeAspect: null, scale: null, method: "*" },
  [
    ["gb:marker:glucose", "01896", "Glukóza (P; látková konc. [mmol/l] *)", "P", "Glukóza"],
    ["gb:marker:glucose", "01898", "Glukóza (S; látková konc. [mmol/l] *)", "S", "Glukóza"],
    ["gb:marker:sodium", "02500", "Na (P; látková konc. [mmol/l] *)", "P", "Na"],
    ["gb:marker:sodium", "02503", "Na (S; látková konc. [mmol/l] *)", "S", "Na"],
  ],
);
