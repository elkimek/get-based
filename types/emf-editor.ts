import type { getEMFSeverity } from '../js/schema.js';
// Private unchecked operations at original read sites; these are not validated storage DTOs.
export interface MeasurementOperations {value?: unknown; meter?: unknown; unit?: unknown}
export interface PhotoOperations {mediaType?: unknown; base64?: unknown; name?: unknown}
export interface RoomOperations {name?: unknown;location?: unknown;sleeping?: unknown;measurements?: Record<string, MeasurementOperations | undefined> | null; sources?: unknown[] | null; mitigations?: unknown[] | null; photos?: PhotoOperations[] | null;note?: unknown}
export interface AssessmentOperations {id?:unknown;date?:unknown;label?:unknown;consultant?:unknown;rooms:RoomOperations[];note?:unknown}
export interface PreviewInput {date?:unknown;consultant?:unknown;rooms:unknown;note?:unknown}
export interface EditorOptions {onReturn?:unknown;returnLabel?:unknown}
export interface ReturnRoute {label:string;callback:unknown}
export type SeverityReader = (type: Parameters<typeof getEMFSeverity>[0],value:unknown,sleeping?:Parameters<typeof getEMFSeverity>[2])=>ReturnType<typeof getEMFSeverity>;
// configureEMFEditor stores only functions/null. The original required hasAIProvider call
// reads a potentially-null slot unchecked; this private callable view retains that error.
export interface EditorDependencyOperations {
  [key:string]:unknown;
  hasAIProvider:()=>unknown;
  addEMFAssessment?:(()=>unknown)|null; addEMFPhotos?:((id:string,room:number,files:FileList)=>unknown)|null;
  addEMFRoom?:((id:string)=>unknown)|null; closeModal?:(()=>unknown)|null;
  collectActiveAssessmentState?:(()=>unknown)|null; deleteEMFAssessment?:((id:string)=>unknown)|null;
  handleEMFPDF?:((file:File)=>unknown)|null;
  handleEMFRoomDropdown?:((id:string,room:number,value:string,select:HTMLSelectElement)=>unknown)|null;
  interpretEMFAssessment?:((id:string)=>unknown)|null; interpretEMFComparison?:(()=>unknown)|null;
  removeEMFPhoto?:((id:string,room:number,photo:number)=>unknown)|null; removeEMFRoom?:((id:string,room:number)=>unknown)|null;
  saveEMFExplicit?:(()=>unknown)|null; selectEMFRoom?:((id:string,room:number)=>unknown)|null;
  toggleEMFAssessment?:((id:string)=>unknown)|null; toggleEMFCompare?:(()=>unknown)|null;
  updateEMFField?:((id:string,field:string,value:string)=>unknown)|null;
  updateEMFMeasurement?:((id:string,room:number,type:string,value:string)=>unknown)|null;
  updateEMFMeter?:((id:string,room:number,type:string,value:string)=>unknown)|null;
  updateEMFRoom?:((id:string,room:number,field:string,value:string|boolean)=>unknown)|null;
  viewEMFPhoto?:((id:string,room:number,photo:number)=>unknown)|null;
}
