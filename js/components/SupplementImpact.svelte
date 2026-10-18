<script lang="ts">
  import type { SupplementImpactView } from '../supplement-impact-presentation.js';
  let { view }: { view: SupplementImpactView } = $props();
</script><svelte:options preserveWhitespace />{#if view.kind === 'hint'}<div class="supp-impact-section"><div class="supp-impact-header"><span class="ctx-health-dot ctx-health-dot-gray"></span><span>Impact Analysis</span></div><div class="supp-impact-hint">{view.hint}</div></div>{:else}<div class="supp-impact-section">
    <div class="supp-impact-header">
      <span class={'ctx-health-dot ' + view.dotClass} id={view.dotId}></span>
      <span>Impact Analysis</span>
      {#if view.refreshIndex !== null}<button class="supp-impact-refresh" data-supp-action="refresh-impact" data-supp-index={view.refreshIndex} title="Re-analyze with current data">refresh</button>{/if}
    </div>
    <div class={'supp-impact-summary ' + view.summaryClass} id={view.summaryId}>{view.summaryText}</div>
  </div>{/if}