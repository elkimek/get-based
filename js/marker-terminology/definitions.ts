export type MarkerTerminology = 'loinc' | 'npu' | 'nclp';
export type MarkerTerminologyStatus = 'active' | 'deprecated';
export interface MarkerTerminologyContext {
  system: string; component: string; property: string;
  timeAspect: string | null; scale: string | null; method: string | null;
}
export interface MarkerTerminologySource { url: string; release: string; verifiedOn: string }
export interface MarkerTerminologyMapping {
  markerId: string; terminology: MarkerTerminology; code: string; display: string;
  status: MarkerTerminologyStatus; context: MarkerTerminologyContext;
  ucumUnits: string[]; source: MarkerTerminologySource;
}
export interface TerminologyCatalog { title: string; authority: string; homepageUrl: string }

/** Reviewed active concentration mappings; each row keeps specimen and component explicit. */
export function defineConcentrationMappings(
  terminology: MarkerTerminology,
  source: Omit<MarkerTerminologySource, 'url'> & { url: string | ((code: string) => string) },
  context: Pick<MarkerTerminologyContext, 'property' | 'timeAspect' | 'scale' | 'method'>,
  rows: Array<[markerId: string, code: string, display: string, system: string, component: string]>,
): MarkerTerminologyMapping[] {
  return rows.map(([markerId, code, display, system, component]) => ({
    markerId, terminology, code, display, status: 'active',
    context: { system, component, ...context }, ucumUnits: ['mmol/L'],
    source: { url: typeof source.url === 'function' ? source.url(code) : source.url,
      release: source.release, verifiedOn: source.verifiedOn },
  }));
}
