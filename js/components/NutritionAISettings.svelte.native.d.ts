import type { Component } from 'svelte';
import type { NutritionAISettingsSnapshot, NutritionAISettingsComponentView } from '../nutrition-ai-settings-contract.js';
declare const NutritionAISettings: Component<{ initial: NutritionAISettingsSnapshot }, NutritionAISettingsComponentView>;
export default NutritionAISettings;
export { mount, unmount, flushSync } from 'svelte';
