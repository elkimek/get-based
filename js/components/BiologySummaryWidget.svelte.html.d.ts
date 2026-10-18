import type { BiologySummaryProps } from '../biology-summary-presentation.js';
export function renderHTML(props: Omit<Extract<BiologySummaryProps, { kind: 'widget' }>, 'kind'>): string;
