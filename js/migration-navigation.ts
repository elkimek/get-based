// Owners register transient work without importing application storage here.
export interface MigrationWorkSnapshot {
  files: Array<{name: string; blob: Blob}>;
  pending: boolean;
  isCurrent(): boolean;
}
let flushDrafts: () => Promise<void> = async () => {};
let checkAttachments: () => void = () => {};
const readers = new Map<string, () => MigrationWorkSnapshot>();
export function configureMigrationDraftFlush(callback: () => Promise<void>) {flushDrafts = callback;}
export function configureMigrationAttachmentCheck(callback: () => void) {checkAttachments = callback;}
export function configureMigrationUnsavedWork(owner: string, callback: () => MigrationWorkSnapshot) {readers.set(owner, callback);}
export function captureMigrationUnsavedWork(): MigrationWorkSnapshot {
  const owners = [...readers.entries()];
  const snapshots = owners.map(([, read]) => read());
  return {files: snapshots.flatMap(snapshot => snapshot.files), pending: snapshots.some(snapshot => snapshot.pending),
    isCurrent: () => readers.size === owners.length && owners.every(([owner, read]) => readers.get(owner) === read)
      && snapshots.every(snapshot => snapshot.isCurrent())};
}
export function saveMigrationDrafts() {return flushDrafts();}
export async function openMigrationRecovery() {
  await saveMigrationDrafts();
  checkAttachments();
  location.assign('/app/migration.html');
}
/** Only after the user explicitly confirms saving all offered in-memory copies. */
export function openMigrationAfterSavedWork(snapshot: MigrationWorkSnapshot) {
  if (snapshot.pending || !snapshot.isCurrent()) throw new Error('Unsaved work changed. Refresh the copies and save them before continuing.');
  location.assign('/app/migration.html');
}
