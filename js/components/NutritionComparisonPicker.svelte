<script lang="ts">
  import type { NutritionComparisonPickerView } from '../nutrition-benchmark-model.js';
  let { view }: { view: NutritionComparisonPickerView } = $props();
</script>
<section data-nutrition-view data-nutrition-picker-view class="nutrition-comparison-model-picker gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:content-start gb:nutrition:gap-[9px] gb:nutrition:rounded-[10px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-3 gb:nutrition:text-ink gb:nutrition:[overflow-wrap:anywhere]">
  <div class="nutrition-comparison-section-title gb:nutrition:flex gb:nutrition:items-baseline gb:nutrition:justify-between gb:nutrition:gap-2 gb:nutrition:max-[720px]:flex-wrap gb:nutrition:max-[720px]:items-start">
    <div class="gb:nutrition:grid gb:nutrition:gap-0.5"><strong class="gb:nutrition:text-[13px]">Models</strong><small class="gb:nutrition:text-[11px] gb:nutrition:font-normal gb:nutrition:text-secondary">{view.providerSummary}</small></div>
    <span id="nutrition-comparison-model-limit" class="gb:nutrition:text-[11px] gb:nutrition:text-secondary">{view.selectedCount} of 4 selected</span>
  </div>
  {#if view.models.length < 2}
    <div class="nutrition-comparison-empty gb:nutrition:text-[11px] gb:nutrition:leading-[1.45] gb:nutrition:text-secondary">Connect or load two vision models in AI Settings.</div>
  {:else}
    <label class="nutrition-comparison-model-search gb:nutrition:grid gb:nutrition:grid-cols-[auto_minmax(180px,1fr)_auto] gb:nutrition:items-center gb:nutrition:gap-[9px] gb:nutrition:max-[430px]:grid-cols-[minmax(0,1fr)_auto]">
      <span class="gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:max-[430px]:col-span-full">Search models</span>
      <input type="search" data-nutrition-comparison-search value={view.query} maxlength="160" autocomplete="off" placeholder="Provider, model name, or ID" aria-controls="nutrition-comparison-model-list"
        class="gb:nutrition:box-border gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:w-full gb:nutrition:min-w-0 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:px-[11px] gb:nutrition:py-[9px] gb:nutrition:font-[inherit] gb:nutrition:text-xs gb:nutrition:text-ink gb:nutrition:focus:border-accent gb:nutrition:focus:outline-2 gb:nutrition:focus:outline-offset-1 gb:nutrition:focus:outline-accent/25 gb:nutrition:max-[720px]:text-base"/>
      <small data-nutrition-comparison-search-status aria-live="polite" class="gb:nutrition:min-w-[82px] gb:nutrition:text-right gb:nutrition:text-[10px] gb:nutrition:text-secondary">{view.models.length} available</small>
    </label>
    <div id="nutrition-comparison-model-list" class="nutrition-comparison-models gb:nutrition:grid gb:nutrition:grid-cols-[repeat(auto-fit,minmax(175px,1fr))] gb:nutrition:gap-2 gb:nutrition:overflow-visible">
      {#each view.models as model}
        <label data-nutrition-model-search={model.searchText}
          class={`nutrition-comparison-model ${model.current ? 'is-current' : ''} gb:group gb:nutrition:relative gb:nutrition:box-border gb:nutrition:grid gb:nutrition:min-h-[78px] gb:nutrition:grid-cols-[22px_minmax(0,1fr)] gb:nutrition:items-start gb:nutrition:gap-[9px] gb:nutrition:rounded-[10px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-accent/[0.015] gb:nutrition:p-[11px] gb:nutrition:cursor-pointer gb:nutrition:transition-[border-color,background-color,transform] gb:nutrition:duration-150 gb:nutrition:hover:-translate-y-px gb:nutrition:hover:border-accent/35 gb:nutrition:hover:bg-accent/5 gb:nutrition:focus-within:outline-2 gb:nutrition:focus-within:outline-offset-2 gb:nutrition:focus-within:outline-accent/35 gb:nutrition:[&.is-current]:shadow-[inset_0_2px_color-mix(in_srgb,var(--accent)_65%,transparent)] gb:nutrition:has-checked:border-accent/70 gb:nutrition:has-checked:bg-accent/10 gb:nutrition:[&.is-benchmarked]:bg-success/5 gb:nutrition:has-disabled:translate-y-0 gb:nutrition:has-disabled:cursor-wait gb:nutrition:has-disabled:opacity-70 gb:nutrition:motion-reduce:transition-none gb:nutrition:[&[hidden]]:hidden`}>
          <input type="checkbox" data-nutrition-comparison-model value={model.value} checked={model.selected} class="gb:nutrition:absolute gb:nutrition:inset-0 gb:nutrition:z-10 gb:nutrition:m-0 gb:nutrition:h-full gb:nutrition:w-full gb:nutrition:cursor-[inherit] gb:nutrition:opacity-0"/>
          <span aria-hidden="true" class="nutrition-comparison-model-check gb:nutrition:grid gb:nutrition:size-5 gb:nutrition:place-items-center gb:nutrition:rounded-md gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:text-xs gb:nutrition:font-black gb:nutrition:text-transparent gb:nutrition:group-has-checked:border-accent gb:nutrition:group-has-checked:bg-accent gb:nutrition:group-has-checked:text-white">✓</span>
          <span class="nutrition-comparison-model-copy gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-[3px]">
            <span class="nutrition-comparison-model-provider gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:tracking-[.05em] gb:nutrition:text-secondary gb:nutrition:uppercase">{model.providerLabel}</span>
            <strong class="gb:nutrition:text-xs gb:nutrition:leading-[1.3]">{model.label}</strong>
            <small class="nutrition-model-price gb:nutrition:text-[10px] gb:nutrition:leading-[1.35] gb:nutrition:text-ink">{model.price}</small>
            <em data-nutrition-benchmarked hidden class="gb:nutrition:text-[11px] gb:nutrition:font-extrabold gb:nutrition:text-success-ink gb:nutrition:not-italic gb:nutrition:[&[hidden]]:hidden">Compared</em>
          </span>
        </label>
      {/each}
    </div>
    <div data-nutrition-comparison-search-empty hidden class="nutrition-comparison-search-empty gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-dashed gb:nutrition:border-line gb:nutrition:p-3 gb:nutrition:text-center gb:nutrition:text-[11px] gb:nutrition:text-secondary gb:nutrition:[&[hidden]]:hidden">No models match this search.</div>
  {/if}
</section>
