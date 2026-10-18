import type { BiologyOverviewProps } from '../biology-overview-presentation.js';
export function renderHTML(props: Omit<Extract<BiologyOverviewProps, { kind: 'dashboard-coherence' }>, 'kind'>): string;
