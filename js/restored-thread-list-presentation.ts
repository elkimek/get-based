import { renderHTML } from './components/RestoredThreadList.svelte.html.js';

export interface RestoredThreadListRow {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly icon: string;
  readonly iconTitle: string | null;
  readonly updatedAt: string;
  readonly messageCount: number;
}

/** Import recovery before the interactive Chat navigation owner is available. */
export function renderRestoredThreadList(rows: readonly RestoredThreadListRow[]): string {
  return renderHTML({ rows });
}
