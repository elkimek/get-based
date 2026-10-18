<script lang="ts">
 import type {CategoryGapSectionView} from '../category-page-presentation.js';
 let {sections}:{sections:readonly CategoryGapSectionView[]}=$props();
</script><svelte:options preserveWhitespace/>{#each sections as section}<div class="chart-card-gap-section"><p>{section.heading}</p><div class="chart-card-gap-list">{#each section.markers as marker}<button type="button" class="chart-card chart-card-add" aria-label="Open {marker.accessibleName} details" data-marker-detail-action="show-detail-modal" data-marker-detail-id={marker.id}>
        <span>{marker.name}</span><span>{marker.suffix}</span></button>{/each}</div></div>{/each}
