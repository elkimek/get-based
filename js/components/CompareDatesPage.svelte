<script lang="ts">
 import type {CompareDatesPageView} from '../compare-dates-presentation.js';
 let {view}:{view:CompareDatesPageView}=$props();
</script><svelte:options preserveWhitespace/><div class="category-header"><h2>Compare Dates</h2>
<p>Side-by-side comparison of biomarker values between two collection dates</p></div>{#if view.kind==='empty'}<div class="empty-state"><div class="empty-state-icon">↔</div>
<h3>Not Enough Data</h3><p>Import at least 2 lab result dates to compare values side by side.</p></div>{:else}<div class="compare-controls">
<label class="compare-date-field" for="compare-select-1"><span>Date 1:</span>
<select id="compare-select-1" data-compare-change-action="set-date" data-compare-index="1">{#each view.first as option}<option value={option.value}>{option.label}</option>{/each}</select>
</label>
<button class="compare-swap-btn" data-compare-action="swap-dates" title="Swap dates" aria-label="Swap dates">⇄</button>
<label class="compare-date-field" for="compare-select-2"><span>Date 2:</span>
<select id="compare-select-2" data-compare-change-action="set-date" data-compare-index="2">{#each view.second as option}<option value={option.value}>{option.label}</option>{/each}</select>
</label>
</div><div id="compare-results"></div>{/if}
