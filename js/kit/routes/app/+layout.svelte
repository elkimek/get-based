<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
  let failed = $state(false);
  onMount(() => {
    // Shared domain services initialize after the route's components hydrate.
    document.documentElement.dataset.shellFramework = 'sveltekit';
    void import('../../../main.js').catch(() => { failed = true; });
  });
</script>
{@render children()}
{#if failed}<p role="alert">getbased could not start. Reload the application to try again.</p>{/if}
