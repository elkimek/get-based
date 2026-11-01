export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  forceShow?: boolean;
}
// Current release kept separate so the historical archive remains bounded.
export const CURRENT_RELEASE = { version: '1.26.0', date: '2026-11-01', title: 'Personal baselines and immune markers', items: [
  '<b>See your personal baseline.</b> Marker charts can now show a baseline from your previous results, helping you compare a new reading with your own history.',
  '<b>Get more context in chat.</b> AI can consider your baseline alongside lab and optimal ranges when explaining changes in your results.',
  '<b>Track more immune markers.</b> Added CD4, CD8, total T cells, B cells and NK cells, with separate counts and percentages, plus CD4/CD8 and lymphocyte-to-monocyte (LMR) ratios.',
  '<b>Read small changes more clearly.</b> Charts keep low readings visible when reference ranges are much wider than your results.',
] } satisfies ChangelogEntry;
