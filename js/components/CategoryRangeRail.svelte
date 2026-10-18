<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryRangeRailView} from '../category-presentation.js';
 let {view}:{view:CategoryRangeRailView|null}=$props();
</script><svelte:options preserveWhitespace/>{#if view}<div class="range-bar" style={view.style}>
    {#if view.lowWidth}<div class="range-bar-zone range-bar-zone-low" style="{componentStaticStyles.rangeLowStart}width:{view.lowWidth}%"></div>{/if}
    {#if view.goodWidth}<div class="range-bar-fill" style="left:{view.goodLeft}%;width:{view.goodWidth}%"></div>{/if}
    {#if view.highWidth}<div class="range-bar-zone range-bar-zone-high" style="left:{view.goodRight}%;width:{view.highWidth}%"></div>{/if}
    <div class="range-bar-marker marker-{view.status}" style="left:{view.dot}%"></div>
  </div>{:else}—{/if}
