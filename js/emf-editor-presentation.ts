import {renderHTML as renderEditor} from './components/EMFEditor.svelte.html.js';
import {renderHTML as renderPreview} from './components/EMFImportPreview.svelte.html.js';
import type {EMFComparisonView} from './emf-comparison-presentation.js';
export interface EMFSeverityView {readonly color:string;readonly label:string}
export interface EMFFieldView {readonly field:'date'|'label'|'consultant'|'note';readonly value:string;readonly assessmentId:string|null}
export interface EMFRoomTabView {readonly name:string;readonly active:boolean;readonly assessmentId:string|null;readonly index:number;readonly severity:EMFSeverityView|null}
export interface EMFRoomOption {readonly value:string|null;readonly label:string;readonly selected:boolean;readonly disabled:boolean}
export interface EMFMeasurementView {readonly key:string;readonly label:string;readonly value:string;readonly measurementId:string|null;readonly unit:string;readonly dot:EMFSeverityView|null;readonly placeholder:boolean;readonly meter:string;readonly meterId:string|null}
export interface EMFPhotoView {readonly src:string;readonly name:string;readonly viewId:string|null;readonly removeId:string|null;readonly index:number}
export interface EMFRoomView {
 readonly index:number;readonly options:readonly EMFRoomOption[];readonly dropdownId:string|null;
 readonly location:string;readonly locationId:string|null;readonly sleeping:boolean;readonly sleepingId:string|null;readonly removeId:string|null;readonly removable:boolean;
 readonly measurements:readonly EMFMeasurementView[];readonly meters:readonly {readonly key:string;readonly names:readonly string[]}[];
 readonly sourcesId:string;readonly sources:readonly {readonly label:string;readonly active:boolean}[];
 readonly mitigationsId:string;readonly mitigations:readonly {readonly label:string;readonly active:boolean}[];
 readonly note:string;readonly noteId:string|null;readonly photos:readonly EMFPhotoView[];readonly photosId:string|null;
}
export interface EMFAssessmentDetailView {readonly fields:readonly EMFFieldView[];readonly tabs:readonly EMFRoomTabView[];readonly addRoomId:string|null;readonly room:EMFRoomView;readonly note:EMFFieldView;readonly interpret:boolean;readonly interpretId:string|null;readonly deleteId:string|null}
export interface EMFAssessmentCardView {readonly expanded:boolean;readonly toggleId:string|null;readonly date:string;readonly label:string|null;readonly consultant:string|null;readonly severity:EMFSeverityView|null;readonly detail:EMFAssessmentDetailView|null}
export type EMFEditorBodyView={readonly kind:'empty'}|{readonly kind:'compare';readonly view:EMFComparisonView}|{readonly kind:'assessments';readonly cards:readonly EMFAssessmentCardView[]};
export interface EMFEditorView {readonly returnLabel:string|null;readonly ai:boolean;readonly compareLabel:string|null;readonly body:EMFEditorBodyView}
export interface EMFPreviewMeasurementView {readonly label:string;readonly value:string;readonly unit:string;readonly severity:EMFSeverityView|null}
export interface EMFPreviewRoomView {readonly name:string;readonly location:string|null;readonly measurements:readonly EMFPreviewMeasurementView[];readonly sources:string|null;readonly mitigations:string|null}
export interface EMFImportPreviewView {readonly date:string;readonly consultant:string|null;readonly rooms:readonly EMFPreviewRoomView[]}
export function renderEMFEditorPresentation(view:EMFEditorView):string{return renderEditor({view});}
export function renderEMFImportPreviewPresentation(view:EMFImportPreviewView):string{return renderPreview({view});}
/** Original escapeHTML/escapeAttr pre-encoding conversion; Svelte owns escaping. */
export function emfEditorText(value:unknown):string{return value==null?'':String(value);}
export function emfEditorAttribute(value:unknown):string|null{return value==null?null:String(value);}
