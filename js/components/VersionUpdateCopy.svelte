<svelte:options preserveWhitespace={true} /><script lang="ts">
  let { installed }: { installed: boolean } = $props();
</script><strong>{installed ? 'New version installed.' : 'Update ready.'}</strong> Reload when you are ready.