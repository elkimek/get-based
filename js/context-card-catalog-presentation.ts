import type {NutritionContextLinkView} from './nutrition-context-card-view.js';
import type { DemoContextAIMode } from './context-card-health-dots.js';
// Profile labels, summaries, explanations and notes always use Svelte text interpolation.
export type ContextCatalogIconName = 'healthGoals' | 'diagnoses' | 'diet' | 'exercise' | 'sleepRest' | 'lightCircadian' | 'stress' | 'loveLife' | 'environment';
export interface ContextCatalogCard {
  readonly key: string;
  readonly label: string;
  readonly icon: ContextCatalogIconName;
  readonly editor: string;
  readonly tooltip: string;
  readonly placeholder: string;
  readonly summary: string;
  readonly filled: boolean;
  readonly contaminants: number | null;
  readonly nutrition: NutritionContextLinkView | null;
}
export interface ContextDemoBar {
  kind: 'local' | 'paid-live' | 'paid-off' | 'precomputed'; title: string; copy: string;
  action: 'enable-demo-live-ai' | 'disable-demo-live-ai' | null; actionLabel: string;
}
export interface ContextCatalogView {
  renderId: string; embedded: boolean; subtitle: string; cards: ContextCatalogCard[];
  addedCount: number; refresh: boolean; demo: ContextDemoBar | null; notes: string;
  statusTicket?: string; notesTicket?: string; notesStatus?: string; notesSaved?: string | null;
}
/** Copy and consent affordances are a projection; rendering cannot enable inference. */
export function projectContextDemoBar(mode: DemoContextAIMode): ContextDemoBar | null {
  if (!mode.demo) return null;
  if (mode.mode === 'local-live') return { kind: 'local', title: 'Local AI active',
    copy: `Edited cards update automatically with ${mode.modelLabel}. No paid-provider token charges.`, action: null, actionLabel: '' };
  if (mode.mode === 'paid-live') return { kind: 'paid-live', title: 'Live AI enabled',
    copy: `${mode.providerLabel} · ${mode.modelLabel}. Context edits may use paid tokens.`, action: 'disable-demo-live-ai', actionLabel: 'Turn off' };
  if (mode.mode === 'paid-off') return { kind: 'paid-off', title: 'Precomputed demo insights',
    copy: `Live AI is off to prevent unexpected ${mode.providerLabel} charges.`, action: 'enable-demo-live-ai', actionLabel: 'Enable live AI' };
  return { kind: 'precomputed', title: 'Precomputed demo insights', copy: mode.mode === 'paused'
    ? 'AI is paused. Browsing and editing use no inference.'
    : 'Browsing and editing use no AI inference. Connect a provider to recalculate changed cards.', action: null, actionLabel: '' };
}
