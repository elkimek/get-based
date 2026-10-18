<script lang="ts">
  import { flushSync, onDestroy } from 'svelte';
  import { initialWalletSeedState } from '../wallet-seed-contract.js';
  import type { WalletSeedActions, WalletSeedState } from '../wallet-seed-contract.js';
  import { WALLET_SEED_DISPLAY, WALLET_COPY, WALLET_INPUT, WALLET_PRIMARY, WALLET_SECONDARY, WALLET_ACTIONS, WALLET_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { actions }: { actions: WalletSeedActions } = $props();
  let seedState = $state(initialWalletSeedState());
  // Recovery words and form drafts are private component ports, never snapshots.
  let words = $state(''); let restore = $state(''); let revealed = $state(false);
  let acknowledged = $state(false); let copied = $state(false);
  let restoreInput: HTMLTextAreaElement | null = $state(null);
  let acknowledgement: HTMLInputElement | null = $state(null);
  let wordControl: HTMLButtonElement | null = $state(null);
  export function getState(): WalletSeedState { return seedState; }
  export function setState(next: WalletSeedState): void { seedState = next; }
  export function setMnemonic(next: string): void { words = next; revealed = false; copied = false; acknowledged = false; }
  export function readMnemonic(): string { return words; }
  export function readRestore(): string { return restoreInput?.value ?? restore; }
  export function clearRestore(): void { restore = ''; if (restoreInput) restoreInput.value = ''; }
  export function isAcknowledged(): boolean { return acknowledgement?.checked ?? acknowledged; }
  export function setCopied(): void { copied = true; }
  export function clearPrivateFields(): void { if (wordControl) wordControl.textContent = ''; if (acknowledgement) acknowledgement.checked = false; words = ''; revealed = false; acknowledged = false; copied = false; clearRestore(); }
  function toggleReveal(event: MouseEvent): void {
    // Drag-selecting revealed words must not remask them on mouse release.
    const selection = document.getSelection();
    if (revealed && event.detail > 0 && wordControl && selection && !selection.isCollapsed && selection.containsNode(wordControl, true)) return;
    flushSync(() => { revealed = !revealed; });
  }
  onDestroy(clearPrivateFields);
</script>
<section data-wallet-seed-view data-cloud-provider-settings-view aria-label="Cashu wallet seed" class="gb:cloud-provider:text-[11px] gb:cloud-provider:leading-[1.5] gb:cloud-provider:mt-2 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0 gb:cloud-provider:text-ink" aria-busy={seedState.pending}>
  <h3 class="gb:cloud-provider:text-xs gb:cloud-provider:font-semibold gb:cloud-provider:[font-family:inherit] gb:cloud-provider:m-0">{seedState.mode === 'missing' ? "Set up this device's Cashu wallet" : seedState.mode === 'onboarding' ? 'Your wallet seed phrase' : 'Wallet Seed Phrase'}</h3>
  <p class={WALLET_COPY}>Your 24-word Data Sync mnemonic restores the Routstr node session, but does not copy spendable Cashu proofs or this separate 12-word recovery seed.</p>
  {#if seedState.mode === 'onboarding'}<p class={WALLET_NOTICE}>This 12-word phrase is the <strong>only way to recover your wallet</strong>. Write it down and store it somewhere safe.</p>{/if}
  {#if words && (seedState.mode === 'onboarding' || seedState.mode === 'manage')}
    <button type="button" id={seedState.mode === 'onboarding' ? 'routstr-seed-phrase' : 'wallet-seed-display'} class={WALLET_SEED_DISPLAY} aria-label={revealed ? 'Hide wallet seed phrase' : 'Reveal wallet seed phrase'} aria-pressed={revealed} bind:this={wordControl} onclick={toggleReveal}>{revealed ? words : '•••• •••• •••• •••• •••• •••• •••• •••• •••• •••• •••• ••••'}</button>
    <p class={WALLET_COPY}>{revealed ? 'Select the words to copy them manually, or use Copy Seed.' : 'Activate the masked words to reveal your seed phrase.'}</p>
    <div class={WALLET_ACTIONS}>
      <button type="button" class={WALLET_SECONDARY} disabled={seedState.pending} onclick={() => actions.copy()}>{copied ? '✓ Copied (60s)' : 'Copy Seed'}</button>
      {#if seedState.mode === 'onboarding'}
        <label class={WALLET_COPY + ' gb:cloud-provider:flex gb:cloud-provider:items-center gb:cloud-provider:gap-1 gb:cloud-provider:[@media(pointer:coarse)]:min-h-11'}><input type="checkbox" id="routstr-seed-ack" bind:this={acknowledgement} checked={acknowledged} disabled={seedState.pending} onchange={event => flushSync(() => { acknowledged = event.currentTarget.checked; })}> I have saved my seed phrase</label>
      {/if}
    </div>
  {/if}
  {#if seedState.mode === 'onboarding'}
    <button type="button" id="routstr-seed-continue" class={WALLET_PRIMARY} disabled={!acknowledged || seedState.pending} data-routstr-wallet-action="seed-ack-continue" onclick={event => { event.stopPropagation(); actions.continue(); }}>Continue</button>
  {:else if seedState.mode !== 'loading'}
    {#if seedState.mode === 'missing'}<button type="button" class={WALLET_PRIMARY} disabled={seedState.pending} data-routstr-wallet-action="setup-wallet-seed" onclick={event => { event.stopPropagation(); actions.create(); }}>Create a new 12-word seed for this device</button>{/if}
    <div class="gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:pt-3 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0">
      <label for="routstr-restore-seed" class={WALLET_COPY}>Restore from your 12-word wallet seed</label>
      <textarea id="routstr-restore-seed" class={WALLET_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:resize-y'} rows="3" placeholder="Enter 12-word seed phrase…" autocomplete="off" autocapitalize="none" spellcheck="false" bind:value={restore} bind:this={restoreInput} disabled={seedState.pending} aria-describedby="routstr-restore-hint"></textarea>
      <p id="routstr-restore-hint" class={WALLET_COPY}>Restores proofs from the selected mint. Existing balances and recovery records must be preserved before using a different seed.</p>
      <button type="button" class={WALLET_PRIMARY} disabled={seedState.pending} data-routstr-wallet-action="wallet-restore" onclick={event => { event.stopPropagation(); actions.restore(); }}>Restore</button>
    </div>
  {/if}
  <div id="routstr-restore-status" aria-live="polite" role="status" class={WALLET_COPY + ' gb:cloud-provider:whitespace-pre-line gb:cloud-provider:break-words gb:cloud-provider:min-w-0 ' + PROVIDER_TONES[seedState.status.tone]}>{seedState.status.text}</div>
</section>
