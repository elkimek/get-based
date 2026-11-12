<script lang="ts">
  import {getHostedTransition} from '../../../../shared/hosted-transition.js';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
  let failed = $state(false);
  onMount(() => {
    if (localStorage.getItem('labcharts-migration-pending') || getHostedTransition(location.origin)?.phase === 'recovery') { location.replace('/app/migration.html'); return; }
    // Shared domain services initialize after the route's components hydrate.
    document.documentElement.dataset.shellFramework = 'sveltekit';
    void import('../../../main.js').then(module => module.initialization).catch(() => { failed = true; });
  });
</script>
{@render children()}
{#if failed}<p role="alert">getbased could not start. Reload the application to try again.</p>{/if}
