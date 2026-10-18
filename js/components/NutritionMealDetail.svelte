<script lang="ts">
  import type { NutritionMealDetailView, NutritionMealDetailActions } from '../nutrition-meal-detail-model.js';
  import Fuel from './NutritionFuelCard.svelte';
  import Response from './NutritionMealResponse.svelte';
  import { closeButton, button, primary, copy, readableCopy, heading } from '../nutrition-view-classes.js';
  let { view, actions = { current: () => true, save: async () => false, failureMessage: () => '', notify: () => {} } }: { view: NutritionMealDetailView; actions?: NutritionMealDetailActions } = $props();
  let root: HTMLDivElement;
  let response = $state<ReturnType<typeof Response>>();
  export function save(clear = false) { return response?.save(clear) ?? Promise.resolve(false); }
  function guard(event: Event) {
    if (event.target instanceof Node && root?.contains(event.target) && !actions.current()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  const section = 'gb:nutrition:min-w-0 gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_1.5%,var(--bg-card))] gb:nutrition:p-[13px]';
  const evidence = 'gb:nutrition:min-w-0 gb:nutrition:grid gb:nutrition:gap-1 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-[color-mix(in_srgb,var(--accent)_26%,var(--border))] gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_4%,var(--bg-card))] gb:nutrition:px-2.5 gb:nutrition:py-2';
  const row = 'gb:nutrition:flex gb:nutrition:min-w-0 gb:nutrition:justify-between gb:nutrition:gap-4 gb:nutrition:bg-surface gb:nutrition:px-2.5 gb:nutrition:py-2 gb:nutrition:text-xs';
</script>
<svelte:document onclickcapture={guard} oninputcapture={guard} onchangecapture={guard} onsubmitcapture={guard}/>
<div bind:this={root} data-nutrition-meal-detail-view data-nutrition-view class="gb:nutrition:min-w-0 gb:nutrition:text-ink gb:nutrition:[overflow-wrap:anywhere]">
  <button type="button" class={closeButton} aria-label="Close Meals & Nutrition" data-nutrition-action="close">×</button>
  <header class="nutrition-modal-head gb:nutrition:pr-11"><div><h3 id="nutrition-meal-detail-title" class="gb:nutrition:mt-0 gb:nutrition:text-xl">{view.name}</h3><p class={readableCopy}>{view.date}</p></div></header>
  <div class="nutrition-detail-layout gb:nutrition:mt-[18px] gb:nutrition:grid gb:nutrition:gap-4">
    {#if view.images.length}
      <div class="nutrition-detail-gallery gb:nutrition:grid gb:nutrition:gap-2 gb:nutrition:rounded-[14px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_2.5%,var(--bg-card))] gb:nutrition:p-2 {view.images.length > 1 ? 'gb:nutrition:grid-cols-2 gb:nutrition:max-[600px]:grid-cols-1' : ''}">
        {#each view.images as image, index}<img class="nutrition-detail-photo gb:nutrition:w-full gb:nutrition:max-h-[390px] gb:nutrition:rounded-lg gb:nutrition:bg-surface {view.images.length > 1 ? 'gb:nutrition:h-[260px] gb:nutrition:object-cover gb:nutrition:max-[900px]:h-[210px] gb:nutrition:max-[600px]:h-auto gb:nutrition:max-[600px]:max-h-[340px] gb:nutrition:max-[600px]:object-contain' : 'gb:nutrition:object-contain'}" src={image} alt="Saved meal view {index + 1}"/>{/each}
      </div>
    {/if}
    <div class="nutrition-detail-overview gb:nutrition:grid gb:nutrition:gap-3">
      <div class="nutrition-detail-meta gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:gap-1.5">{#each view.metadata as item}<span class="gb:nutrition:rounded-full gb:nutrition:border gb:nutrition:border-line gb:nutrition:px-2 gb:nutrition:py-1 gb:nutrition:text-[11px] gb:nutrition:text-secondary">{item}</span>{/each}</div>
      {#if view.overview.length}<div class="nutrition-detail-summary gb:nutrition:grid gb:nutrition:grid-cols-4 gb:nutrition:overflow-hidden gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:max-[600px]:grid-cols-2">
        {#each view.overview as item, index}<div class="gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:grid-cols-[auto_1fr] gb:nutrition:gap-x-1 gb:nutrition:border-r gb:nutrition:border-line gb:nutrition:px-3 gb:nutrition:py-2.5 gb:nutrition:last:border-r-0 {index < 2 ? 'gb:nutrition:max-[600px]:border-b' : ''} {index === 1 ? 'gb:nutrition:max-[600px]:border-r-0' : ''}"><span class="gb:nutrition:col-span-full gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:uppercase gb:nutrition:tracking-wide gb:nutrition:text-secondary">{item.label}</span><strong class="gb:nutrition:text-xl gb:nutrition:leading-tight gb:nutrition:tabular-nums">{item.value}</strong><small class="gb:nutrition:self-end gb:nutrition:text-[11px] gb:nutrition:text-secondary">{item.unit}</small></div>{/each}
      </div>{/if}
      {#if view.fuel}<Fuel view={view.fuel}/><Response bind:this={response} {view} {actions}/>{/if}
      <div class="nutrition-detail-evidence gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-2 gb:nutrition:max-[600px]:grid-cols-1 gb:nutrition:[&>:only-child]:col-span-full">
        {#if view.usage}<div class="nutrition-review-evidence {evidence}"><strong class="gb:nutrition:text-[13px]">AI request usage</strong><span class="nutrition-analysis-usage {copy} gb:nutrition:tabular-nums">{view.usage}</span></div>{/if}
        {#if view.review}<div class="nutrition-review-evidence {evidence}"><strong class="gb:nutrition:text-[13px]">User review</strong><span class={copy}>{view.review}</span></div>{/if}
        {#each view.evidence as item}<div class="nutrition-label-summary {evidence} {copy}">{item}</div>{/each}
      </div>
    </div>
    <div class="nutrition-detail-content-grid gb:nutrition:grid gb:nutrition:grid-cols-[minmax(260px,.82fr)_minmax(360px,1.18fr)] gb:nutrition:items-start gb:nutrition:gap-3.5 gb:nutrition:max-[900px]:grid-cols-1">
      <div class="nutrition-detail-column gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-3.5">
        {#if view.components.length}<section class="nutrition-detail-section {section}"><h4 class="{heading} gb:nutrition:mt-0 gb:nutrition:mb-2">Ingredients and reviewed portions</h4><div class="nutrition-detail-components gb:nutrition:grid gb:nutrition:gap-px gb:nutrition:overflow-hidden gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line">{#each view.components as item}<div class={row}><span class="gb:nutrition:min-w-0 gb:nutrition:text-secondary">{item.name}</span><strong class="gb:nutrition:shrink-0">{item.quantity}</strong></div>{/each}</div></section>{/if}
        {#each [{ title: 'Estimate assumptions', items: view.assumptions }, { title: 'Remaining checks', items: view.warnings }] as group}{#if group.items.length}<section class="nutrition-detail-section {section}"><h4 class="{heading} gb:nutrition:mt-0 gb:nutrition:mb-2">{group.title}</h4><ul class="gb:nutrition:m-0 gb:nutrition:pl-[18px] gb:nutrition:text-xs gb:nutrition:leading-relaxed gb:nutrition:text-secondary">{#each group.items as item}<li>{item}</li>{/each}</ul></section>{/if}{/each}
        {#if view.note}<section class="nutrition-detail-section {section}"><h4 class="{heading} gb:nutrition:mt-0 gb:nutrition:mb-2">Note</h4><p class="gb:nutrition:m-0 gb:nutrition:text-xs gb:nutrition:leading-relaxed gb:nutrition:text-secondary">{view.note}</p></section>{/if}
      </div>
      <div class="nutrition-detail-column gb:nutrition:min-w-0">
        {#if view.nutrients.length}<section class="nutrition-detail-section {section}"><h4 class="{heading} gb:nutrition:mt-0 gb:nutrition:mb-2">Nutrients</h4><div class="nutrition-detail-nutrients gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-px gb:nutrition:overflow-hidden gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:max-[900px]:grid-cols-1">{#each view.nutrients as item}<div class={row}><span class="gb:nutrition:min-w-0 gb:nutrition:text-secondary">{item.label}</span><strong class="gb:nutrition:shrink-0">{item.value} <small class="gb:nutrition:font-normal gb:nutrition:text-secondary">{item.unit}</small></strong></div>{/each}</div></section>
        {:else}<div class="nutrition-empty {copy}">No nutrient estimates were saved for this meal.</div>{/if}
      </div>
    </div>
  </div>
  <footer class="nutrition-detail-actions gb:nutrition:mt-5 gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:justify-end gb:nutrition:gap-2.5">
    <button type="button" class="import-btn import-btn-secondary {button} gb:nutrition:mr-auto" data-nutrition-action="back" data-nutrition-origin={view.origin}>← {view.backLabel}</button>
    {#each [{ action: 'reuse', label: 'Log again' }, { action: 'edit', label: 'Edit meal' }, { action: 'delete', label: 'Delete meal' }] as item}<button type="button" class="import-btn {item.action === 'edit' ? 'import-btn-primary ' + primary : 'import-btn-secondary ' + button}" data-nutrition-action={item.action} data-nutrition-id={view.id} data-nutrition-origin={view.origin}>{item.label}</button>{/each}
  </footer>
</div>
