<script lang="ts">
  import WearableSourceCheck from './WearableSourceCheck.svelte';
  import WearableSourceRow from './WearableSourceRow.svelte';
  import type {SourcePickerView} from '../wearables-entry-presentation.js';
  let {view}: {view: SourcePickerView} = $props();
</script><svelte:options preserveWhitespace={true}/>{#if view.mode === "shell"}
    <div class="wearable-source-picker-head">{view.label} source</div>
    {#each view.rows as row}<WearableSourceRow view={row}/>{/each}
    <button type="button" class="wearable-source-picker-item wearable-source-picker-auto" data-source="">
      <span>Auto (most recent)</span>
      {#if view.automatic}<WearableSourceCheck/>{/if}
    </button>
  {:else if view.mode === "row"}{#if view.row}<WearableSourceRow view={view.row}/>{/if}{:else}<WearableSourceCheck/>{/if}