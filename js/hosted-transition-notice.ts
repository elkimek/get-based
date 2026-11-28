import {getHostedTransition} from '../shared/hosted-transition.js';
import {renderHTML} from './components/HostedTransitionBanner.svelte.html.js';
import {openMigrationRecovery, saveMigrationDrafts, captureMigrationUnsavedWork, openMigrationAfterSavedWork, type MigrationWorkSnapshot} from './migration-navigation.js';
import {showConfirmDialog, showNotification} from './utils.js';
const SEEN = 'labcharts-hosted-transition-seen';
function migrate() {void openMigrationRecovery().catch(error => showNotification(error instanceof Error ? error.message : 'Migration could not start. Keep this window open and retry.', 'error', 12000));}
export function showHostedTransitionNotice(): Promise<void> | null {
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.publicDemo === 'true') return null;
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

function captureOpenEditorWork(): MigrationWorkSnapshot {
  const skipped = new Set(['hidden', 'password', 'file', 'button', 'submit', 'reset', 'search']);
  const fieldLabel = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string => {
    const id = element.id;
    const escapedId = id ? (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')) : '';
    const label = escapedId ? document.querySelector<HTMLLabelElement>(`label[for="${escapedId}"]`)?.textContent?.trim() : '';
    return label || element.getAttribute('aria-label')?.trim() || element.name || id || element.tagName.toLowerCase();
  };
  const fieldValue = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): {value: string; dirty: boolean} | null => {
    if (element.id === 'chat-input' || element.disabled) return null;
    if (element instanceof HTMLInputElement) {
      if (skipped.has(element.type)) return null;
      if (element.type === 'checkbox' || element.type === 'radio') {
        const dirty = element.checked !== element.defaultChecked;
        return dirty ? {value: element.checked ? 'checked' : 'unchecked', dirty} : null;
      }
      const value = element.value.trim();
      return value ? {value, dirty: element.value !== element.defaultValue} : null;
    }
    if (element instanceof HTMLSelectElement) {
      const dirty = [...element.options].some(option => option.selected !== option.defaultSelected);
      return element.value ? {value: element.value, dirty} : null;
    }
    const value = element.value.trim();
    return value ? {value, dirty: element.value !== element.defaultValue} : null;
  };
  const readContainers = () => {
    const containers = [...document.querySelectorAll<HTMLElement>('.modal-overlay.show, dialog[open]:not(#hosted-cutoff-dialog), [data-chat-message-editor-host], #main-content form')]
      .filter(node => !node.closest('#hosted-cutoff-dialog'));
    const sections: string[] = [];
    const seen = new Set<HTMLElement>();
    for (const container of containers) {
      const controls = [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
        .filter(control => !seen.has(control) && !control.closest('#hosted-cutoff-dialog'));
      for (const control of controls) seen.add(control);
      const entries: Array<{label: string; value: string; dirty: boolean}> = [];
      for (const control of controls) {
        const current = fieldValue(control);
        if (current) entries.push({label: fieldLabel(control), ...current});
      }
      const alwaysCapture = container.id === 'import-modal-overlay' || container.matches('[data-chat-message-editor-host]');
      if (!entries.length || (!alwaysCapture && !entries.some(entry => entry.dirty))) continue;
      const heading = container.querySelector('h1, h2, h3, [data-modal-title]')?.textContent?.trim() || container.id || 'Open editor';
      sections.push(heading + '\n' + entries.map(entry => entry.label + ': ' + entry.value).join('\n'));
    }
    return sections.join('\n\n---\n\n');
  };
  const content = readContainers();
  return {
    pending: false,
    files: content ? [{name: 'getbased-unsaved-editor-drafts.txt', blob: new Blob([content], {type: 'text/plain;charset=utf-8'})}] : [],
    isCurrent: () => readContainers() === content,
  };
}

function captureAllCutoffWork(): MigrationWorkSnapshot {
  const registered = captureMigrationUnsavedWork();
  const editors = captureOpenEditorWork();
  if (!editors.files.length && !editors.pending) return registered;
  return {
    files: [...registered.files, ...editors.files],
    pending: registered.pending || editors.pending,
    isCurrent: () => registered.isCurrent() && editors.isCurrent(),
  };
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
  let objectUrls: string[] = [];
  const revokeUrls = () => { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls = []; };
  const copies = () => {
    revokeUrls();
    snapshot = undefined; proceed.disabled = true; confirm.checked = false;
    const captured = captureAllCutoffWork();
    const list = dialog.querySelector('[data-cutoff-files]')!;
    list.replaceChildren();
    for (const file of captured.files) {
      const item = document.createElement('li'), link = document.createElement('a');
      const url = URL.createObjectURL(file.blob); objectUrls.push(url);
      link.href = url; link.download = file.name; link.textContent = file.name;
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
      if (open) {
        const editorWork = captureOpenEditorWork();
        if (editorWork.files.length) {
          await saveMigrationDrafts();
          status.textContent = 'Save a copy of your open editor changes below before leaving this page.';
          copies();
          return;
        }
        await openMigrationRecovery();
      } else {
        await saveMigrationDrafts();
        const editorWork = captureOpenEditorWork();
        status.textContent = editorWork.files.length
          ? 'Text drafts are saved. Download the unsaved open editor copy below before leaving this page.'
          : 'Text drafts are saved. Choose recovery when you are ready to leave this page.';
        copies();
      }
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
