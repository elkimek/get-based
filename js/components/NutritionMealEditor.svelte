<script lang="ts">
  import type { NutritionEditorView } from '../nutrition-editor-model.js';
  import { MACRO_REVIEW_FIELDS, DETAILED_REVIEW_GROUPS, NUTRITION_PHOTO_PRIVACY } from '../nutrition-editor-model.js';
  import { MEAL_TYPES } from '../nutrition-presentation-model.js';
  import { button, readableCopy as copy, field, input, editorSummary as summary, focus , textAction } from '../nutrition-view-classes.js';
  import Navigation from './NutritionEditorNavigation.svelte';
  import ModelPicker from './NutritionMealModelPicker.svelte';
  let { view }: { view: NutritionEditorView } = $props();
  const grid = 'nutrition-nutrient-grid gb:nutrition:grid gb:nutrition:grid-cols-3 gb:nutrition:gap-2.5 gb:nutrition:max-[720px]:grid-cols-2';
  const hidden = 'gb:nutrition:[&[hidden]]:hidden';
  const control = `${input} gb:nutrition:[&.is-partial-food-value]:border-dashed gb:nutrition:[&.is-partial-food-value]:border-warning/60`;
</script>
{#snippet nutrient(item: typeof MACRO_REVIEW_FIELDS[number])}
  {@const [key, label, unit, step] = item}
  <label class={`nutrition-field ${field}`}>
    <span>{label} <small class={copy}>{unit}</small><small id={`nutrition-${key}-source`} hidden class={`nutrition-nutrient-source gb:nutrition:text-[10px] gb:nutrition:font-bold gb:nutrition:text-warning-ink ${hidden}`}></small></span>
    <input id={`nutrition-${key}`} data-nutrition-nutrient={key} inputmode="decimal" type="number" min="0" {step} class={control}/>
  </label>
{/snippet}
<div data-nutrition-view data-nutrition-editor-view class="gb:nutrition:min-w-0 gb:nutrition:text-ink gb:nutrition:[overflow-wrap:anywhere]">
  <button type="button" class="modal-close gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:[@media(pointer:coarse)]:min-w-[45px]" aria-label="Close Meals & Nutrition" data-nutrition-action="close">×</button>
  {#if view.backAction}
    <button type="button" data-nutrition-action={view.backAction} data-nutrition-id={view.backAction === 'return-detail' ? view.returnMealId : undefined} data-nutrition-origin={view.backAction === 'return-detail' ? view.returnMealOrigin : undefined}
      class={`nutrition-route-back ${button} gb:nutrition:mb-2.5 gb:nutrition:mr-11`}>{view.backAction === 'return-history' ? '← Meals & Nutrition' : '← Meal details'}</button>
  {/if}
  <div class="nutrition-modal-head gb:nutrition:pr-10"><div><h3 class="gb:nutrition:mb-0.5">{view.title}</h3><p class={`gb:nutrition:m-0 ${copy} gb:nutrition:text-[13px]`}>{view.subtitle}</p></div></div>
  <div class="nutrition-entry-grid gb:nutrition:mt-5 gb:nutrition:grid gb:nutrition:grid-cols-[minmax(250px,.78fr)_minmax(420px,1.22fr)] gb:nutrition:gap-7 gb:nutrition:max-[720px]:grid-cols-1 gb:nutrition:in-[.nutrition-manual-mode]:grid-cols-1">
    <section class="nutrition-photo-panel gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:content-start gb:nutrition:gap-3.5 gb:nutrition:in-[.nutrition-manual-mode]:[&>:not(.nutrition-capture-tabs)]:hidden">
      <div data-nutrition-tabs class="nutrition-capture-tabs gb:nutrition:grid gb:nutrition:grid-cols-3 gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-[3px]" role="tablist" aria-label="Meal entry method"><Navigation part="tabs"/></div>
      <label class={`nutrition-photo-picker gb:nutrition:relative gb:nutrition:block gb:nutrition:cursor-pointer gb:nutrition:rounded-xl gb:nutrition:focus-within:outline-2 gb:nutrition:focus-within:outline-offset-2 gb:nutrition:focus-within:outline-accent`} for="nutrition-photo-input">
        <span class="nutrition-photo-preview gb:nutrition:relative gb:nutrition:grid gb:nutrition:grid-cols-1 gb:nutrition:min-h-[210px] gb:nutrition:place-content-center gb:nutrition:justify-items-center gb:nutrition:gap-[5px] gb:nutrition:overflow-hidden gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-dashed gb:nutrition:border-line gb:nutrition:bg-surface" id="nutrition-photo-preview"><span aria-hidden="true" class="gb:nutrition:text-[30px] gb:nutrition:text-accent">＋</span><strong id="nutrition-photo-prompt">Add meal photo</strong><small class={copy}>Up to 4 photos · 20 MB each</small></span>
        <input id="nutrition-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" multiple data-nutrition-action="photo" class="gb:nutrition:absolute gb:nutrition:inset-0 gb:nutrition:h-full gb:nutrition:w-full gb:nutrition:cursor-pointer gb:nutrition:opacity-0"/>
      </label>
      <div id="nutrition-label-consumption" class={`nutrition-label-consumption gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-2 gb:nutrition:max-[430px]:grid-cols-1 ${hidden}`} hidden>
        <label class={`nutrition-field ${field}`}><span>Amount eaten</span><input id="nutrition-consumed-amount" inputmode="decimal" type="number" min="0.01" step="0.1" value="1" class={input}/></label>
        <label class={`nutrition-field ${field}`}><span>Unit</span><select id="nutrition-consumed-unit" class={input}><option value="servings">serving(s)</option><option value="g">grams</option><option value="ml">milliliters</option><option value="packages">package(s)</option></select></label>
      </div>
      <label class={`nutrition-field nutrition-field-wide nutrition-known-details ${field}`}><span>Known details <small class={copy}>optional, improves the estimate</small></span><textarea id="nutrition-known-details" rows="2" maxlength="500" placeholder="e.g. Fried Edam cheese, 150 g; tartar sauce; beer was not consumed" class={`${input} gb:nutrition:resize-y`}></textarea></label>
      <button type="button" id="nutrition-analyze-btn" class="import-btn import-btn-primary gb:nutrition:[@media(pointer:coarse)]:min-h-[45px]" data-nutrition-action="analyze" disabled={!view.available}>Analyze photo</button>
      <ModelPicker view={view.model}/>
      {#if view.debug}
        <button type="button" data-nutrition-action="toggle-comparison" class={`nutrition-compare-launch gb:nutrition:box-border gb:nutrition:grid gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:w-full gb:nutrition:grid-cols-[auto_minmax(0,1fr)_auto] gb:nutrition:items-center gb:nutrition:gap-2.5 gb:nutrition:rounded-[10px] gb:nutrition:border gb:nutrition:border-dashed gb:nutrition:border-accent/35 gb:nutrition:bg-accent/[.03] gb:nutrition:px-2.5 gb:nutrition:py-[9px] gb:nutrition:text-left gb:nutrition:font-body gb:nutrition:text-ink gb:nutrition:cursor-pointer gb:nutrition:hover:border-solid gb:nutrition:hover:bg-accent/5 ${focus}`}>
          <span class="nutrition-compare-launch-icon gb:nutrition:grid gb:nutrition:size-[25px] gb:nutrition:place-items-center gb:nutrition:rounded-[7px] gb:nutrition:bg-accent/10 gb:nutrition:text-[15px] gb:nutrition:text-accent" aria-hidden="true">⇄</span>
          <span class="gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-px"><strong class="gb:nutrition:text-[11px]">Open benchmark</strong><small class={copy}>Debug mode · same photos, 2–4 models</small></span><span aria-hidden="true">→</span>
        </button>
      {/if}
      <div id="nutrition-privacy-line" class={`nutrition-privacy-line ${copy} gb:nutrition:text-[13px]`}>{NUTRITION_PHOTO_PRIVACY}</div>
      <div id="nutrition-analysis-progress" class="nutrition-analysis-progress" aria-live="polite" hidden></div>
      <div id="nutrition-analysis-status" class="nutrition-analysis-status gb:nutrition:min-h-[18px] gb:nutrition:text-[13px] gb:nutrition:leading-[1.4] gb:nutrition:text-secondary gb:nutrition:[&.is-error]:text-danger-ink gb:nutrition:[&.is-success]:text-success-ink gb:nutrition:[&.is-warning]:text-warning-ink" role="status" aria-live="polite"></div>
    </section>
    <section class="nutrition-review-panel gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:content-start gb:nutrition:gap-3.5 gb:nutrition:in-[.nutrition-manual-mode]:mx-auto gb:nutrition:in-[.nutrition-manual-mode]:w-full gb:nutrition:in-[.nutrition-manual-mode]:max-w-[760px]">
      <div id="nutrition-comparison-return" hidden class={`nutrition-comparison-return gb:nutrition:flex gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-2.5 gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-accent/30 gb:nutrition:bg-accent/5 gb:nutrition:px-2.5 gb:nutrition:py-2 gb:nutrition:text-[11px] gb:nutrition:text-secondary gb:nutrition:max-[430px]:flex-col gb:nutrition:max-[430px]:items-stretch ${hidden}`}><span id="nutrition-comparison-return-copy">Benchmark estimate loaded.</span><button type="button" class={`nutrition-text-btn ${textAction}`} data-nutrition-action="show-comparison">Benchmark →</button></div>
      <div class="nutrition-review-heading gb:nutrition:pb-0.5"><h4 class="gb:nutrition:m-0 gb:nutrition:text-[17px]">Review meal</h4></div>
      <div id="nutrition-review-evidence" hidden class={`nutrition-review-evidence gb:nutrition:grid gb:nutrition:gap-[3px] gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-accent/25 gb:nutrition:bg-accent/5 gb:nutrition:px-2.5 gb:nutrition:py-[9px] ${hidden}`}></div>
      <label class={`nutrition-field nutrition-field-wide ${field}`}><span>Meal name <small class={copy}>required</small></span><input id="nutrition-meal-name" maxlength="120" placeholder="e.g. Lentil bowl" class={input}/></label>
      <div id="nutrition-correction-review" hidden class={`nutrition-correction-review gb:nutrition:flex gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-3.5 gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:px-3 gb:nutrition:py-[11px] gb:nutrition:text-xs gb:nutrition:leading-[1.45] gb:nutrition:text-secondary gb:nutrition:[&.is-dirty]:border-accent/50 gb:nutrition:[&.is-dirty]:bg-accent/5 gb:nutrition:max-[720px]:flex-col gb:nutrition:max-[720px]:items-stretch ${hidden}`}>
        <div id="nutrition-correction-copy"><strong class="gb:nutrition:text-ink">Wrong identification?</strong> Edit the meal name to recalculate the estimate.</div><button type="button" id="nutrition-recalculate-btn" class="import-btn import-btn-secondary gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:shrink-0 gb:nutrition:max-[720px]:self-end" data-nutrition-action="reanalyze" disabled>Recalculate estimate</button>
      </div>
      <div class="nutrition-review-meta gb:nutrition:grid gb:nutrition:grid-cols-[minmax(160px,.85fr)_minmax(190px,1.15fr)] gb:nutrition:gap-2.5 gb:nutrition:max-[430px]:grid-cols-1">
        <label class={`nutrition-field ${field}`}><span>Meal occasion <small class={copy}>required</small></span><select id="nutrition-meal-type" class={input}><option value="">Select occasion…</option>{#each MEAL_TYPES as [value,label]}<option {value}>{label}</option>{/each}</select></label>
        <label class={`nutrition-field ${field}`}><span>When</span><input id="nutrition-eaten-at" type="datetime-local" value={view.now} class={input}/></label>
      </div>
      <div class="nutrition-review-section-title gb:nutrition:mt-0.5 gb:nutrition:flex gb:nutrition:items-baseline gb:nutrition:justify-between gb:nutrition:gap-2.5"><strong class="gb:nutrition:text-sm">Energy &amp; macros</strong><span class={`${copy} gb:nutrition:text-right`}>Unknown values stay blank.</span></div>
      <div class={grid}>{#each MACRO_REVIEW_FIELDS as item}{@render nutrient(item)}{/each}</div>
      <div id="nutrition-fuel-preview" class={`nutrition-fuel-preview ${hidden}`} aria-live="polite" hidden></div>
      <details class="nutrition-more-nutrients gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:px-2.5 gb:nutrition:open:pb-2.5"><summary class={summary}>Detailed nutrition</summary><div id="nutrition-nutrient-estimate-summary" class={`nutrition-nutrient-estimate-summary ${copy} gb:nutrition:mb-2.5`}>Detailed nutrient values come from the selected AI model.</div><div class="nutrition-nutrient-groups gb:nutrition:grid gb:nutrition:gap-3">{#each DETAILED_REVIEW_GROUPS as group}<fieldset class="gb:nutrition:m-0 gb:nutrition:min-w-0 gb:nutrition:border-0 gb:nutrition:p-0"><legend class="gb:nutrition:mb-[7px] gb:nutrition:text-[11px] gb:nutrition:font-bold">{group.label}</legend><div class={grid}>{#each group.fields as item}{@render nutrient(item)}{/each}</div></fieldset>{/each}</div></details>
      <div id="nutrition-components" class="nutrition-components gb:nutrition:grid gb:nutrition:gap-2"></div>
      <div id="nutrition-label-details" hidden class={`nutrition-label-summary ${copy} gb:nutrition:rounded-lg gb:nutrition:bg-accent/5 gb:nutrition:px-2.5 gb:nutrition:py-2 ${hidden}`}></div>
      <div id="nutrition-review-checks" hidden class={`nutrition-review-checks gb:nutrition:grid gb:nutrition:gap-2 gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:p-2.5 ${hidden}`}></div>
      <label class={`nutrition-field nutrition-field-wide ${field}`}><span>Note <small class={copy}>optional</small></span><textarea id="nutrition-note" rows="2" maxlength="500" placeholder="Anything you want to remember about this meal" class={`${input} gb:nutrition:resize-y`}></textarea></label>
      <div class="nutrition-review-actions gb:nutrition:flex gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-3 gb:nutrition:max-[430px]:flex-col gb:nutrition:max-[430px]:items-stretch"><p id="nutrition-save-requirement" role="status" class="gb:nutrition:m-0 gb:nutrition:text-xs gb:nutrition:leading-[1.4] gb:nutrition:text-warning-ink gb:nutrition:[&.is-ready]:text-secondary"></p><button type="button" id="nutrition-save-btn" class="import-btn import-btn-primary gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:shrink-0" aria-describedby="nutrition-save-requirement" data-nutrition-action="save">{view.saveLabel}</button></div>
    </section>
  </div>
  <section class="nutrition-recent gb:nutrition:mt-[22px] gb:nutrition:border-t gb:nutrition:border-line gb:nutrition:pt-[18px]"><Navigation part="records"/></section>
</div>
