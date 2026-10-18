<script lang="ts">
  import type {WearableTagGroupView} from '../wearables-entry-presentation.js';
  let {view}: {view: WearableTagGroupView} = $props();
</script><svelte:options preserveWhitespace={true}/><div class="wearable-log-tags" role="group" aria-label="Optional context">
    {#each view.chips as chip}<button type="button" class="wearable-log-chip" data-wearable-log-action="toggle-chip" data-tag={chip.tag}>{chip.label}</button>{/each}
  </div>