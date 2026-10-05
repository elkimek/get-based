<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
  let failed = $state(false);
  onMount(() => {
    // The native shell sits outside Kit's route DOM; services initialize once.
    document.documentElement.dataset.shellFramework = 'sveltekit';
    void import('../../../main.js').catch(() => { failed = true; });
  });
</script>
{@render children()}
{#if failed}<p role="alert">getbased could not start. Reload the application to try again.</p>{/if}
