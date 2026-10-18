<script lang="ts">
 import type {WearableEmptyCardView} from '../wearable-strip-empty-presentation.js';
 let {view}:{view:WearableEmptyCardView}=$props();
 const attributes=$derived(view.interactive?{'data-wearable-action':'open-manual-log','data-wearable-metric':view.metric,role:'button' as const,tabindex:0}:{'aria-disabled':'true' as const});
</script><svelte:options preserveWhitespace={true}/><div class="wearable-card wearable-card-empty" data-empty-metric={view.metric} {...attributes} aria-label="Log {view.accessibleLabel} manually">
    <div class="wearable-card-top">
      <span class="wearable-metric-name">{view.label}{#if view.sub!==null} <span class="wearable-metric-sub">{view.sub}</span>{/if}</span>
    </div>
    <div class="wearable-value-row wearable-value-row-empty">
      <span class="wearable-value wearable-value-dash">–</span>
    </div>
    <div class="wearable-card-bottom">
      <div class="wearable-empty-cta">+ Log</div>
    </div>
  </div>