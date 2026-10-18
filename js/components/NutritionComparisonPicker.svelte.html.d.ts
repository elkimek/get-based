import type { NutritionPresentationProps } from '../nutrition-presentation-model.js';
export function renderHTML(props: Omit<Extract<NutritionPresentationProps, { kind: 'comparison-picker' }>, 'kind'>): string;
