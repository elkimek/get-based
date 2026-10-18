<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CorrelationsSelectionPageView} from '../correlations-selection-presentation.js';
 let {view}:{view:CorrelationsSelectionPageView}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='page'}<div class="category-header"><h2>Correlations</h2>
<p>Compare biomarker trends with recorded supplement and medication doses</p></div><div class="correlation-controls">
<h3>Select biomarkers, supplements &amp; medications (up to 8)</h3>
<div class="corr-select-row">
<div class="corr-dropdown">
<input type="text" class="corr-search" id="corr-search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="corr-options" aria-label="Search biomarkers, supplements and medications" placeholder="Search your data..."
data-compare-input-action="filter-options" data-compare-focus-action="show-dropdown">
<div class="corr-options" id="corr-options" role="listbox" aria-label="Available items" aria-multiselectable="true"></div>
</div>
</div>
<div class="corr-chips" id="corr-chips"></div>
<p class="corr-help" id="corr-selection-status" role="status"></p>
<details class="corr-presets"><summary>Marker presets</summary><p class="corr-help">Explore related markers already in your data. Replaces markers; keeps treatments.</p><div class="corr-preset-grid">{#each view.presets as preset}<button class="corr-preset-btn" aria-label={preset.ariaLabel} data-compare-action="apply-preset" data-compare-index={preset.index} disabled={preset.disabled}><strong>{preset.label}</strong><span>{preset.names}</span><small>{preset.available}/{preset.total} available</small></button>{/each}</div></details><p class="corr-help" id="corr-selection-help">Choose two biomarkers, or a biomarker and a treatment.</p></div><div class="corr-chart-container" id="corr-chart-container" style={componentStaticStyles.hidden}>
<h3><span id="corr-chart-title">Explore selected data</span>
<button class="corr-ask-ai-btn" data-compare-action="ask-ai-correlations" title="Ask AI about these correlations">Ask AI</button>
</h3>
<div id="corr-therapy-results"></div></div>{:else if view.kind==='loading'}<p class="corr-help">Preparing comparison…</p>{:else}<p class="corr-help">Comparison could not load. Reselect an item to retry.</p>{/if}
