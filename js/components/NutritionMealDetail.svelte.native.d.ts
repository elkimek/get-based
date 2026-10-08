import type { Component } from 'svelte';
import type { NutritionMealDetailView, NutritionMealDetailActions } from '../nutrition-meal-detail-model.js';
declare const component: Component<{ view: NutritionMealDetailView; actions?: NutritionMealDetailActions }, { save(clear?: boolean): Promise<boolean> }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
