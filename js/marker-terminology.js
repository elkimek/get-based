// @ts-check
// Generated from js/marker-terminology/index.js. Run npm run marker-terminology:build; do not edit.

/** @typedef {'loinc' | 'npu' | 'nclp'} MarkerTerminology */
/** @typedef {'active' | 'deprecated'} MarkerTerminologyStatus */
/** @typedef {{ system: string, component: string, property: string, timeAspect: string | null, scale: string | null, method: string | null }} MarkerTerminologyContext */
/** @typedef {{ url: string, release: string, verifiedOn: string }} MarkerTerminologySource */
/** @typedef {{ markerId: string, terminology: MarkerTerminology, code: string, display: string, status: MarkerTerminologyStatus, context: MarkerTerminologyContext, ucumUnits: string[], source: MarkerTerminologySource }} MarkerTerminologyMapping */
/** @typedef {{ title: string, authority: string, homepageUrl: string }} TerminologyCatalog */

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** @type {Record<string, TerminologyCatalog>} */
const terminologyCatalogs = {"loinc":{"title":"LOINC","authority":"Regenstrief Institute","homepageUrl":"https://loinc.org/"},"npu":{"title":"NPU Terminology","authority":"IFCC and IUPAC","homepageUrl":"https://npu-terminology.org/"},"nclp":{"title":"NČLP","authority":"Ministry of Health of the Czech Republic (DASTA)","homepageUrl":"https://www.dastacr.cz/"},"ucum":{"title":"UCUM","authority":"Regenstrief Institute and the UCUM Organization","homepageUrl":"https://ucum.org/"}};
export const TERMINOLOGY_CATALOGS = deepFreeze(terminologyCatalogs);

/** @type {Record<string, MarkerTerminologyMapping[]>} */
const markerTerminologyRegistry = {"gb:marker:glucose":[{"markerId":"gb:marker:glucose","terminology":"loinc","code":"14749-6","display":"Glucose [Moles/volume] in Serum or Plasma","status":"active","context":{"system":"Ser/Plas","component":"Glucose","property":"SCnc","timeAspect":"Pt","scale":"Qn","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://loinc.org/14749-6","release":"2.82","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:glucose","terminology":"npu","code":"NPU02192","display":"Plasma—Glucose; substance concentration = ? millimole per litre","status":"active","context":{"system":"Plasma","component":"Glucose","property":"substance concentration","timeAspect":null,"scale":"Ratio","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv","release":"2026-06-30","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:glucose","terminology":"nclp","code":"01896","display":"Glukóza (P; látková konc. [mmol/l] *)","status":"active","context":{"system":"P","component":"Glukóza","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:glucose","terminology":"nclp","code":"01898","display":"Glukóza (S; látková konc. [mmol/l] *)","status":"active","context":{"system":"S","component":"Glukóza","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}}],"gb:marker:sodium":[{"markerId":"gb:marker:sodium","terminology":"loinc","code":"2951-2","display":"Sodium [Moles/volume] in Serum or Plasma","status":"active","context":{"system":"Ser/Plas","component":"Sodium","property":"SCnc","timeAspect":"Pt","scale":"Qn","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://loinc.org/2951-2","release":"2.82","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:sodium","terminology":"npu","code":"NPU03429","display":"Plasma—Sodium ion; substance concentration = ? millimole per litre","status":"active","context":{"system":"Plasma","component":"Sodium ion","property":"substance concentration","timeAspect":null,"scale":"Ratio","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv","release":"2026-06-30","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:sodium","terminology":"nclp","code":"02500","display":"Na (P; látková konc. [mmol/l] *)","status":"active","context":{"system":"P","component":"Na","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:sodium","terminology":"nclp","code":"02503","display":"Na (S; látková konc. [mmol/l] *)","status":"active","context":{"system":"S","component":"Na","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}}]};
export const MARKER_TERMINOLOGY_REGISTRY = deepFreeze(markerTerminologyRegistry);
/** @type {Readonly<MarkerTerminologyMapping[]>} */
const EMPTY_MAPPINGS = Object.freeze([]);
/** @type {Map<string, MarkerTerminologyMapping>} */
const mappingByTerminologyCode = new Map();
for (const mappings of Object.values(MARKER_TERMINOLOGY_REGISTRY)) {
  for (const mapping of mappings) {
    mappingByTerminologyCode.set(`${mapping.terminology}:${mapping.code}`, mapping);
  }
}

/**
 * @param {unknown} markerId
 * @param {unknown} [terminology]
 * @returns {Readonly<MarkerTerminologyMapping[]>}
 */
export function getMarkerTerminologyMappings(markerId, terminology) {
  if (typeof markerId !== 'string') return EMPTY_MAPPINGS;
  const mappings = MARKER_TERMINOLOGY_REGISTRY[markerId] || EMPTY_MAPPINGS;
  if (terminology === undefined || terminology === null) return mappings;
  if (typeof terminology !== 'string') return EMPTY_MAPPINGS;
  return Object.freeze(mappings.filter(mapping => mapping.terminology === terminology));
}

/**
 * @param {unknown} terminology
 * @param {unknown} code
 * @returns {MarkerTerminologyMapping | null}
 */
export function findMarkerTerminologyMapping(terminology, code) {
  if (typeof terminology !== 'string' || typeof code !== 'string') return null;
  return mappingByTerminologyCode.get(`${terminology}:${code}`) || null;
}
