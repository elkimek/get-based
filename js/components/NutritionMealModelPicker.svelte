<script lang="ts">
  import type { NutritionMealModelView } from '../nutrition-editor-model.js';
  import { input, copy, modelSettings } from '../nutrition-view-classes.js';
  let { view }: { view: NutritionMealModelView } = $props();
</script>
<section id="nutrition-meal-model-control" data-nutrition-view class="nutrition-meal-model-control gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-2.5 gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-accent/25 gb:nutrition:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_7%,var(--bg-card)),var(--bg-card)_68%)] gb:nutrition:p-3">
  <label class="nutrition-meal-model-select gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-[5px]">
    <span id="nutrition-model-purpose" class="gb:nutrition:text-[10px] gb:nutrition:font-bold gb:nutrition:text-secondary">{view.purpose}</span>
    <div class="gb:nutrition:relative gb:nutrition:min-w-0">
    <select aria-label={view.accessibleLabel} data-nutrition-model-route class={`${input} gb:nutrition:appearance-none gb:nutrition:truncate gb:nutrition:pr-[34px] gb:nutrition:py-[9px] gb:nutrition:px-2.5 gb:nutrition:text-xs`}>
      <option value="" selected={view.automatic} disabled={!view.available}>{view.automaticLabel}</option>
      {#if view.savedChoice}<option value={view.selectedValue} selected>{view.savedChoice}</option>{/if}
      {#each view.options as option}<option value={option.value} selected={option.value === view.selectedValue}>{option.label}</option>{/each}
    </select>
    <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12" class="gb:nutrition:pointer-events-none gb:nutrition:absolute gb:nutrition:right-3 gb:nutrition:top-1/2 gb:nutrition:-translate-y-1/2 gb:nutrition:text-secondary"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
    </div>
  </label>
  <div class="nutrition-meal-model-foot gb:nutrition:flex gb:nutrition:min-w-0 gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-x-3 gb:nutrition:gap-y-2 gb:nutrition:max-[430px]:flex-col gb:nutrition:max-[430px]:items-start">
    <span class={copy}>{view.provider} · {view.price} · <span class={`nutrition-meal-model-status ${view.available ? 'is-ready' : 'is-unavailable'} gb:nutrition:rounded-full gb:nutrition:bg-hover gb:nutrition:px-2 gb:nutrition:py-1 gb:nutrition:text-[10px] gb:nutrition:font-extrabold ${view.available ? 'gb:nutrition:text-success-ink' : 'gb:nutrition:text-warning-ink'}`}>{view.status}</span></span>
    <button type="button" data-nutrition-action="open-ai-settings" class={`nutrition-meal-model-settings ${modelSettings} gb:nutrition:shrink-0 gb:nutrition:text-link-ink`}>AI settings</button>
  </div>
</section>
