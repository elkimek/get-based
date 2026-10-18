<script lang="ts">
  import WearableSourceCheck from './WearableSourceCheck.svelte';
  import type {SourcePickerRowView} from '../wearables-entry-presentation.js';
  let {view}: {view: SourcePickerRowView} = $props();
</script><svelte:options preserveWhitespace={true}/><button type="button" class={view.className} data-source={view.id}>
        <span>{view.name}</span>
        {#if view.selected}<WearableSourceCheck/>{/if}
      </button>