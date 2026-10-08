import type { Component } from 'svelte';
import type { NutritionEntryView, NutritionEntryActions, NutritionEntryExports } from '../nutrition-entry-model.js';
declare const component: Component<{ view: NutritionEntryView; actions?: NutritionEntryActions }, NutritionEntryExports>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
