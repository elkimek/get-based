<script lang="ts">
  import type { NutritionPresentationProps } from '../nutrition-presentation-model.js';
  import Goal from './NutritionGoalRow.svelte';
  import Ring from './NutritionTargetRing.svelte';
  import Fuel from './NutritionFuelCard.svelte';
  import Meal from './NutritionMealRow.svelte';
  import History from './NutritionHistory.svelte';
  import Entry from './NutritionEntry.svelte';
  import Detail from './NutritionMealDetail.svelte';
  import ComparisonResults from './NutritionComparisonResults.svelte';
  import Benchmark from './NutritionBenchmark.svelte';
  import ComparisonPicker from './NutritionComparisonPicker.svelte';
  import BenchmarkPhoto from './NutritionBenchmarkPhoto.svelte';
  import BenchmarkStatus from './NutritionBenchmarkStatus.svelte';
  import Dashboard from './NutritionDashboard.svelte';
  import Editor from './NutritionMealEditor.svelte';
  import MealModel from './NutritionMealModelPicker.svelte';
  import MealPhoto from './NutritionMealPhoto.svelte';
  import EditorNavigation from './NutritionEditorNavigation.svelte';
  import AnalysisProgress from './NutritionAnalysisProgress.svelte';
  import EditableIngredients from './NutritionEditableIngredients.svelte';
  import EditorFeedback from './NutritionEditorFeedback.svelte';
  let props: NutritionPresentationProps = $props();
</script>
{#if props.kind === 'editable-ingredients'}<EditableIngredients rows={props.rows}/>
{:else if props.kind === 'editor-feedback'}<EditorFeedback view={props.view}/>
{:else if props.kind === 'editor'}<Editor view={props.view}/>
{:else if props.kind === 'meal-model'}<MealModel view={props.view}/>
{:else if props.kind === 'meal-photo'}<MealPhoto view={props.view}/>
{:else if props.kind === 'editor-navigation'}<EditorNavigation part={props.part}/>
{:else if props.kind === 'analysis-progress'}<AnalysisProgress view={props.view}/>
{:else if props.kind === 'goal'}<Goal view={props.view}/>
{:else if props.kind === 'ring'}<Ring view={props.view}/>
{:else if props.kind === 'fuel'}<Fuel view={props.view}/>
{:else if props.kind === 'meal'}<Meal view={props.view}/>
{:else if props.kind === 'history'}<History view={props.view}/>
{:else if props.kind === 'entry'}<Entry view={props.view}/>
{:else if props.kind === 'comparison-results'}<ComparisonResults view={props.view}/>
{:else if props.kind === 'benchmark'}<Benchmark view={props.view}/>
{:else if props.kind === 'comparison-picker'}<ComparisonPicker view={props.view}/>
{:else if props.kind === 'benchmark-photo'}<BenchmarkPhoto urls={props.urls}/>
{:else if props.kind === 'benchmark-status'}<BenchmarkStatus view={props.view}/>
{:else if props.kind === 'detail'}<Detail view={props.view}/>
{:else}<Dashboard view={props.view}/>{/if}
