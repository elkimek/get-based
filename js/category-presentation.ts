import {renderHTML as renderCard} from './components/CategoryChartCard.svelte.html.js';
import {renderHTML as renderTable} from './components/CategoryDataTable.svelte.html.js';
import {renderHTML as renderHeatmap} from './components/CategoryHeatmap.svelte.html.js';
import {renderHTML as renderFatty} from './components/CategoryFattyAcids.svelte.html.js';
import {renderHTML as renderColumns} from './components/CategoryTableColgroup.svelte.html.js';

export interface CategoryRangeRailView {
 readonly status:string; readonly style:string|null; readonly dot:number;
 readonly lowWidth:number; readonly goodLeft:number; readonly goodWidth:number;
 readonly goodRight:number; readonly highWidth:number;
}
export interface CategoryTrendView {readonly className:string;readonly label:string;readonly title:string;readonly arrow:string}
export interface CategoryRangeRowView {readonly label:string;readonly value:string;readonly unit:string|null}
export interface CategoryRecentValueView {readonly title:string;readonly date:string;readonly status:string;readonly value:string}
export interface CategoryChartCardView {
 readonly id:string;readonly status:string;readonly nameTitle:string;readonly name:string;
 readonly icon:string;readonly statusLabel:string;readonly trend:CategoryTrendView|null;
 readonly accessibleLabel:string;readonly stacked:boolean;readonly latestValue:string;
 readonly latestUnit:string|null;readonly latestMetadata:string;readonly rangeLabel:string;
 readonly ranges:readonly CategoryRangeRowView[];readonly recentCount:number;
 readonly recent:readonly CategoryRecentValueView[];
}
export type CategoryRangeTextView={readonly kind:'single';readonly text:string}|{
 readonly kind:'both';readonly referenceMinimum:string;readonly referenceMaximum:string;
 readonly optimalMinimum:string;readonly optimalMaximum:string};
export interface CategoryTableCellView {readonly status:string;readonly value:string;readonly emptyAction:{readonly id:string;readonly date:string;readonly title:string}|null}
export interface CategoryTableRowView {readonly id:string|null;readonly name:string;readonly unit:string;
 readonly range:CategoryRangeTextView;readonly values:readonly CategoryTableCellView[];
 readonly trend:{readonly className:string;readonly arrow:string};readonly rail:CategoryRangeRailView|null}
export interface CategoryHeatmapRowView {readonly id:string;readonly accessibleName:string;readonly name:string;
 readonly values:readonly {readonly status:string;readonly label:string;readonly value:string}[]}
interface TableLayout {readonly columns:readonly string[];readonly dates:readonly string[];readonly minimumWidth:number}
export type CategoryDataTableView={readonly kind:'empty'}|({readonly kind:'data';readonly rows:readonly CategoryTableRowView[]}&TableLayout);
export type CategoryHeatmapView={readonly kind:'empty'}|({readonly kind:'heatmap';readonly rows:readonly CategoryHeatmapRowView[]}&TableLayout);
export type CategoryScrollableTableView=Exclude<CategoryDataTableView|CategoryHeatmapView,{kind:'empty'}>;
export interface CategoryFattyCardView {readonly id:string;readonly label:string;readonly name:string;readonly status:string;
 readonly value:string;readonly unit:string;readonly range:CategoryRangeTextView;readonly rail:CategoryRangeRailView|null}
export interface CategoryFattyAcidsView {readonly date:string;readonly cards:readonly CategoryFattyCardView[]}

export function categoryLiteral(value:unknown):string{return value==null?'':String(value);}
/** Public table label input has historically been escaped by its caller. Decode
 * only those five escaped characters once; the genuine child escapes the literal. */
export function categorySafeLabel(value:unknown):string {
 const text=`${value}`;
 return text.replace(/&(amp|lt|gt|quot|#39);/g,(_,entity:string)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[entity]!);
}
export function renderCategoryChartCard(view:CategoryChartCardView|null):string{return view?renderCard({view}):'';}
export function renderCategoryTable(view:CategoryDataTableView):string{return renderTable({view});}
export function renderCategoryHeatmap(view:CategoryHeatmapView):string{return renderHeatmap({view});}
export function renderCategoryFatty(view:CategoryFattyAcidsView|null):string{return view?renderFatty({view}):'';}
export function renderCategoryColumns(columns:readonly string[]):string{return renderColumns({columns});}
