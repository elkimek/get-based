# Folder Backup

Folder backup automatically saves your getbased data to a local folder on your computer using the **File System Access API**. This gives you a portable backup file that lives outside the browser — on your local drive, Proton Drive, Dropbox, NAS, or anywhere you choose.

## Setup

The fastest path is the dashboard's **🛡 Protect your data** pill, which opens a small picker that includes Auto-backup. Or:

1. Go to **Settings → Data → Folder Backup**
2. Click **Pick Folder** and choose a destination
3. Done — backups happen automatically from now on

The folder handle is persisted across browser sessions, so you only need to pick the folder once. If the browser loses access (e.g., after clearing site data), you'll be prompted to re-select.

## What Gets Saved

Each backup is a full snapshot of your getbased database:

- All profiles and their lab entries
- Context cards, notes, supplements, cycle data
- Chat history and conversation threads
- Custom personalities and marker definitions
- API keys and app settings

Two files are written to your chosen folder:

- **`getbased-backup-latest.json`** — always-current snapshot, overwritten on each backup
- **`getbased-backup-YYYY-MM-DD.json`** — daily dated snapshot, one per day (up to 30 days retained)

## When Backups Run

A backup is triggered automatically after data changes (same debounce as the IndexedDB auto-backup — 5 minutes after the last change). You can also trigger a manual backup from the Settings panel.

## Browser Support

Folder backup requires the **File System Access API**, which is available in:

- Chrome / Chromium 86+
- Edge 86+
- Opera 72+

Firefox and Safari do not support this API. The folder backup option is automatically hidden on unsupported browsers. Use [JSON Export](./json-export-import.md) as your portable backup on those browsers.

## Restoring from a Folder Backup

Folder backup files are standard getbased JSON exports. To restore:

1. Open getbased in any browser
2. Drop the backup `.json` file onto the import drop zone
3. Data is merged into your current profile

For full database bundles (multi-profile backups), the import process handles profile merging automatically. See [JSON Export & Import](./json-export-import.md#database-bundles) for details.
