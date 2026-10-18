import {renderHTML as renderPage} from './components/CategoryPageChrome.svelte.html.js';
import {renderHTML as renderBody} from './components/CategoryPageViewBody.svelte.html.js';
import type {CategoryChartCardView,CategoryDataTableView,CategoryHeatmapView,CategoryFattyAcidsView} from './category-presentation.js';
import type {LabDateRangeView} from './lab-date-range-presentation.js';
import type {ChartLayersView} from './chart-layers-presentation.js';
export interface CategoryGlyphView {readonly code:string;readonly large:boolean}
export interface CategoryGapSectionView {readonly heading:string;readonly markers:readonly {readonly id:string;readonly accessibleName:string;readonly name:string;readonly suffix:string}[]}
export interface CategoryOutsideRangeView {readonly glyph:CategoryGlyphView;readonly label:string}
export type CategoryPageBodyView=
 {readonly kind:'outside-range';readonly view:CategoryOutsideRangeView}|
 {readonly kind:'empty-category';readonly glyph:CategoryGlyphView;readonly lowercaseLabel:string}|
 {readonly kind:'empty-charts'}|
 {readonly kind:'charts';readonly cards:readonly CategoryChartCardView[];readonly gaps:readonly CategoryGapSectionView[]}|
 {readonly kind:'table';readonly view:CategoryDataTableView}|
 {readonly kind:'heatmap';readonly view:CategoryHeatmapView}|
 {readonly kind:'fatty';readonly view:CategoryFattyAcidsView|null};
export interface CategoryPageView {readonly key:string;readonly glyph:CategoryGlyphView;readonly label:string;readonly countLabel:string;
 readonly range:LabDateRangeView;readonly layers:ChartLayersView|null;readonly body:CategoryPageBodyView}
export function renderCategoryPagePresentation(view:CategoryPageView):string{return renderPage({view});}
export function renderCategoryPageBody(view:CategoryPageBodyView):string{return renderBody({view});}
