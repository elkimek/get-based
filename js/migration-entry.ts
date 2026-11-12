import MigrationRecovery, {mount, flushSync} from './components/MigrationRecovery.svelte.native.js';
import { initialMigrationView } from './migration-view.js';
import { buildMigrationArchive, inspectMigrationArchive } from './migration-archive.js';
import { getPendingMigration, restoreMigrationArchive } from './migration-restore.js';
import { existingMigrationDatabases } from './migration-database.js';
import { migrationSnapshotCatalog, readMigrationSnapshot } from './migration-snapshots.js';
import type { MigrationSnapshotLabel } from './migration-snapshots.js';
import { serializeBackupSnapshot } from './backup-serialization.js';
import type { MigrationArchive } from './migration-archive.js';
import type { MigrationActions, MigrationViewState } from './migration-view.js';

const target = document.getElementById('migration-root');
if (!target) throw new Error('Recovery surface is missing.');
let state = initialMigrationView(), selected: Blob | null = null, inspected: MigrationArchive | null = null;
let snapshots: MigrationSnapshotLabel[] = [];
let preparedDownload: {blob: Blob; name: string} | null = null;
let view: {update(value: MigrationViewState): void; clearSecrets(): void};
function update(patch: Partial<MigrationViewState>) {state = {...state, ...patch}; view.update(state); flushSync();}
function summary(archive: MigrationArchive) {
  return {...archive.inventory, sourceOrigin: archive.sourceOrigin,
    files: archive.files.length, encrypted: archive.local['labcharts-encryption-enabled'] === 'true', syncRecovery: !!archive.syncRecovery};
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  try {anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click();}
  finally {anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);}
}
async function run(operation: () => Promise<void>) {
  if (state.busy) return;
  update({busy: true, error: ''});
  try {await operation();}
  catch (error) {update({error: error instanceof Error ? error.message : 'Recovery could not finish. Keep the source browser and retry.'});}
  finally {update({busy: false});}
}
const actions: MigrationActions = {
  export: (password, original) => run(async () => {
    const blob = await buildMigrationArchive(password, original, status => update({status}));
    preparedDownload = {blob, name: 'getbased-migration-' + new Date().toISOString().slice(0, 10) + '.json'};
    update({downloadKind: 'migration', status: 'Your encrypted migration file is ready. Choose Download migration file to save it.'});
  }),
  download: () => {
    if (!preparedDownload || state.busy) return;
    try {
      download(preparedDownload.blob, preparedDownload.name);
      update({error: '', status: state.downloadKind === 'migration'
        ? 'Migration download started. Restore and check the file before clearing the source.'
        : 'Saved snapshot download started. Current records are retained.'});
    } catch {update({error: 'The download could not start. Keep this page open and try the Download button again.'});}
  },
  inspect: (file, password) => run(async () => {
    inspected = null; update({summary: null});
    const pending = await getPendingMigration(); selected = file ?? pending?.blob ?? null;
    if (!selected) throw new Error('Choose a migration file.');
    inspected = await inspectMigrationArchive(selected, password);
    update({summary: summary(inspected), status: 'File checked. No destination records have been changed.', pending: !!pending});
  }),
  restore: (password, original) => run(async () => {
    if (!selected || !inspected) throw new Error('Check the migration file first.');
    update({status: 'Checking the destination and preparing recovery tools…'});
    try {
      inspected = await restoreMigrationArchive(selected, password, original, status => update({status}));
      update({summary: summary(inspected), complete: true, pending: false, status: 'Recovery passed verification. Your source records have not been erased.'});
    } finally {update({pending: !!(await getPendingMigration())});}
  }),
  cancel: () => {selected = null; inspected = null; update({summary: null, status: 'Choose and check the migration file before restoring. No destination records were changed.', error: ''});},
  snapshot: index => run(async () => {
    const selected = snapshots[index];
    if (!selected) throw new Error('The saved snapshot is unavailable. Reload this page and retry.');
    const stored = await readMigrationSnapshot(selected.key);
    if (stored?.snapshot?.format !== 'labcharts-backup' || stored.snapshot.version !== 1) throw new Error('The saved snapshot is missing or unsupported.');
    preparedDownload = {blob: new Blob([serializeBackupSnapshot(stored.snapshot)!], {type: 'application/json'}), name: 'getbased-saved-snapshot.json'};
    update({downloadKind: 'snapshot', status: 'The saved snapshot is ready. Choose Download saved backup to save it.'});
  }),
  recoveryWords: () => run(async () => {
    const words = inspected?.syncRecovery?.mnemonic;
    if (!words) throw new Error('No Sync recovery words are available in this file.');
    await navigator.clipboard.writeText(words);
    update({status: 'Sync recovery words copied. Join the same identity only after checking your recovered records.'});
    setTimeout(() => {void navigator.clipboard.readText().then(value => value === words ? navigator.clipboard.writeText('') : undefined).catch(() => {});}, 60000);
  }),
};
target.replaceChildren();
view = mount(MigrationRecovery, {target, props: {initial: state, actions}});
void run(async () => {
  const pending = await getPendingMigration();
  const names = await existingMigrationDatabases();
  if (names.includes('labcharts-backups')) {
    snapshots = await migrationSnapshotCatalog();
  }
  update({pending: !!pending || !!localStorage.getItem('labcharts-migration-pending'), sourceEncrypted: localStorage.getItem('labcharts-encryption-enabled') === 'true',
    snapshots: snapshots.map((record, index) => ({index, date: typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) ? new Date(record.createdAt).toLocaleString() : 'Undated snapshot', encrypted: !!record.encrypted})),
    status: pending ? 'A destination recovery is pending. Enter the migration password to resume.' : 'Your source records stay in this browser throughout migration.'});
  document.documentElement.dataset.migrationReady = '';
});
