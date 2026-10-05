export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  forceShow?: boolean;
}
// Current release kept separate so the historical archive remains bounded.
export const CURRENT_RELEASE = { version: '1.23.0', date: '2026-10-05', title: 'Migration to TypeScript 7', items: [
  '<b>getbased has been fully migrated to TypeScript 7.</b> This gives future development a stronger foundation, helps catch errors earlier, and makes the code easier to maintain. Existing profiles, data, and familiar workflows remain compatible.',
  '<b>Fixes for issues inherited from the JavaScript codebase.</b> Improved Routstr wallet handling across mints, nodes, and refund recovery.',
  '<b>Faster repeated node browsing.</b> Recently loaded node information is cached to reduce waiting when browsing again.',
  '<b>Safer profile handling.</b> More reliable profile switching and stronger protection for unreadable encrypted data.',
  '<b>Improved startup reliability.</b> Fixes for app startup and offline updates.',
  '<b>Updated documentation and release checks.</b> Setup instructions and verification now reflect the TypeScript migration.',
] } satisfies ChangelogEntry;
