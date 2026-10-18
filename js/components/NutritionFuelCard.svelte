<script lang="ts">
  import type { NutritionFuelView } from '../nutrition-presentation-model.js';
  import { readableCopy as copy, fuelSummary, goalHead } from '../nutrition-view-classes.js';
  let { view }: { view: NutritionFuelView | null } = $props();
</script>
{#if view}
<section data-nutrition-view class="nutrition-fuel-card is-{view.scope} gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-2.5" class:is-compact={view.compact} class:is-unavailable={!view.available}>
  {#if !view.available}
    <div class="nutrition-fuel-empty gb:nutrition:grid gb:nutrition:gap-1 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-dashed gb:nutrition:border-line gb:nutrition:p-3"><strong class="gb:nutrition:text-xs">Not enough meal data yet</strong><span class={copy}>Add carbohydrate and fat values in Meals &amp; Nutrition to see the logged carb/fat mix. Missing values stay unknown.</span></div>
  {:else}
    {#if view.scope === 'meal'}<div class="nutrition-fuel-simple-head {goalHead}"><strong>Carb/fat composition</strong><span class={copy}>Estimate</span></div>{/if}
    <div class="nutrition-fuel-composition gb:nutrition:grid gb:nutrition:gap-[7px]" role="img" aria-label="{view.carb}% carbohydrate energy and {view.fat}% fat energy. No preferred split.">
      <div class="nutrition-fuel-composition-labels gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-3.5">
        <span class="gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:gap-1.5"><i class="is-carb gb:nutrition:size-2 gb:nutrition:rounded-full gb:nutrition:bg-[#618bd8]" aria-hidden="true"></i><small class={copy}>Carbohydrate energy</small><strong class="gb:nutrition:text-xs">{view.carb}%</strong></span>
        <span class="gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:gap-1.5"><i class="is-fat gb:nutrition:size-2 gb:nutrition:rounded-full gb:nutrition:bg-[#d7a34a]" aria-hidden="true"></i><small class={copy}>Fat energy</small><strong class="gb:nutrition:text-xs">{view.fat}%</strong></span>
      </div>
      <div class="nutrition-fuel-split gb:nutrition:flex gb:nutrition:h-[11px] gb:nutrition:overflow-hidden gb:nutrition:rounded-full gb:nutrition:bg-hover"><span class="is-carb gb:nutrition:bg-[#618bd8]" style:width="{view.carb}%"></span><span class="is-fat gb:nutrition:bg-[#d7a34a]" style:width="{view.fat}%"></span></div>
    </div>
    <div class="nutrition-fuel-meta gb:nutrition:text-[10px] gb:nutrition:text-secondary gb:nutrition:text-right gb:nutrition-dashboard:text-secondary">{view.meta}</div>
    {#if view.scope === 'window'}<p class="nutrition-fuel-neutral {copy} gb:nutrition:m-0">A centered split is not automatically good or bad; amount and food quality matter more.</p>{/if}
    {#if view.guidance}<div class="nutrition-fuel-guidance {goalHead}"><span class={copy}>Worth reviewing</span><strong class="gb:nutrition:text-xs">{view.guidance}</strong></div>{/if}
    {#if view.pattern}<div class="nutrition-fuel-response-status is-ready gb:nutrition:grid gb:nutrition:gap-0.5 gb:nutrition:border-t gb:nutrition:border-line gb:nutrition:pt-[9px]"><strong class="gb:nutrition:text-[10px] gb:nutrition:text-accent">Check-in pattern · {view.pattern.count} meals</strong><span class={copy}>{view.pattern.copy} Personal association only.</span></div>{/if}
    {#if !view.compact}
      <details class="nutrition-fuel-explainer gb:nutrition:border-t gb:nutrition:border-line gb:nutrition:pt-2">
        <summary class="{fuelSummary}">About this estimate</summary>
        <p class={copy}>Meal logs estimate incoming carbohydrate and fat. They do not measure Randle-cycle activity, glucose, insulin, free fatty acids, fuel oxidation, or metabolic flexibility.</p>
        {#if view.plan}<p class={copy}>{view.plan}</p>{/if}
        <p class={copy}>With impaired glucose regulation, carbohydrate amount matters, while fat and protein can change the timing of the glucose response. Personal glucose data and the clinical plan are more informative than this split alone.</p>
      </details>
    {/if}
  {/if}
</section>
{/if}
