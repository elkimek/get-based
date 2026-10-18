<script lang="ts">
  import type { EditableIngredientView } from '../nutrition-editor-review-model.js';
  import { ingredientRemove, copy, ingredientInput as input, textAction } from '../nutrition-view-classes.js';
  let { rows }: { rows: EditableIngredientView[] } = $props();
  const columns = 'gb:nutrition:grid gb:nutrition:grid-cols-[minmax(150px,1fr)_92px_minmax(126px,.65fr)_30px] gb:nutrition:gap-[7px] gb:nutrition:min-[721px]:[@media(pointer:coarse)]:grid-cols-[minmax(150px,1fr)_92px_minmax(126px,.65fr)_45px]';
</script>
<div data-nutrition-view class="nutrition-components-head gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-3">
  <div class="gb:nutrition:grid gb:nutrition:gap-0.5"><strong class="gb:nutrition:text-sm">Ingredients and portions</strong><span class={`${copy} gb:nutrition:text-xs`}>Changing grams updates linked nutrients.</span></div>
  <button type="button" class={`nutrition-text-btn ${textAction}`} data-nutrition-action="add-component">+ Add ingredient</button>
</div>
{#if rows.length}
  <div data-nutrition-view class="nutrition-component-editor gb:nutrition:grid gb:nutrition:gap-1.5">
    <div class={`nutrition-component-columns ${columns} gb:nutrition:px-[9px] gb:nutrition:text-[10px] gb:nutrition:font-bold gb:nutrition:uppercase gb:nutrition:tracking-wider gb:nutrition:text-secondary gb:nutrition:max-[720px]:hidden`} aria-hidden="true"><span>Ingredient</span><span>Amount</span><span>Check</span><span></span></div>
    {#each rows as row,index}
      <div data-component-index={index} class={`nutrition-component-row ${columns} gb:nutrition:items-center gb:nutrition:rounded-[9px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-[9px] gb:nutrition:max-[720px]:grid-cols-[minmax(0,1fr)_minmax(112px,.7fr)_44px]`}>
        <label class="nutrition-component-ingredient gb:nutrition:min-w-0 gb:nutrition:max-[720px]:col-span-2"><span class="sr-only">Ingredient {index + 1}</span><input data-nutrition-component-name={index} value={row.name} maxlength="120" placeholder="Ingredient" class={input}/></label>
        <label class="nutrition-component-quantity gb:nutrition:min-w-0 gb:nutrition:max-[720px]:col-start-1 gb:nutrition:max-[720px]:row-start-2"><span class="sr-only">Amount for ingredient {index + 1}</span><span class="nutrition-component-amount gb:nutrition:flex gb:nutrition:items-center gb:nutrition:gap-1"><input data-nutrition-component-grams={index} type="number" inputmode="decimal" min="0" step="1" value={row.quantity} aria-label="Amount in grams" class={input}/><small class={copy}>g</small></span></label>
        <span class="nutrition-component-confidence gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-0.5 gb:nutrition:max-[720px]:col-span-2 gb:nutrition:max-[720px]:col-start-2 gb:nutrition:max-[720px]:row-start-2"><strong class="gb:nutrition:text-[11px] gb:nutrition:[overflow-wrap:anywhere]">{row.identity}</strong><small class={copy}>{row.portion}</small></span>
        <button type="button" class={`nutrition-icon-btn ${ingredientRemove} gb:nutrition:max-[720px]:col-start-3 gb:nutrition:max-[720px]:row-start-1`} aria-label={row.removeLabel} data-nutrition-action="remove-component" data-nutrition-index={index}>×</button>
        {#if row.historical}<div class="nutrition-component-food-data is-readonly gb:nutrition:col-span-full gb:nutrition:grid gb:nutrition:grid-cols-[auto_minmax(0,1fr)] gb:nutrition:items-center gb:nutrition:gap-x-2 gb:nutrition:gap-y-[3px] gb:nutrition:pt-0.5"><span class="gb:nutrition:text-[10px] gb:nutrition:font-bold">Historical source</span><strong class="gb:nutrition:min-w-0 gb:nutrition:text-[11px] gb:nutrition:font-semibold gb:nutrition:[overflow-wrap:anywhere]">{row.historical.description}</strong><small class={`${copy} gb:nutrition:col-start-2`}>{row.historical.dataset} · retained from the saved meal</small></div>{/if}
      </div>
    {/each}
  </div>
{:else}<div data-nutrition-view class={`nutrition-empty nutrition-empty-inline ${copy} gb:nutrition:py-1.5`}>No ingredients yet. Add one or enter nutrient totals.</div>{/if}
