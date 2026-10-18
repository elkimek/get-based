import {escapeHTML,escapeAttr} from './utils.js';
import type {state} from './state.js';
import type {CORRELATION_PRESETS} from './schema.js';
import type {CompareMarker,CompareCategory} from '../types/compare-correlations.js';
type Actions=()=>string;
type Preset=(typeof CORRELATION_PRESETS)[number];
type Therapy=(typeof state.importedData.supplements)[number];

/** Explicit public string serializers retain the former helper API for callers
 * supplying HTML. First-party feature composition uses the genuine readonly
 * view functions below and never passes ordinary children through these APIs. */
export function renderCorrelationsSelectionPage(inputActions: string, focusActions: string, presets: string, aiActions: string): string {
    return `<div class="category-header"><h2>Correlations</h2>
<p>Compare biomarker trends with recorded supplement and medication doses</p></div><div class="correlation-controls">
<h3>Select biomarkers, supplements &amp; medications (up to 8)</h3>
<div class="corr-select-row">
<div class="corr-dropdown">
<input type="text" class="corr-search" id="corr-search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="corr-options" aria-label="Search biomarkers, supplements and medications" placeholder="Search your data..."
${(inputActions + ' ' + focusActions)}>
<div class="corr-options" id="corr-options" role="listbox" aria-label="Available items" aria-multiselectable="true"></div>
</div>
</div>
<div class="corr-chips" id="corr-chips"></div>
<p class="corr-help" id="corr-selection-status" role="status"></p>
<details class="corr-presets"><summary>Marker presets</summary><p class="corr-help">Explore related markers already in your data. Replaces markers; keeps treatments.</p><div class="corr-preset-grid">${(presets)}</div></details><p class="corr-help" id="corr-selection-help">Choose two biomarkers, or a biomarker and a treatment.</p></div><div class="corr-chart-container" id="corr-chart-container" style="display:none">
<h3><span id="corr-chart-title">Explore selected data</span>
<button class="corr-ask-ai-btn" ${(aiActions)} title="Ask AI about these correlations">Ask AI</button>
</h3>
<div id="corr-therapy-results"></div></div>`;
}
export function renderCorrelationsPreset(preset: Preset, names: string, available: number, actions: Actions): string {
    return `<button class="corr-preset-btn" aria-label="${(escapeAttr(preset.label))}" ${(actions() + (available ? '' : ' disabled'))}><strong>${(escapeHTML(preset.label))}</strong><span>${(escapeHTML(names))}</span><small>${(`${available}`)}/${(`${preset.markers.length}`)} available</small></button>`;
}
export function renderCorrelationsStatus(kind:'loading'|'failure'):string{return renderPage({view:{kind}});}
export function renderCorrelationMarkerOption(selected: boolean, key: string, marker: CompareMarker, category: CompareCategory, count: number, actions: Actions): string {
    return `<div class="corr-option ${(selected ? 'selected' : '')}"
        data-key="${(escapeAttr(key))}" data-name="${(escapeHTML(marker.name))}" data-cat="${(escapeHTML(category.label))}"
        role="option" ${('aria-selected="' + `${selected}` + '"')} tabindex="-1" ${(actions())}>
${(escapeHTML(marker.name))} <span class="opt-cat">${(escapeHTML(category.label))} · ${(`${count}`)} results</span></div>`;
}
export function renderCorrelationTherapyOption(selected: boolean, id: string, therapy: Therapy, category: 'Medication' | 'Supplement', actions: Actions): string {
    return `<div class="corr-option ${(selected ? 'selected' : '')}" data-key="${(escapeAttr(id))}" data-name="${(escapeAttr(therapy.name || ''))}" data-cat="${(category)}" role="button" tabindex="0" ${(actions())}>${(escapeHTML(therapy.name || 'Unnamed item'))} <span class="opt-cat">${(category)} · ${(escapeHTML(therapy.startDate || therapy.periods?.[0]?.start || 'undated'))}</span></div>`;
}
export function renderCorrelationNoResults():string{return renderOptions({view:{kind:'empty'}});}
export function renderCorrelationMarkerChip(marker: CompareMarker, color: unknown, actions: Actions): string {
    return `<span class="corr-chip" style="background:${(`${color}20`)};border-color:${(`${color}`)};color:${(`${color}`)}">
${(escapeHTML(marker.name))} <button type="button" class="chip-remove" aria-label="Remove ${(escapeAttr(marker.name))}" ${(actions())}>&times;</button></span>`;
}
export function renderCorrelationTherapyChip(therapy: Therapy, actions: Actions): string {
    return `<span class="corr-chip">${(escapeHTML(therapy.name))} <button type="button" class="chip-remove" aria-label="Remove ${(escapeAttr(therapy.name))}" ${(actions())}>&times;</button></span>`;
}

import {renderHTML as renderPage} from './components/CorrelationsSelectionPage.svelte.html.js';
import {renderHTML as renderOptions} from './components/CorrelationsSelectionOptions.svelte.html.js';
import {renderHTML as renderChips} from './components/CorrelationsSelectionChips.svelte.html.js';
import {categoryLiteral} from './category-presentation.js';
export interface CorrelationPresetView {
 readonly ariaLabel:string;readonly index:string;readonly disabled:boolean;
 readonly label:string;readonly names:string;readonly available:string;readonly total:string;
}
export type CorrelationsSelectionPageView={readonly kind:'page';readonly presets:readonly CorrelationPresetView[]}|{readonly kind:'loading'|'failure'};
export type CorrelationOptionView={readonly kind:'marker';readonly selected:boolean;readonly key:string;
 readonly name:string;readonly category:string;readonly label:string;readonly categoryLabel:string;readonly count:string}|{
 readonly kind:'therapy';readonly selected:boolean;readonly key:string;readonly name:string;readonly category:'Medication'|'Supplement';
 readonly label:string;readonly date:string};
export type CorrelationsOptionsView={readonly kind:'options';readonly options:readonly CorrelationOptionView[]}|{readonly kind:'empty'};
export type CorrelationChipView={readonly kind:'marker';readonly background:string;readonly border:string;readonly color:string;readonly label:string;readonly ariaLabel:string;readonly key:string}|{
 readonly kind:'therapy';readonly label:string;readonly ariaLabel:string;readonly key:string};
export function projectCorrelationsPreset(preset:Preset,names:string,available:number,index:number):CorrelationPresetView {
 const ariaLabel=categoryLiteral(preset.label),actionIndex=String(index),disabled=!available;
 const label=categoryLiteral(preset.label),literalNames=categoryLiteral(names),count=`${available}`,total=`${preset.markers.length}`;
 return {ariaLabel,index:actionIndex,disabled,label,names:literalNames,available:count,total};
}
export function projectCorrelationMarkerOption(selected:boolean,key:string,marker:CompareMarker,category:CompareCategory,count:number):CorrelationOptionView {
 const literalKey=categoryLiteral(key),name=categoryLiteral(marker.name),literalCategory=categoryLiteral(category.label);
 const label=categoryLiteral(marker.name),categoryLabel=categoryLiteral(category.label),results=`${count}`;
 return {kind:'marker',selected,key:literalKey,name,category:literalCategory,label,categoryLabel,count:results};
}
export function projectCorrelationTherapyOption(selected:boolean,id:string,therapy:Therapy,category:'Medication'|'Supplement'):CorrelationOptionView {
 const key=categoryLiteral(id),name=categoryLiteral(therapy.name||'');
 const label=categoryLiteral(therapy.name||'Unnamed item'),date=categoryLiteral(therapy.startDate||therapy.periods?.[0]?.start||'undated');
 return {kind:'therapy',selected,key,name,category,label,date};
}
export function projectCorrelationMarkerChip(marker:CompareMarker,color:unknown,key:string):CorrelationChipView {
 const background=`${color}20`,border=`${color}`,literalColor=`${color}`;
 const label=categoryLiteral(marker.name),ariaLabel=categoryLiteral(marker.name);
 return {kind:'marker',background,border,color:literalColor,label,ariaLabel,key};
}
export function projectCorrelationTherapyChip(therapy:Therapy,key:string):CorrelationChipView {
 const label=categoryLiteral(therapy.name),ariaLabel=categoryLiteral(therapy.name);
 return {kind:'therapy',label,ariaLabel,key};
}
export function renderCorrelationsPage(view:CorrelationsSelectionPageView):string{return renderPage({view});}
export function renderCorrelationsOptions(options:readonly CorrelationOptionView[]):string{return renderOptions({view:{kind:'options',options}});}
export function renderCorrelationsChips(chips:readonly CorrelationChipView[]):string{return renderChips({chips});}
