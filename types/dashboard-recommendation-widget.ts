export interface RecSlotReader {label?:unknown;freeActions?:ArrayLike<unknown>|null;foodForms?:ArrayLike<unknown>|null;productForms?:ArrayLike<unknown>|null;forms?:ArrayLike<unknown>|null}
export interface RecCatalogReader {slots?:Record<string,RecSlotReader>|null}
export interface RecContextReader {data?:unknown;filteredData?:unknown;trendAlerts?:Array<{id:string;code?:unknown}>;criticalFlags?:Array<{id:string}>}
export interface RecCandidateInput {id?:string;source:string;slotKey:unknown;score:number;markerId?:string;markerStatus?:unknown;label?:unknown;reason:unknown;meta?:unknown;primaryAction?:unknown}
export interface RecCandidate extends RecCandidateInput {id:string;label:unknown;primaryAction:unknown;saved:boolean;dismissed:boolean}
export interface RecRenderCandidate {id?:unknown;source?:unknown;slotKey?:unknown;markerId?:unknown;markerStatus?:unknown;label?:unknown;reason?:unknown;meta?:unknown;primaryAction?:unknown;saved?:unknown;dismissed?:unknown}
export interface RecSessionReader {startedAt?:unknown;endedAt?:unknown}
export interface RecHintReader {text?:unknown;gene?:unknown}
