<svelte:options preserveWhitespace={true} /><script lang="ts">
  let { full, short }: { full: string; short: string } = $props();
</script><a href={'https://github.com/elkimek/get-based/commit/' + full} target="_blank" rel="noopener">{short}</a>