<script lang="ts">
 import type {CategoryOutsideRangeView} from '../category-page-presentation.js';
 import CategoryGlyph from './CategoryGlyph.svelte';
 let {view}:{view:CategoryOutsideRangeView}=$props();
</script><svelte:options preserveWhitespace/><div class="empty-state"><div class="empty-state-icon empty-state-icon-category"><CategoryGlyph view={view.glyph}/></div>
    <h3>No results in {view.label}</h3>
    <p>This category has older results. Choose a longer range or show the complete history.</p>
    <button type="button" class="range-btn" data-lab-data-action="set-date-range" data-lab-data-range="all">Show all results</button></div>
