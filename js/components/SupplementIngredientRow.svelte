<script lang="ts">
  import SupplementOption from './SupplementOption.svelte';
  import type {SupplementUnitOptionView, SupplementIngredientView} from '../supplement-form-presentation.js';
  type Props = {kind: 'unitOption'; view: SupplementUnitOptionView}
    | {kind: 'ingredient'; view: SupplementIngredientView};
  let props: Props = $props();
</script><svelte:options preserveWhitespace />{#if props.kind === 'unitOption'}<option value={props.view.value} selected={props.view.selected}>{props.view.label}</option>{:else if props.kind === 'ingredient'}<div class="supp-ingredient-row" data-idx={props.view.index} data-original-index={props.view.originalIndex}>
    <input type="text" class="supp-ing-name" aria-label="Ingredient name" placeholder="Ingredient" value={props.view.name}>
    <input type="text" inputmode="decimal" class="supp-ing-amount" aria-label="Amount per serving" placeholder="Amount" value={props.view.amount}>
    <select class="supp-ing-unit" aria-label="Amount unit">{#each props.view.unitOptions as option}<SupplementOption view={option}/>{/each}<option value="__custom__" selected={props.view.otherSelected}>Other…</option></select>
    <input type="text" class="supp-ing-unit-custom" aria-label="Custom amount unit" placeholder="Unit" value={props.view.customUnit} hidden={props.view.customHidden}>
    <input type="number" class="supp-ing-times" aria-label="Ingredient servings per day override" placeholder="×/day" min="0" max="99" step="0.5" value={props.view.timesPerDay}>
    <span class="supp-ing-total">{props.view.dailyTotal}</span>
    <button class="supp-ing-remove" data-supp-action={props.view.removeAction.name} data-supp-index={props.view.removeAction.index} title="Remove">&times;</button>
  </div>{/if}
