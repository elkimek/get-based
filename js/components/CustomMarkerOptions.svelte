<script lang="ts">
  import type {CustomMarkerOptionView} from '../custom-marker-presentation.js';
  let {rows}: {rows:readonly CustomMarkerOptionView[]} = $props();
</script><svelte:options preserveWhitespace />{#each rows as row}<option value={row.value}>{row.label}</option>{/each}