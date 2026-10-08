<script lang="ts">
  import type { NutritionBenchmarkStatusView } from '../nutrition-benchmark-model.js';
  let { view }: { view: NutritionBenchmarkStatusView } = $props();
</script>
{#if view.kind === 'history'}
  <span><strong class="gb:nutrition:text-ink">{view.label}</strong> · {view.savedLabel} · encrypted locally · outside AI context.</span>
  <button type="button" data-nutrition-action="clear-comparison-history" class="nutrition-text-btn gb:nutrition:min-h-[45px] gb:nutrition:min-w-[45px] gb:nutrition:shrink-0 gb:nutrition:cursor-pointer gb:nutrition:rounded gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:p-0 gb:nutrition:font-[inherit] gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:text-link-ink gb:nutrition:hover:underline gb:nutrition:focus-visible:outline-2 gb:nutrition:focus-visible:outline-offset-2 gb:nutrition:focus-visible:outline-accent">Clear</button>
{:else}
  <div class="nutrition-analysis-progress-head"><strong>{view.label}</strong><span>{view.detail}</span></div>
  {#if view.percent !== null}<div class="nutrition-analysis-progress-track" role="progressbar" aria-label="Meal model comparison progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={view.percent}><span style:width={`${view.percent}%`}></span></div>{/if}
{/if}
