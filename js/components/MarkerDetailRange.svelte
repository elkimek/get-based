<svelte:options preserveWhitespace={true}/><script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
import type {MarkerDetailRangeView} from '../marker-detail-view.js';
let {view}:{view:MarkerDetailRangeView}=$props();
</script>{#snippet range(node:MarkerDetailRangeView)}{#if
  node.kind === "band"}<div class="gb-range-band" aria-label="Range position">
      <div class="gb-range-band-track">
        {#if node.lowZone}{@render range(node.lowZone)}{/if}
        {#if node.highZone}{@render range(node.highZone)}{/if}
        {#if node.optimalZone}{@render range(node.optimalZone)}{/if}
      </div>
      <div class="gb-range-band-dot gb-range-band-dot-{node.status}" style="left:{node.position}%"></div>
      <div class="gb-range-band-scale"><span>{node.minimum}</span><span>{node.maximum}</span></div>
    </div>{:else if node.kind === "low-zone"}<div class="gb-range-band-zone gb-range-band-zone-low" style="{componentStaticStyles.rangeLowStart}width:{node.width}%"></div>{:else if node.kind === "high-zone"}<div class="gb-range-band-zone gb-range-band-zone-high" style="left:{node.left}%;width:{node.width}%"></div>{:else if node.kind === "optimal-zone"}<div class="gb-range-band-opt" style="left:{node.left}%;width:{node.width}%"></div>{:else if node.kind === "edited-badge"} <span class="ref-edited-badge" role="button" tabindex="0" aria-label="{node.label}" title="{node.title}" data-marker-detail-action={node.actions.action} data-marker-detail-id={node.actions.id??undefined} data-marker-detail-date={node.actions.date??undefined} data-marker-detail-type={node.actions.type??undefined}>{node.text} ×</span>{:else if node.kind === "edit-control"}{#if node.leadingSeparator!==false} · {/if}<button type="button" class="ref-editable{node.optimalClass}" aria-label="Edit {node.label} range, currently {node.currentRange}" data-marker-detail-action={node.actions.action} data-marker-detail-id={node.actions.id??undefined} data-marker-detail-date={node.actions.date??undefined} data-marker-detail-type={node.actions.type??undefined}>Edit {node.lowerLabel}</button>{#if node.badge}{@render range(node.badge)}{/if}{:else if
  node.kind === "suggestion"}<a class="marker-range-suggest" href="{node.href}" target="_blank" rel="noopener noreferrer" title="Open a public, pre-filled GitHub issue without including your health data">Suggest a better range <span aria-hidden="true">↗</span></a>{/if}{/snippet}{@render range(view)}