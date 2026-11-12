// Owners register transient-work checks without importing app storage here.
let flushDrafts: () => Promise<void> = async () => {};
let checkAttachments: () => void = () => {};
export function configureMigrationDraftFlush(callback: () => Promise<void>) {flushDrafts = callback;}
export function configureMigrationAttachmentCheck(callback: () => void) {checkAttachments = callback;}
export async function openMigrationRecovery() {
  checkAttachments();
  await flushDrafts();
  checkAttachments();
  location.assign('/app/migration.html');
}
