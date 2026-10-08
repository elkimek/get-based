<script lang="ts">
  import type { NutritionPresentationProps } from '../nutrition-presentation-model.js';
  import Goal from './NutritionGoalRow.svelte';
  import Ring from './NutritionTargetRing.svelte';
  import Fuel from './NutritionFuelCard.svelte';
  import Meal from './NutritionMealRow.svelte';
  import History from './NutritionHistory.svelte';
  let props: NutritionPresentationProps = $props();
</script>
{#if props.kind === 'goal'}<Goal view={props.view}/>
{:else if props.kind === 'ring'}<Ring view={props.view}/>
{:else if props.kind === 'fuel'}<Fuel view={props.view}/>
{:else if props.kind === 'meal'}<Meal view={props.view}/>
{:else}<History view={props.view}/>{/if}
