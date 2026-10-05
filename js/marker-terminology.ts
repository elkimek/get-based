import type { MarkerTerminologyMapping, TerminologyCatalog } from './marker-terminology/definitions.js';
export type { MarkerTerminology, MarkerTerminologyStatus, MarkerTerminologyContext, MarkerTerminologySource, MarkerTerminologyMapping, TerminologyCatalog } from './marker-terminology/definitions.js';
// Generated from js/marker-terminology/index.ts. Run npm run marker-terminology:build; do not edit.

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const terminologyCatalogs: Record<string, TerminologyCatalog> = {"loinc":{"title":"LOINC","authority":"Regenstrief Institute","homepageUrl":"https://loinc.org/"},"npu":{"title":"NPU Terminology","authority":"IFCC and IUPAC","homepageUrl":"https://npu-terminology.org/"},"nclp":{"title":"NČLP","authority":"Ministry of Health of the Czech Republic (DASTA)","homepageUrl":"https://www.dastacr.cz/"},"ucum":{"title":"UCUM","authority":"Regenstrief Institute and the UCUM Organization","homepageUrl":"https://ucum.org/"}};
export const TERMINOLOGY_CATALOGS = deepFreeze(terminologyCatalogs);

const markerTerminologyRegistry: Record<string, MarkerTerminologyMapping[]> = {"gb:marker:glucose":[{"markerId":"gb:marker:glucose","terminology":"loinc","code":"14749-6","display":"Glucose [Moles/volume] in Serum or Plasma","status":"active","context":{"system":"Ser/Plas","component":"Glucose","property":"SCnc","timeAspect":"Pt","scale":"Qn","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://loinc.org/14749-6","release":"2.82","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:glucose","terminology":"npu","code":"NPU02192","display":"Plasma—Glucose; substance concentration = ? millimole per litre","status":"active","context":{"system":"Plasma","component":"Glucose","property":"substance concentration","timeAspect":null,"scale":"Ratio","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv","release":"2026-06-30","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:glucose","terminology":"nclp","code":"01896","display":"Glukóza (P; látková konc. [mmol/l] *)","status":"active","context":{"system":"P","component":"Glukóza","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:glucose","terminology":"nclp","code":"01898","display":"Glukóza (S; látková konc. [mmol/l] *)","status":"active","context":{"system":"S","component":"Glukóza","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}}],"gb:marker:sodium":[{"markerId":"gb:marker:sodium","terminology":"loinc","code":"2951-2","display":"Sodium [Moles/volume] in Serum or Plasma","status":"active","context":{"system":"Ser/Plas","component":"Sodium","property":"SCnc","timeAspect":"Pt","scale":"Qn","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://loinc.org/2951-2","release":"2.82","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:sodium","terminology":"npu","code":"NPU03429","display":"Plasma—Sodium ion; substance concentration = ? millimole per litre","status":"active","context":{"system":"Plasma","component":"Sodium ion","property":"substance concentration","timeAspect":null,"scale":"Ratio","method":null},"ucumUnits":["mmol/L"],"source":{"url":"https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv","release":"2026-06-30","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:sodium","terminology":"nclp","code":"02500","display":"Na (P; látková konc. [mmol/l] *)","status":"active","context":{"system":"P","component":"Na","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}},{"markerId":"gb:marker:sodium","terminology":"nclp","code":"02503","display":"Na (S; látková konc. [mmol/l] *)","status":"active","context":{"system":"S","component":"Na","property":"látková konc.","timeAspect":null,"scale":null,"method":"*"},"ucumUnits":["mmol/L"],"source":{"url":"https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml","release":"02.99.01 / 202630","verifiedOn":"2026-08-11"}}]};
export const MARKER_TERMINOLOGY_REGISTRY = deepFreeze(markerTerminologyRegistry);
const EMPTY_MAPPINGS: Readonly<MarkerTerminologyMapping[]> = Object.freeze([]);
const mappingByTerminologyCode = new Map<string, MarkerTerminologyMapping>();
for (const mappings of Object.values(MARKER_TERMINOLOGY_REGISTRY)) {
  for (const mapping of mappings) {
    mappingByTerminologyCode.set(`${mapping.terminology}:${mapping.code}`, mapping);
  }
}

export function getMarkerTerminologyMappings(markerId: unknown, terminology?: unknown): Readonly<MarkerTerminologyMapping[]> {
  if (typeof markerId !== 'string') return EMPTY_MAPPINGS;
  const mappings = MARKER_TERMINOLOGY_REGISTRY[markerId] || EMPTY_MAPPINGS;
  if (terminology === undefined || terminology === null) return mappings;
  if (typeof terminology !== 'string') return EMPTY_MAPPINGS;
  return Object.freeze(mappings.filter(mapping => mapping.terminology === terminology));
}

export function findMarkerTerminologyMapping(terminology: unknown, code: unknown): MarkerTerminologyMapping | null {
  if (typeof terminology !== 'string' || typeof code !== 'string') return null;
  return mappingByTerminologyCode.get(`${terminology}:${code}`) || null;
}
