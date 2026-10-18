<script lang="ts">
 import type {WearableStripView} from '../wearable-strip-presentation.js';
 import WearableStripHeader from './WearableStripHeader.svelte';
 import WearableMetricCard from './WearableMetricCard.svelte';
 import WearableEmptyCard from './WearableEmptyCard.svelte';
 let {view}:{view:WearableStripView}=$props();
 
</script><svelte:options preserveWhitespace={true}/><section class="wearable-strip" id="wearable-strip">
    <WearableStripHeader view={view.header}/>
    <div class="wearable-card-grid{view.header.collapsed?' hidden':''}{view.header.reorderMode?' wearable-card-grid-reorder':''}">{#each view.cards as item}{#if view.header.reorderMode}<div class="wearable-card-reorder-wrap" data-reorder-metric="{item.metric}">
        {#if item.card.kind==='empty'}<WearableEmptyCard view={item.card.view}/>{:else}<WearableMetricCard view={item.card.view}/>{/if}
        <div class="wearable-reorder-arrows">
          <button type="button" class="wearable-reorder-arrow" aria-label="Move {item.leftLabel} left" disabled={!item.canLeft} data-wearable-action="move-card" data-wearable-metric={item.metric} data-wearable-delta="-1">◀</button>
          <button type="button" class="wearable-reorder-arrow" aria-label="Move {item.rightLabel} right" disabled={!item.canRight} data-wearable-action="move-card" data-wearable-metric={item.metric} data-wearable-delta="1">▶</button>
        </div>
      </div>{:else}{#if item.card.kind==='empty'}<WearableEmptyCard view={item.card.view}/>{:else}<WearableMetricCard view={item.card.view}/>{/if}{/if}{/each}</div>{#if view.waitingNote!==null||view.hrvNote!==null}<div class="wearable-strip-footer{view.header.collapsed?' hidden':''}">{#if view.waitingNote!==null}<span class="wearable-strip-footer-note">{view.waitingNote}</span>{/if}{#if view.hrvNote!==null}<span class="wearable-strip-footer-note">{view.hrvNote}</span>{/if}</div>{/if}</section>