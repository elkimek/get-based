export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  forceShow?: boolean;
}
// Current release kept separate so the historical archive remains bounded.
export const CURRENT_RELEASE = { version: '1.27.0', date: '2026-11-02', title: 'Update your health records in chat', items: [
  '<b>Tell chat what changed.</b> Share a new health goal, a change in your routine, or paste a health summary. getbased can suggest updates to your records.',
  '<b>Review before saving.</b> Apply the changes you want or discard them. Chat saves health changes only after you approve.',
  '<b>You choose.</b> Turn Health updates through chat on or off in Settings → AI.',
] } satisfies ChangelogEntry;
