<script lang="ts">
  import type { NutritionBenchmarkStatusView } from '../nutrition-benchmark-model.js';
  import Progress from './NutritionAnalysisProgress.svelte';
  let { view }: { view: NutritionBenchmarkStatusView } = $props();
</script>
{#if view.kind === 'history'}
  <span><strong class="gb:nutrition:text-ink">{view.label}</strong> · {view.savedLabel} · encrypted locally · outside AI context.</span>
  <button type="button" data-nutrition-action="clear-comparison-history" class="nutrition-text-btn gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:[@media(pointer:coarse)]:min-w-[45px] gb:nutrition:shrink-0 gb:nutrition:cursor-pointer gb:nutrition:rounded gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:p-0 gb:nutrition:font-[inherit] gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:text-link-ink gb:nutrition:hover:underline gb:nutrition:focus-visible:outline-2 gb:nutrition:focus-visible:outline-offset-2 gb:nutrition:focus-visible:outline-accent">Clear</button>
{:else}
  <Progress view={{ label: view.label, detail: view.detail, percent: view.percent, state: view.state, accessibleLabel: 'Meal model comparison progress' }}/>
{/if}
