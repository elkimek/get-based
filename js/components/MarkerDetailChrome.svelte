<svelte:options preserveWhitespace={true}/><script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
import type {MarkerDetailChromeView} from '../marker-detail-view.js';
import MarkerDetailRange from './MarkerDetailRange.svelte';
import MarkerDetailHistory from './MarkerDetailHistory.svelte';
import MarkerDetailNotes from './MarkerDetailNotes.svelte';
import MarkerPlacementSummary from './MarkerPlacementSummary.svelte';
let {view}:{view:MarkerDetailChromeView}=$props();
</script>{#snippet chrome(node:MarkerDetailChromeView)}{#if node.kind === "renamed"} <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert renamed marker to original" title="Renamed — click to revert to original" data-marker-detail-action={node.revertActions.action} data-marker-detail-id={node.revertActions.id??undefined} style={componentStaticStyles.pointer}>renamed ×</span> <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" data-marker-detail-action={node.renameActions.action} data-marker-detail-id={node.renameActions.id??undefined} style={componentStaticStyles.renameControl}>rename</span>{:else if node.kind === "rename"} <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" data-marker-detail-action={node.actions.action} data-marker-detail-id={node.actions.id??undefined} data-marker-detail-date={node.actions.date??undefined} data-marker-detail-type={node.actions.type??undefined} style={componentStaticStyles.renameControl}>rename</span>{:else if node.kind === "alternate-optimal"} &middot; <span style={componentStaticStyles.optimalRange}>Optimal: {node.range}</span>{:else if node.kind === "alternate-unit"}<div class="modal-unit modal-unit-alt" title="Same marker, alternate unit system">≈ {node.unit}{#each node.ranges as range} · {#if range.optimal}<span style={componentStaticStyles.optimalRange}>{range.label}: {range.range}</span>{:else}{range.label}: {range.range}{/if}{/each}</div>{:else if node.kind === "header"}<div class="gb-detail-head">
      <div>
        <MarkerPlacementSummary view={node.placement}/>
        <h3>{node.name}{#if node.rename}{@render chrome(node.rename)}{/if}</h3>
        <div class="modal-unit">{node.unit}</div>
        {#if node.alternate}{@render chrome(node.alternate)}{/if}
      </div>
      <div class="gb-detail-head-actions">
        <button type="button" class="gb-detail-pin-btn{node.pinClass}" aria-pressed="{node.pinPressed}" title="{node.pinTitle}" data-marker-detail-action={node.pinActions.action} data-marker-detail-id={node.pinActions.id??undefined}>{node.pinText}</button>
        <span class="gb-detail-status gb-detail-status-{node.statusClass}">{node.status}</span>
      </div>
      <button type="button" class="modal-close" aria-label="Close" data-marker-detail-action={node.closeActions.action}>&times;</button>
    </div>
    <div class="marker-description" id="marker-desc"></div>
    <div class="gb-detail-summary">
      <div class="stat-card">
        <div class="stat-card-label">Latest</div>
        <div class="stat-card-value val-{node.latestStatus}">{node.latest}{#if node.latestUnit}{@render chrome(node.latestUnit)}{/if}</div>
        <div class="stat-card-meta">{node.latestDate}{node.latestDelta}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Ranges</div>
        <div class="stat-card-value stat-card-value-range">{node.range} <span>{node.rangeLabel}</span></div>
        {#if node.secondary}{@render chrome(node.secondary)}{/if}
        {#if node.rangeControls}{@render chrome(node.rangeControls)}{/if}
      </div>
    </div>
    {#if node.rangeBand}<MarkerDetailRange view={node.rangeBand}/>{/if}
    <div class="gb-detail-section-label">Trend</div>
    <div class="modal-chart"><canvas id="chart-modal"></canvas></div>
    <div class="gb-detail-section-label">History <span>All time</span></div>{:else if node.kind === "latest-unit"} <span>{node.unit}</span>{:else if node.kind === "secondary-range"}<div class="stat-card-meta">{node.label} {node.range}</div>{:else if node.kind === "latest-range"}<div class="stat-card-meta">Used for the latest status</div>{:else if node.kind === "range-controls"}<div class="stat-card-range-controls">{#each node.controls as control}<MarkerDetailRange view={control}/>{/each}{#if node.suggestion}<MarkerDetailRange view={node.suggestion}/>{/if}</div>{:else if node.kind === "primary-actions"}
    <div class="gb-detail-action-row">
      <button class="manual-entry-btn" data-marker-detail-action={node.manualActions.action} data-marker-detail-id={node.manualActions.id??undefined}>+ Add Value Manually</button>
      <button class="ask-ai-btn" data-marker-detail-action={node.askActions.action} data-marker-detail-id={node.askActions.id??undefined}>Ask AI</button>
    </div>{:else if node.kind === "recommendations"}<div id="rec-modal-{node.id}"></div>{:else if node.kind === "delete-marker"}<div style={componentStaticStyles.markerDeletePosition}><!-- svelte-ignore a11y_invalid_attribute (Existing delegated delete link preserves its native fragment href.) --><a href="#" style={componentStaticStyles.markerDeleteLabel} data-marker-detail-action={node.actions.action} data-marker-detail-id={node.actions.id??undefined} data-marker-detail-date={node.actions.date??undefined} data-marker-detail-type={node.actions.type??undefined}>Delete this marker</a></div>{:else if node.kind === "history"}
    <div class="modal-values-grid marker-history-list">{#each node.rows as row}<MarkerDetailHistory view={row}/>{/each}</div>{:else if node.kind === "actions"}<div class="gb-detail-actions">{@render chrome(node.primary)}<MarkerDetailNotes view={node.notes}/>{#if node.recommendations}{@render chrome(node.recommendations)}{/if}</div>{/if}{/snippet}{@render chrome(view)}