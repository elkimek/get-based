import type { NutritionPresentationProps } from '../nutrition-presentation-model.js';
export function renderHTML(props: Omit<Extract<NutritionPresentationProps, { kind: 'benchmark-photo' }>, 'kind'>): string;
