import { renderHTML } from './components/SupplementImpact.svelte.html.js';

export type SupplementImpactView = Readonly<{ kind: 'hint'; hint: string }>
  | Readonly<{ kind: 'analysis'; dotClass: string; dotId: string; refreshIndex: string | null;
    summaryClass: string; summaryId: string; summaryText: string }>;

export function renderSupplementImpactView(view: SupplementImpactView): string {
  return renderHTML({ view });
}
