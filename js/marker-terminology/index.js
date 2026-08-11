// @ts-check
// Authoring composition for the generated marker terminology registry.

import { TERMINOLOGY_CATALOG_DEFINITIONS } from './catalogs.js';
import { LOINC_TERMINOLOGY_MAPPINGS } from './loinc.js';
import { NPU_TERMINOLOGY_MAPPINGS } from './npu.js';
import { NCLP_TERMINOLOGY_MAPPINGS } from './nclp.js';

export { TERMINOLOGY_CATALOG_DEFINITIONS };

// Keep terminology order stable in the generated registry.
export const MARKER_TERMINOLOGY_DEFINITIONS = [
  ...LOINC_TERMINOLOGY_MAPPINGS,
  ...NPU_TERMINOLOGY_MAPPINGS,
  ...NCLP_TERMINOLOGY_MAPPINGS,
];
