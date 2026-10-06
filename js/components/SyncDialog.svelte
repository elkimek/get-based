<script lang="ts">
  import type {} from './svelte-html-attributes.js';
  import { untrack } from 'svelte';
  import type { SyncDialogState } from '../sync-dialog-contract.js';
  import { SYNC_DIALOG_PRIMARY, SYNC_DIALOG_SECONDARY, SYNC_DIALOG_INPUT, SYNC_DIALOG_HELP } from '../sync-dialog-classes.js';
  let { initial, dismiss }: { initial: SyncDialogState; dismiss: () => void } = $props();
  let snapshot = $state(untrack(() => initial));
  let generatedPhrase = $state('');
  let wordCount = $state(0);
  let savedPhrase = $state(false);
  let dialog: HTMLDivElement | undefined = $state();
  let phraseInput: HTMLTextAreaElement | undefined = $state();
  let acknowledgement: HTMLInputElement | undefined = $state();
  const setup = $derived(snapshot.kind === 'setup');
  const titleId = $derived(setup ? 'sync-setup-title' : 'sync-restore-title');
  const inputId = $derived(setup ? 'sync-setup-restore-input' : 'sync-restore-dialog-input');
  const messageId = $derived(setup ? 'sync-setup-restore-msg' : 'sync-restore-dialog-msg');
  const validation = $derived(wordCount === 24 ? '✓ 24 words detected' : wordCount ? `${wordCount} word${wordCount === 1 ? '' : 's'} so far — need exactly 24` : setup ? 'Paste the 24 words from the device that already has sync.' : '');
  const tone = $derived(snapshot.message ? snapshot.tone : wordCount === 24 ? 'success' : wordCount ? 'warning' : 'secondary');
  const toneClass = $derived(({ secondary:'gb:sync-dialog:text-secondary', warning:'gb:sync-dialog:text-warning-ink', success:'gb:sync-dialog:text-success-ink', danger:'gb:sync-dialog:text-danger' })[tone]);
  export function update(next: SyncDialogState): void { snapshot = next; }
  export function readPhrase(): string { return phraseInput?.value.trim() || ''; }
  export function validate(): void {
    const value = readPhrase(); wordCount = value ? value.split(/\s+/).length : 0;
    if (acknowledgement) savedPhrase = acknowledgement.checked;
  }
  export function acknowledged(): boolean { return !!acknowledgement?.checked; }
  export function showGeneratedPhrase(value: string): void { generatedPhrase = value; savedPhrase = false; }
  export function clearSecrets(): void {
    generatedPhrase = ''; wordCount = 0; savedPhrase = false;
    if (phraseInput) phraseInput.value = '';
  }
  export function focusFirst(): void {
    const controls = dialog?.querySelectorAll<HTMLElement>('textarea:not([disabled]),input:not([disabled]),button:not([disabled])');
    [...controls || []].find(element => !element.closest('[hidden]'))?.focus();
  }
  function trapFocus(event: KeyboardEvent): void {
    if (!dialog?.isConnected) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')].filter(element => !element.closest('[hidden]'));
    const first = controls[0]; const last = controls.at(-1);
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus();
    } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
</script>
<svelte:window onkeydown={trapFocus}/>
<div bind:this={dialog} class="confirm-dialog sync-setup-dialog gb:sync-dialog:box-border gb:sync-dialog:w-[calc(100vw-24px)] gb:sync-dialog:max-w-[480px] gb:sync-dialog:max-h-[calc(100dvh-24px)] gb:sync-dialog:overflow-y-auto gb:sync-dialog:overscroll-contain gb:sync-dialog:bg-secondary-surface gb:sync-dialog:text-ink gb:sync-dialog:border gb:sync-dialog:border-line gb:sync-dialog:rounded-[var(--radius)] gb:sync-dialog:p-6 gb:sync-dialog:max-[375px]:p-4 gb:sync-dialog:[&_[hidden]]:hidden" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={snapshot.pending} tabindex="-1" data-sync-dialog-view>
  <h3 id={titleId} class="gb:sync-dialog:mt-0 gb:sync-dialog:mb-1.5 gb:sync-dialog:text-[16px] gb:sync-dialog:font-semibold gb:sync-dialog:text-ink">{setup ? snapshot.step === 'join' ? 'Join existing sync' : 'Set up sync' : 'Restore from mnemonic'}</h3>
  <p class={SYNC_DIALOG_HELP}>{setup ? 'Your data is encrypted with a 24-word mnemonic. The relay server only sees ciphertext.' : 'Paste your 24-word seed from another device. This replaces your current sync identity — anything synced under the old identity will no longer reach this device.'}</p>
  {#if setup}
    <div id="sync-setup-choices" hidden={snapshot.step !== 'choices'} class="gb:sync-dialog:grid gb:sync-dialog:gap-2.5 gb:sync-dialog:mt-5">
      <button type="button" class={`${SYNC_DIALOG_PRIMARY} gb:sync-dialog:text-left gb:sync-dialog:px-4 gb:sync-dialog:py-3`} data-sync-setup-action="setup-new"><span class="gb:sync-dialog:block">New setup</span><span class="gb:sync-dialog:block gb:sync-dialog:font-normal gb:sync-dialog:mt-0.5 gb:sync-dialog:text-[12px]">First time syncing — generate a new mnemonic</span></button>
      <button type="button" class={`${SYNC_DIALOG_SECONDARY} gb:sync-dialog:text-left gb:sync-dialog:px-4 gb:sync-dialog:py-3`} data-sync-setup-action="setup-restore"><span class="gb:sync-dialog:block">Join existing</span><span class="gb:sync-dialog:block gb:sync-dialog:font-normal gb:sync-dialog:mt-0.5 gb:sync-dialog:text-[12px]">I have a mnemonic from another device</span></button>
    </div>
    <div id="sync-setup-new" hidden={snapshot.step !== 'new'}>
      {#if generatedPhrase}
        <div class="gb:sync-dialog:mb-3"><div class="gb:sync-dialog:text-[12px] gb:sync-dialog:font-semibold gb:sync-dialog:text-secondary gb:sync-dialog:mb-1.5">Your mnemonic</div>
          <div class="gb:sync-dialog:font-mono gb:sync-dialog:text-[11.5px] gb:sync-dialog:bg-secondary-surface gb:sync-dialog:p-3 gb:sync-dialog:rounded-[8px] gb:sync-dialog:border gb:sync-dialog:border-line gb:sync-dialog:break-words gb:sync-dialog:leading-[1.6] gb:sync-dialog:select-all">{generatedPhrase}</div>
        </div>
        <p class={SYNC_DIALOG_HELP}>Write these 24 words down and store them offline. You will need them to sync another device. Anyone with this mnemonic can access your synced data.</p>
        <label class="gb:sync-dialog:flex gb:sync-dialog:items-center gb:sync-dialog:gap-2 gb:sync-dialog:min-h-11 gb:sync-dialog:cursor-pointer gb:sync-dialog:text-[12px] gb:sync-dialog:mb-3">
          <input bind:this={acknowledgement} type="checkbox" id="sync-setup-ack" data-sync-setup-action="setup-ack" class="gb:sync-dialog:size-4 gb:sync-dialog:accent-accent gb:sync-dialog:shrink-0 gb:sync-dialog:focus-visible:outline-2 gb:sync-dialog:focus-visible:outline-offset-2 gb:sync-dialog:focus-visible:outline-accent">I have saved my mnemonic somewhere safe
        </label>
        <button type="button" id="sync-setup-done-btn" class={`${SYNC_DIALOG_PRIMARY} gb:sync-dialog:w-full`} disabled={!savedPhrase} data-sync-setup-action="setup-done">Done</button>
      {:else}<p role="status" class={`${SYNC_DIALOG_HELP} ${toneClass} gb:sync-dialog:py-4`}>{snapshot.message || 'Generating identity...'}</p>
        {#if !snapshot.pending}<button type="button" class={SYNC_DIALOG_SECONDARY} data-sync-setup-action="setup-new">Try again</button>{/if}
      {/if}
    </div>
  {/if}
  <div id={setup ? 'sync-setup-restore' : 'sync-restore-form'} hidden={setup && snapshot.step !== 'join'} aria-busy={snapshot.pending}>
    <textarea bind:this={phraseInput} id={inputId} aria-label="24-word mnemonic" aria-describedby={messageId} data-sync-setup-action={setup ? 'setup-restore-input' : undefined} data-sync-action={setup ? undefined : 'restore-dialog-input'} autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" class={SYNC_DIALOG_INPUT} placeholder="Paste your 24-word mnemonic here..." disabled={snapshot.pending}></textarea>
    <div id={messageId} role="status" aria-live="polite" class={`${toneClass} gb:sync-dialog:text-[11px] gb:sync-dialog:mt-1.5 gb:sync-dialog:mb-2.5 gb:sync-dialog:min-h-[14px]`}>{snapshot.message || validation}</div>
    <div class="sync-setup-restore-actions gb:sync-dialog:grid gb:sync-dialog:grid-cols-[minmax(0,1fr)_auto_auto] gb:sync-dialog:gap-2 gb:sync-dialog:max-[480px]:grid-cols-2">
      <button type="button" id={setup ? 'sync-setup-restore-go' : 'sync-restore-dialog-go'} class={`${SYNC_DIALOG_PRIMARY} gb:sync-dialog:max-[480px]:col-span-full gb:sync-dialog:min-w-0`} data-sync-setup-action={setup ? 'setup-do-restore' : undefined} data-sync-action={setup ? undefined : 'confirm-restore'} disabled={snapshot.pending || wordCount !== 24}>{snapshot.reloading ? 'Reloading…' : snapshot.pending ? setup ? 'Joining…' : 'Restoring…' : setup ? 'Join & reload' : 'Restore & reload'}</button>
      {#if setup}<button type="button" id="sync-setup-restore-back" class={SYNC_DIALOG_SECONDARY} data-sync-setup-action="setup-back" disabled={snapshot.pending}>Back</button>{/if}
      {#if !setup || snapshot.step === 'join'}<button type="button" id={setup ? 'sync-setup-cancel' : undefined} class={`${SYNC_DIALOG_SECONDARY} sync-setup-restore-cancel`} data-sync-setup-action={setup ? 'setup-cancel' : undefined} data-sync-action={setup ? undefined : 'close-restore-dialog'} disabled={snapshot.pending}>Cancel</button>{/if}
    </div>
  </div>
  {#if setup}
    <div class="sync-setup-choice-footer gb:sync-dialog:mt-4 gb:sync-dialog:text-right" hidden={snapshot.step === 'join'}>
      {#if snapshot.step !== 'join'}<button type="button" id="sync-setup-cancel" class={SYNC_DIALOG_SECONDARY} data-sync-setup-action="setup-cancel">Cancel</button>{/if}
    </div>
  {/if}
</div>
