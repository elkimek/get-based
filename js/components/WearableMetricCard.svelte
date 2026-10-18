<script lang="ts">
 import type {WearableMetricCardView} from '../wearable-strip-presentation.js';
 import WearableSparkline from './WearableSparkline.svelte';
 let {view}:{view:WearableMetricCardView}=$props();
 const attributes=$derived(view.interactive?{'data-wearable-action':'open-detail','data-wearable-metric':view.metric,role:'button' as const,tabindex:0}:{});
</script><svelte:options preserveWhitespace={true}/><div class="wearable-card" {...attributes} aria-label="{view.accessibleLabel}">
    <div class="wearable-card-top">
      <span class="wearable-metric-name">{view.label}{#if view.subLabel!==null} <span class="wearable-metric-sub">{view.subLabel}</span>{/if}</span>
      {#if view.delta}<span class="wearable-delta {view.delta.className}">{view.delta.text}</span>{/if}
    </div>
    <div class="wearable-value-row">
      <span class="wearable-value">{view.value}</span>{#if view.unit!==null}<span class="wearable-unit{view.unitTight?' wearable-unit-tight':''}">{view.unit}</span>{/if}
      <span class="wearable-baseline">baseline {view.baselineValue}{view.baselineUnit}</span>
      {#if view.staleness}<span class="wearable-staleness" title="Latest sample for this metric is from {view.staleness.date} — your wearable hasn't published a more recent reading yet (some metrics process slower than others).">as of {view.staleness.label}</span>{/if}
    </div>
    {#if view.sparkline}<WearableSparkline view={view.sparkline}/>{/if}
    <div class="wearable-card-bottom">
      <div class="wearable-trend-pill {view.trendClass}">{view.trendLabel}</div>
      {#if view.sourceBadge}<button type="button" class="wearable-source-badge wearable-source-badge-btn" data-wearable-action="choose-source" data-wearable-metric={view.sourceBadge.metric} title="Click to switch source for this metric">via {view.sourceBadge.name}</button>{/if}
    </div>
  </div>