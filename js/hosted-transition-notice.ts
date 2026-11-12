import {getHostedTransition} from '../shared/hosted-transition.js';
import {renderHTML} from './components/HostedTransitionBanner.svelte.html.js';
import {openMigrationRecovery, saveMigrationDrafts, captureMigrationUnsavedWork, openMigrationAfterSavedWork, type MigrationWorkSnapshot} from './migration-navigation.js';
import {showConfirmDialog, showNotification} from './utils.js';
const SEEN = 'labcharts-hosted-transition-seen';
function migrate() {void openMigrationRecovery().catch(error => showNotification(error instanceof Error ? error.message : 'Migration could not start. Keep this window open and retry.', 'error', 12000));}
export function showHostedTransitionNotice(): Promise<void> | null {
  const transition = getHostedTransition(location.origin);
  if (!transition || transition.phase !== 'notice' || document.getElementById('hosted-transition-banner')) return null;
  const date = new Date(transition.cutoffAt).toLocaleString(undefined, {dateStyle: 'long', timeStyle: 'short'});
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/css/hosted-transition.css'; document.head.appendChild(style);
  const host = document.createElement('div');
  host.innerHTML = renderHTML({date, cutoff: new Date(transition.cutoffAt).toISOString(), announcementUrl: transition.announcementUrl});
  const banner = host.firstElementChild; if (!banner) return null;
  document.body.prepend(banner); banner.querySelector('button')?.addEventListener('click', migrate);
  if (localStorage.getItem(SEEN) === String(transition.announcedAt)) return null;
  const message = 'getbased is moving to self-hosting. You can use this hosted app for personal records until ' + date
    + '. After that, this address will stay available for recovery. Download a migration file, restore it at your own address and check your records before clearing anything here. The official encrypted Sync relay remains available during migration.';
  return showConfirmDialog(message, {ariaLabel: 'Hosted app is moving to self-hosting', confirmLabel: 'Start migration', cancelLabel: 'Continue for now', tone: 'primary'})
    .then(start => {localStorage.setItem(SEEN, String(transition.announcedAt)); if (start) migrate();})
    .catch(() => showNotification('The hosted transition notice is available in the banner. Your saved data is unchanged.', 'error'));
}

/** A modal blocks new edits while preserving every still-open work owner. */
export async function showHostedRecoveryCutoff(): Promise<void> {
  if (document.getElementById('hosted-cutoff-dialog')) return;
  if (!document.querySelector('link[href="/css/hosted-transition.css"]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/css/hosted-transition.css'; document.head.append(style);
  }
  const host = document.createElement('div');
  host.innerHTML = renderHTML({date: '', cutoff: '', announcementUrl: null, recovery: true});
  const dialog = host.querySelector<HTMLDialogElement>('dialog')!;
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.showModal();
  const status = dialog.querySelector<HTMLElement>('[data-cutoff-error]')!;
  const retry = dialog.querySelector<HTMLButtonElement>('[data-cutoff-retry]')!;
  const proceed = dialog.querySelector<HTMLButtonElement>('[data-cutoff-continue]')!;
  const confirm = dialog.querySelector<HTMLInputElement>('[data-cutoff-confirm]')!;
  let snapshot: MigrationWorkSnapshot | undefined;
  const copies = () => {
    snapshot = undefined; proceed.disabled = true; confirm.checked = false;
    const captured = captureMigrationUnsavedWork();
    const list = dialog.querySelector('[data-cutoff-files]')!;
    list.replaceChildren();
    for (const file of captured.files) {
      const item = document.createElement('li'), link = document.createElement('a');
      link.href = URL.createObjectURL(file.blob); link.download = file.name; link.textContent = file.name;
      item.append(link); list.append(item);
    }
    dialog.querySelector<HTMLElement>('[data-cutoff-work]')!.hidden = captured.files.length === 0;
    snapshot = captured;
    proceed.textContent = captured.files.length ? 'Continue after saving copies' : 'Open saved-data recovery';
    proceed.disabled = captured.pending || captured.files.length > 0;
    if (captured.pending) status.textContent += ' An image is still being prepared. Keep this window open and retry when it finishes.';
  };
  const attempt = async (open = true) => {
    retry.disabled = true; proceed.disabled = true;
    try {
      if (open) await openMigrationRecovery();
      else {await saveMigrationDrafts(); status.textContent = 'Text drafts are saved. Choose recovery when you are ready to leave this page.'; copies();}
    }
    catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Pending work could not be saved. Keep this window open and retry.';
      if (status.textContent.startsWith('Save or remove unsent image attachments')) status.textContent = 'Save copies of the unsent image attachments below before continuing.';
      try {copies();} catch {status.textContent += ' Unsaved copies are not ready. Keep this window open and retry.';}
    } finally {retry.disabled = false;}
  };
  confirm.addEventListener('change', () => {proceed.disabled = !snapshot || snapshot.pending || !confirm.checked;});
  retry.addEventListener('click', () => {void attempt();});
  proceed.addEventListener('click', () => {
    if (!snapshot || (snapshot.files.length && !confirm.checked)) return;
    try {openMigrationAfterSavedWork(snapshot);}
    catch (error) {status.textContent = error instanceof Error ? error.message : 'Refresh and save the copies before continuing.'; proceed.disabled = true;}
  });
  await attempt(false);
}
