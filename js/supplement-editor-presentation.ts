import {renderHTML as renderEditor} from './components/SupplementEditor.svelte.html.js';
import {renderHTML as renderExpanded} from './components/SupplementExpanded.svelte.html.js';
import type {SupplementImpactView} from './supplement-impact-presentation.js';
import type {SupplementFormView} from './supplement-form-presentation.js';

export interface SupplementExpandedView {readonly index:string; readonly impact:SupplementImpactView; readonly form:SupplementFormView}
export interface SupplementQualityOverviewRow {readonly analyte:string; readonly reported:readonly {readonly product:string;readonly result:string}[];readonly total:string}
export interface SupplementEditorRow {
  readonly groupLabel:string|null;readonly active:boolean;readonly index:string;readonly ariaName:string;readonly icon:string;
  readonly name:string;readonly statusClass:string;readonly statusText:string;readonly dosage:string|null;readonly dateRange:string;
  readonly source:Readonly<{url:string;host:string}>|null;readonly dose:string|null;
  readonly ingredients:readonly Readonly<{name:string;amount:string;times:string;total:string}>[];
  readonly qualityText:string|null;readonly note:string|null;readonly expanded:SupplementExpandedView|null;
}
export interface SupplementEditorView {readonly quality:readonly SupplementQualityOverviewRow[];readonly hasRows:boolean;readonly rows:readonly SupplementEditorRow[]}
export function renderSupplementEditor(view:SupplementEditorView):string{return renderEditor({view});}
export function renderSupplementExpanded(view:SupplementExpandedView):string{return renderExpanded({view});}
