<script lang="ts">
 import type {WearableDetailStatView} from '../wearable-detail-presentation.js';
 
 let {view}:{view:readonly WearableDetailStatView[]}=$props();
 
</script><svelte:options preserveWhitespace={true}/>{#each view as stat}
    <div class="wearable-detail-stat" title={stat.tooltip??undefined}>
      <div class="wearable-detail-stat-label">{stat.label}</div>
      <div class="wearable-detail-stat-val">{stat.value}</div>
      {#if stat.sub!==null}<div class="wearable-detail-stat-sub">{stat.sub}</div>{/if}
    </div>{/each}