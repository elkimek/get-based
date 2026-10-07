import type { Component } from 'svelte';
import type { FoodContaminantSection } from '../context-food-contaminants-model.js';
declare const component: Component<{ sections: FoodContaminantSection[]; current(): boolean; close(): void; discuss(): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
