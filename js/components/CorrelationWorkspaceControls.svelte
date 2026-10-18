<script lang="ts">import type {CorrelationControlsView,CorrelationChoiceGroup} from '../correlation-workspace-controls-presentation.js';let {view}:{view:CorrelationControlsView}=$props();</script><svelte:options preserveWhitespace={true}/>{#snippet choices(choiceGroup:CorrelationChoiceGroup)}<div class="corr-control" hidden={choiceGroup.hidden}><span>{choiceGroup.label}</span><div class="date-range-filter" id="corr-{choiceGroup.key}" role="group" aria-label="{choiceGroup.accessibleLabel}">{#each choiceGroup.choices as choice}<button type="button" class="range-btn{choice.classSuffix}" id="corr-{choice.idKey}-{choice.idValue}" data-corr-choice="{choice.action}" data-corr-value="{choice.value}" aria-pressed={choice.pressed} disabled={choice.disabled}>{choice.label}</button>{/each}</div></div>{/snippet}<div class="corr-workspace-tools">
{@render choices(view.dateChoices)}
{#if view.dates!==null}<div class="corr-custom-dates"><label>From<input id="corr-start" type="date" data-corr-setting="start" value="{view.dates.start}"></label><label>To<input id="corr-end" type="date" data-corr-setting="end" value="{view.dates.end}"></label></div>{/if}
</div>
<p class="corr-help">{view.rangeHelp}</p>
<div class="corr-workspace-tools" hidden={view.layoutHidden}>
{@render choices(view.grouping)}
{@render choices(view.layout)}
</div>
{#if view.noLabs!==null}<p class="corr-dose-notice" role="status">No lab results in this date range. Choose a wider range to include earlier measurements.</p>{/if}
<p id="corr-layout-status" class="sr-only" role="status" hidden={view.statusHidden}>{view.statusGrouping} · {view.statusCount} {view.statusNoun}. {view.statusDetail}</p>
{#if view.rangeError!==null}<p role="alert">{view.rangeError.message}</p>{/if}
<div class="corr-workspace-tabs" aria-label="Analysis view">{#each view.tabs as tab}<button type="button" id="corr-tab-{tab.id}" data-corr-tab="{tab.action}" aria-pressed={tab.pressed}>{tab.label}</button>{/each}</div>
{#each view.ingredients as ingredient}<label class="corr-ingredient-picker">Dose ingredient · {ingredient.name}<select data-corr-ingredient="{ingredient.id}">{#each ingredient.options as option}<option value="{option.value}" selected={option.selected}>{option.label}</option>{/each}</select></label>{/each}
<div class="corr-series" aria-label="Visible series" hidden={view.seriesHidden}>{#each view.series as series}<button type="button" data-corr-series="{series.id}" aria-pressed={series.pressed}><i style="border-color:{series.color};border-top-style:{series.dash}"></i>{series.name}{series.ingredient}{series.unit}</button>{/each}</div>{'\n'}