<script lang="ts">
  import type { ReviewPresentation } from '../light-review-ai-presentation.js';
  import LightTodayAI from './LightTodayAI.svelte';
  import LightWeeklyAI from './LightWeeklyAI.svelte';
  import LightBurdenAI from './LightBurdenAI.svelte';
  import LightWeeklyFallback from './LightWeeklyFallback.svelte';
  let { view }: { view: ReviewPresentation } = $props();
</script>
{#if view.kind === 'weekly-fallback'}<LightWeeklyFallback {view} />
{:else if view.kind === 'weekly'}<LightWeeklyAI {view} />
{:else if view.kind === 'burden'}<LightBurdenAI {view} />
{:else}<LightTodayAI {view} />{/if}
