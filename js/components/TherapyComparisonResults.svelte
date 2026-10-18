<script lang="ts">
 import type {TherapyComparisonView} from '../therapy-comparison-presentation.js';
 import TherapyComparisonEntries from './TherapyComparisonEntries.svelte';
 let {view}:{view:TherapyComparisonView}=$props();
</script><svelte:options preserveWhitespace/><section class="corr-therapy-card" aria-label="{view.marker} × {view.therapy}">
<p class="corr-stat">{view.status}</p>
<details><summary>Data &amp; limitations · {view.excluded} excluded lab results</summary>
{#if view.warnings!==null}<ul class="corr-help">{#each view.warnings as warning}<li>{warning}</li>{/each}</ul>{/if}
{#if view.baseline}<p class="corr-help">Before first recorded use: {view.baseline.count} measurements, mean {view.baseline.mean} {view.baseline.unit}. Prior intake is unknown, not zero.</p>{/if}
{#if view.groups.length}<div class="corr-data-scroll" {...view.scroll} role="region" aria-label="Marker averages by recorded dose"><table class="corr-data-table"><caption>Dose-group averages; lab dates may be months apart.</caption><thead><tr><th>Dose</th><th>Measurements</th><th>Mean marker value</th><th>Lab dates</th></tr></thead><tbody><TherapyComparisonEntries view={{kind:'groups',rows:view.groups}}/></tbody></table></div>{:else}<p class="corr-help">No lab measurements have usable numeric dose information.</p>{/if}
<div class="corr-data-scroll" {...view.scroll} role="region" aria-label="Measurements and exclusions"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>Marker value</th><th>Recorded dose / status</th><th>Days since change</th><th>Analysis status</th><th>Source entry</th></tr></thead><tbody>{#if view.rows.length}<TherapyComparisonEntries view={{kind:'measurements',rows:view.rows}}/>{:else}<tr><td colspan="6">No measurements for this marker.</td></tr>{/if}</tbody></table></div>
<p class="corr-help">Use is recorded, not verified. Days since change runs from period start to lab date. Conflicting same-date results are excluded; duplicates count once. Gaps mean unknown, not zero. End dates are inclusive; breaks do not imply washout.</p>
<ul class="corr-period-list"><TherapyComparisonEntries view={{kind:'periods',rows:view.periods}}/></ul>
</details>
</section>
