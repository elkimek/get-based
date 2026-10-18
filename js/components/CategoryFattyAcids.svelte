<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryFattyAcidsView} from '../category-presentation.js';
 import CategoryRangeRail from './CategoryRangeRail.svelte';
 import CategoryRangeText from './CategoryRangeText.svelte';
 let {view}:{view:CategoryFattyAcidsView}=$props();
</script><svelte:options preserveWhitespace/><div style={componentStaticStyles.fattyAcidsCard}>
    <h3 style={componentStaticStyles.fattyAcidsHeading}>Fatty Acid Profile{view.date}</h3>
    <div class="fa-bar-chart-container"><canvas id="chart-fa-bar"></canvas></div></div><div class="fatty-acids-grid">{#each view.cards as card}<div class="fa-card" role="button" tabindex="0" aria-label={card.label} data-marker-detail-action="show-detail-modal" data-marker-detail-id={card.id} style={componentStaticStyles.pointer}><div class="fa-card-name">{card.name}</div>
      <div class="fa-card-value val-{card.status}">{card.value}{card.unit}</div>
      <div class="fa-card-ref"><CategoryRangeText view={card.range} fatty/></div>
      <CategoryRangeRail view={card.rail}/></div>{/each}</div>
