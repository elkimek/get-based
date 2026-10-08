<script lang="ts">
  import type { NutritionPresentationProps } from '../nutrition-presentation-model.js';
  import Goal from './NutritionGoalRow.svelte';
  import Ring from './NutritionTargetRing.svelte';
  import Fuel from './NutritionFuelCard.svelte';
  import Meal from './NutritionMealRow.svelte';
  import History from './NutritionHistory.svelte';
  import Entry from './NutritionEntry.svelte';
  import Detail from './NutritionMealDetail.svelte';
  import Dashboard from './NutritionDashboard.svelte';
  let props: NutritionPresentationProps = $props();
</script>
{#if props.kind === 'goal'}<Goal view={props.view}/>
{:else if props.kind === 'ring'}<Ring view={props.view}/>
{:else if props.kind === 'fuel'}<Fuel view={props.view}/>
{:else if props.kind === 'meal'}<Meal view={props.view}/>
{:else if props.kind === 'history'}<History view={props.view}/>
{:else if props.kind === 'entry'}<Entry view={props.view}/>
{:else if props.kind === 'detail'}<Detail view={props.view}/>
{:else}<Dashboard view={props.view}/>{/if}
