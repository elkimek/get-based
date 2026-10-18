<script lang="ts">
  import type { NutritionMealRowView } from '../nutrition-presentation-model.js';
  import { mealDelete, copy, focus } from '../nutrition-view-classes.js';
  let { view }: { view: NutritionMealRowView } = $props();
  const thumbnail = 'gb:nutrition:size-12 gb:nutrition:rounded-lg gb:nutrition:object-cover gb:nutrition:bg-surface gb:nutrition:grid gb:nutrition:place-items-center';
</script>
<article data-nutrition-view class="nutrition-meal-row gb:nutrition:grid gb:nutrition:grid-cols-[minmax(0,1fr)_52px] gb:nutrition:items-center gb:nutrition:gap-2.5 gb:nutrition:border-b gb:nutrition:border-line gb:nutrition:py-2">
  <button type="button" class="nutrition-meal-open {focus} gb:nutrition:grid gb:nutrition:grid-cols-[48px_minmax(0,1fr)_auto] gb:nutrition:items-center gb:nutrition:gap-2 gb:nutrition:min-h-12 gb:nutrition:min-w-0 gb:nutrition:rounded-lg gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:p-0 gb:nutrition:font-body gb:nutrition:text-ink gb:nutrition:text-left gb:nutrition:cursor-pointer gb:nutrition:hover:bg-hover gb:nutrition:max-[380px]:grid-cols-[minmax(0,1fr)_auto]"
    data-nutrition-action="detail" data-nutrition-id={view.id} data-nutrition-origin={view.origin} aria-label={view.detailLabel}>
    {#if view.image}<img class="{thumbnail} gb:nutrition:max-[380px]:hidden" src={view.image} alt="">
    {:else}<span class="nutrition-meal-placeholder {thumbnail} gb:nutrition:max-[380px]:hidden" aria-hidden="true">🍽</span>{/if}
    <span class="nutrition-meal-copy gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-0.5">
      <strong class="gb:nutrition:text-xs gb:nutrition:[overflow-wrap:anywhere]">{view.name}</strong><span class={copy}>{view.date}</span>
      {#if view.detail}<small class={copy}>{view.detail}</small>{/if}
    </span>
    <span class="nutrition-meal-energy gb:nutrition:text-right gb:nutrition:text-xs gb:nutrition:font-bold gb:nutrition:tabular-nums">{view.energy}<small class="gb:nutrition:block gb:nutrition:text-[10px] gb:nutrition:font-normal gb:nutrition:text-secondary">kcal</small></span>
  </button>
  <button type="button" class="nutrition-meal-delete {mealDelete}" aria-label={view.deleteLabel} data-nutrition-action="delete" data-nutrition-id={view.id} data-nutrition-origin={view.origin}>Delete</button>
</article>
