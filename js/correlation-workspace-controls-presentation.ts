import {renderHTML} from './components/CorrelationWorkspaceControls.svelte.html.js';
export interface CorrelationControlsView {readonly kind:"surface";readonly dateChoices:CorrelationChoiceGroup;readonly dates:CorrelationCustomDates|null;readonly rangeHelp:string;readonly layoutHidden:boolean;readonly grouping:CorrelationChoiceGroup;readonly layout:CorrelationChoiceGroup;readonly noLabs:CorrelationNoLabs|null;readonly statusHidden:boolean;readonly statusGrouping:string;readonly statusCount:string;readonly statusNoun:string;readonly statusDetail:string;readonly rangeError:CorrelationRangeError|null;readonly tabs:readonly CorrelationTab[];readonly ingredients:readonly CorrelationIngredientPicker[];readonly seriesHidden:boolean;readonly series:readonly CorrelationSeriesButton[];}
export interface CorrelationChoiceGroup {readonly kind:"choice-group";readonly hidden:boolean;readonly label:string;readonly key:string;readonly accessibleLabel:string;readonly choices:readonly CorrelationChoice[];}
export interface CorrelationChoice {readonly kind:"choice-button";readonly classSuffix:string;readonly idKey:string;readonly idValue:string;readonly action:string;readonly value:string;readonly pressed:boolean;readonly disabled:boolean;readonly label:string;}
export interface CorrelationCustomDates {readonly kind:"custom-dates";readonly start:string;readonly end:string;}
export interface CorrelationTab {readonly kind:"tab-button";readonly id:string;readonly action:string;readonly pressed:boolean;readonly label:string;}
export interface CorrelationIngredientPicker {readonly kind:"ingredient-picker";readonly name:string;readonly id:string;readonly options:readonly CorrelationIngredientOption[];}
export interface CorrelationIngredientOption {readonly kind:"ingredient-option";readonly value:string;readonly selected:boolean;readonly label:string;}
export interface CorrelationSeriesButton {readonly kind:"series-button";readonly id:string;readonly pressed:boolean;readonly color:string;readonly dash:string;readonly name:string;readonly ingredient:string;readonly unit:string;}
export interface CorrelationRangeError {readonly kind:"range-error";readonly message:string;}
export interface CorrelationNoLabs {readonly kind:"no-lab-results";}
export function renderCorrelationWorkspaceControl(view:CorrelationControlsView):string{return renderHTML({view});}
