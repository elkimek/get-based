export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  forceShow?: boolean;
}
// Current release kept separate so the historical archive remains bounded.
export const CURRENT_RELEASE = { version: '1.28.0', date: '2026-11-12', title: 'Move getbased to your own devices', items: [
  '<b>A simpler self-hosted installation.</b> Download the prebuilt release package, install it with npm and run getbased. Private HTTPS through Tailscale gives your computers, phones and tablets a shared app address.',
  '<b>Take your browser data with you.</b> Start migration in Settings → Data → Backup & Restore. Create a password-protected migration file, restore at your own address and check the verified recovery before clearing anything.',
  '<b>Keep a recovery route.</b> Download older saved snapshots from the recovery screen without replacing your current records. The original hosted address remains available for recovery after the announced 30-day transition.',
  '<b>Explore with sample data.</b> The public demo has a separate address and accepts no personal records. The official encrypted Sync relay remains available during migration.',
] } satisfies ChangelogEntry;
