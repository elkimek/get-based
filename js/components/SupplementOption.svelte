<script lang="ts">
  let {view}: {view: Readonly<{value: string; selected: boolean; label: string}>} = $props();
</script><svelte:options preserveWhitespace /><option value={view.value} selected={view.selected}>{view.label}</option>
