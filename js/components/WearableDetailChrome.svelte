<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {WearableDetailView} from '../wearable-detail-presentation.js';
 import WearableDetailStats from './WearableDetailStats.svelte';
 import WearableDetailFeedback from './WearableDetailFeedback.svelte';
 import WearableManualEntries from './WearableManualEntries.svelte';
 let {view}:{view:WearableDetailView}=$props();
 
</script><svelte:options preserveWhitespace={true}/><button class="modal-close" data-wearable-action="modal-close">&times;</button>
    <h3>{view.label}{#if view.subLabel!==null} <span style={componentStaticStyles.wearableSubLabel}>{view.subLabel}</span>{/if}</h3>
    <div class="modal-unit">
      {view.sourceName}{view.delta} · {view.trend} 30d
      {#if view.sourceSwap}{#if view.sourceSwap.kind==='paired'}<button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" data-wearable-action="choose-source" data-wearable-metric="bp_systolic" title="Switch systolic source">sys via {view.sourceSwap.systolic} · swap</button>
            <button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" data-wearable-action="choose-source" data-wearable-metric="bp_diastolic" title="Switch diastolic source">dia via {view.sourceSwap.diastolic} · swap</button>{:else}<button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" data-wearable-action="choose-source" data-wearable-metric={view.sourceSwap.metric} title="Switch source for this metric">via {view.sourceSwap.name} · swap</button>{/if}{/if}
    </div>
    <div class="ctx-btn-group wearable-detail-range" role="group" aria-label="Chart range">{#each view.ranges as range}<button type="button" class="ctx-btn-option{range.active?' active':''}" aria-pressed="{range.active}" data-wearable-action="set-detail-range" data-wearable-metric={range.metric} data-wearable-range={range.range}>{range.label}</button>{/each}</div>
    <div class="modal-chart" style={componentStaticStyles.wearableChart}><canvas id="chart-modal"></canvas></div>
    {#if view.emptyHint}<WearableDetailFeedback view={view.emptyHint}/>{/if}
    <div class="wearable-detail-stats"><WearableDetailStats view={view.stats}/></div>
    {#if view.manualEntries}<WearableManualEntries view={view.manualEntries}/>{/if}
    {#if view.emfHint}<WearableDetailFeedback view={view.emfHint}/>{/if}