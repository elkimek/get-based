import type { Component } from 'svelte';
import type { NutritionHistoryView } from '../nutrition-presentation-model.js';
declare const component: Component<{ view: NutritionHistoryView; current?: () => boolean }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
