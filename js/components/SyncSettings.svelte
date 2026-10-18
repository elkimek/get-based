<script lang="ts">
  import { untrack } from 'svelte';
  import type { SyncSettingsSnapshot } from '../settings-sync-contract.js';
  import { SYNC_PRIMARY, SYNC_SECONDARY, SYNC_DANGER, SYNC_DISCONNECT, SYNC_ACTIONS, SYNC_HELP, SYNC_INPUT, SYNC_TOMBSTONE_RESTORE, SYNC_IDENTITY_COPY, SYNC_MNEMONIC_BUTTON, SYNC_RELAY_SAVE, SYNC_DIAGNOSE, SYNC_MANAGEMENT_DISCONNECT } from '../settings-sync-classes.js';
  let { initial }: { initial: SyncSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let relayValue = $state(untrack(() => initial.relay));
  let connected: boolean | null = $state(null);
  let identityCode: string | null = $state(null);
  let identityUnavailable = $state(false);
  let mnemonicReady = $state(false);
  let mnemonicMessage = $state('Loading...');
  let mnemonicWarning = $state(false);
  let revealedMnemonic = $state('');
  const mask = '•••• •••• •••• •••• •••• •••• •••• •••• •••• •••• •••• ••••';
  export function clearSecrets(): void { revealedMnemonic = ''; }
  export function refresh(next: SyncSettingsSnapshot): void {
    if (next.relay !== snapshot.relay) relayValue = next.relay;
    snapshot = next; clearSecrets();
    connected = null; identityCode = null; identityUnavailable = false;
    mnemonicReady = false; mnemonicMessage = 'Loading...'; mnemonicWarning = false;
  }
  export function setRelay(value: boolean | null): void { connected = value; }
  export function setIdentity(value: string | null, unavailable = false): void { identityCode = value; identityUnavailable = unavailable; }
  export function setMnemonicStatus(ready: boolean, message = '', warning = false): void {
    mnemonicReady = ready; mnemonicMessage = message; mnemonicWarning = warning; clearSecrets();
  }
  export function toggleMnemonic(value: string): void { revealedMnemonic = revealedMnemonic ? '' : value; }
</script>
<div data-sync-settings-view>
  {#if snapshot.blocker}
    <div role="status" class="gb:sync:mb-4 gb:sync:px-3 gb:sync:py-2.5 gb:sync:border gb:sync:border-warning gb:sync:bg-[color-mix(in_srgb,var(--yellow)_8%,transparent)] gb:sync:rounded-[6px] gb:sync:text-warning-ink gb:sync:text-[12px] gb:sync:leading-[1.45]">
      <strong>Sync unavailable in this browser.</strong><br>{snapshot.blocker}
    </div>
  {/if}
  {#if snapshot.deletions.length}
    <div class="sync-tombstone-banner gb:sync:mb-4 gb:sync:py-3 gb:sync:px-3.5 gb:sync:border gb:sync:border-warning gb:sync:bg-[color-mix(in_srgb,var(--yellow)_8%,transparent)] gb:sync:rounded-[6px] gb:sync:text-[12px]">
      <div class="gb:sync:mb-2 gb:sync:leading-[1.45]">
        <strong class="gb:sync:text-warning-ink">{snapshot.deletions.length} profile{snapshot.deletions.length === 1 ? '' : 's'} flagged for deletion on another device</strong>
        <span class={`${SYNC_HELP} gb:sync:block gb:sync:mt-0.5`}>Confirm each — Apply wipes locally, Restore re-publishes.</span>
      </div>
      {#each snapshot.deletions as row (row.id)}
        <div class="sync-tombstone-row gb:sync:flex gb:sync:flex-wrap gb:sync:items-center gb:sync:gap-2 gb:sync:py-1.5 gb:sync:border-t gb:sync:border-[color-mix(in_srgb,var(--yellow)_18%,transparent)]" data-tomb-id={row.id}>
          <span class="gb:sync:flex-1 gb:sync:min-w-0 gb:sync:max-[480px]:w-full gb:sync:max-[480px]:flex-none gb:sync:break-words gb:sync:font-medium gb:sync:text-ink">{row.name}</span>
          <span class="gb:sync:text-[11px] gb:sync:text-secondary">{row.dateLabel}</span>
          <button type="button" class={SYNC_DANGER} data-sync-action="apply-tombstone" data-tomb-id={row.id}>Apply delete</button>
          <button type="button" class={SYNC_TOMBSTONE_RESTORE} data-sync-action="reject-tombstone" data-tomb-id={row.id}>Restore</button>
        </div>
      {/each}
    </div>
  {/if}
  <div class="sync-settings-head gb:sync:flex gb:sync:items-center gb:sync:justify-between gb:sync:gap-3.5 gb:sync:mb-3">
    <div class="gb:sync:min-w-0">
      <div class="gb:sync:text-[13px] gb:sync:font-semibold gb:sync:text-ink">Cross-device sync</div>
      <div class="gb:sync:text-[12px] gb:sync:text-secondary gb:sync:mt-0.5">E2E encrypted via Evolu CRDT</div>
    </div>
    <div class="sync-settings-state gb:sync:flex gb:sync:items-center gb:sync:gap-[9px] gb:sync:shrink-0">
      <span class="sync-settings-badge gb:sync:px-[7px] gb:sync:py-0.5 gb:sync:border gb:sync:rounded-full gb:sync:text-[10px] gb:sync:font-bold gb:sync:tracking-[0.04em] gb:sync:uppercase {snapshot.enabled ? 'gb:sync:text-success-ink gb:sync:border-[color-mix(in_srgb,var(--green)_45%,var(--border))] gb:sync:bg-[color-mix(in_srgb,var(--green)_10%,transparent)]' : snapshot.paused ? 'gb:sync:text-warning-ink gb:sync:border-[color-mix(in_srgb,var(--yellow)_45%,var(--border))] gb:sync:bg-[color-mix(in_srgb,var(--yellow)_10%,transparent)]' : 'gb:sync:text-secondary gb:sync:border-line'}" class:is-enabled={snapshot.enabled} class:is-paused={snapshot.paused}>{snapshot.enabled ? 'Enabled' : snapshot.paused ? 'Paused' : 'Off'}</span>
      <label class="sync-settings-toggle gb:sync:relative gb:sync:inline-flex gb:sync:items-center gb:sync:justify-center gb:sync:min-w-8 gb:sync:min-h-7 gb:sync:[@media(pointer:coarse)]:min-w-11 gb:sync:[@media(pointer:coarse)]:min-h-11 gb:sync:cursor-pointer">
        <input type="checkbox" aria-label="Toggle cross-device sync" checked={snapshot.enabled} data-sync-action="toggle-sync" disabled={!!snapshot.blocker && !snapshot.enabled} class="gb:peer gb:sync:sr-only">
        <span aria-hidden="true" class="sync-settings-toggle-slider gb:sync:relative gb:sync:block gb:sync:w-8 gb:sync:h-[18px] gb:sync:rounded-full gb:sync:bg-line gb:sync:transition-colors gb:sync:motion-reduce:transition-none gb:sync:peer-checked:bg-accent gb:sync:peer-disabled:opacity-45 gb:sync:peer-disabled:cursor-not-allowed gb:sync:peer-focus-visible:outline-2 gb:sync:peer-focus-visible:outline-offset-2 gb:sync:peer-focus-visible:outline-accent gb:sync:before:content-[''] gb:sync:before:absolute gb:sync:before:top-0.5 gb:sync:before:left-0.5 gb:sync:before:size-3.5 gb:sync:before:rounded-full gb:sync:before:bg-[var(--bg-primary)] gb:sync:before:transition-transform gb:sync:peer-checked:before:translate-x-3.5"></span>
      </label>
    </div>
  </div>
  {#if snapshot.enabled}
    <div id="sync-relay-status" role="status" class="gb:sync:flex gb:sync:items-center gb:sync:gap-1.5 gb:sync:mb-4">
      <span id="sync-status-dot" aria-hidden="true" class="gb:sync:size-2 gb:sync:rounded-full gb:sync:inline-block {connected === true ? 'gb:sync:bg-success' : connected === false ? 'gb:sync:bg-danger' : 'gb:sync:bg-muted'}"></span>
      <span id="sync-status-text" class="gb:sync:text-[12px] gb:sync:text-secondary">{connected === null ? 'Checking relay...' : connected ? 'Connected to relay' : 'Relay unreachable'}</span>
    </div>
    <div class="sync-identity-card gb:sync:mb-4 gb:sync:p-3 gb:sync:bg-accent-fill gb:sync:border gb:sync:border-[var(--ref-border)] gb:sync:rounded-[10px]" aria-labelledby="sync-identity-label">
      <div class="gb:sync:flex gb:sync:items-center gb:sync:justify-between gb:sync:gap-3">
        <div class="gb:sync:min-w-0">
          <div id="sync-identity-label" class="gb:sync:mb-[3px] gb:sync:text-secondary gb:sync:text-[10px] gb:sync:font-bold gb:sync:tracking-[0.09em] gb:sync:uppercase">Sync identity</div>
          <div id="sync-identity-code" aria-live="polite" class="gb:sync:text-ink gb:sync:font-mono gb:sync:text-[17px] gb:sync:font-bold gb:sync:tracking-[0.08em] gb:sync:leading-[1.25] gb:sync:max-[375px]:text-[15px] gb:sync:max-[375px]:tracking-[0.05em] gb:sync:break-words">{identityCode || (identityUnavailable ? 'Unavailable' : 'Resolving…')}</div>
        </div>
        <button type="button" id="sync-identity-copy" class={`${SYNC_IDENTITY_COPY} gb:sync:shrink-0 gb:sync:min-w-14`} data-sync-action="copy-identity-code" aria-label="Copy Sync identity code" disabled={!identityCode}>Copy</button>
      </div>
      <div class="gb:sync:mt-[9px] gb:sync:text-secondary gb:sync:text-[11.5px] gb:sync:leading-[1.45]">Compare this code on your devices. Matching codes mean the same 24-word Data Sync identity is active.</div>
      <div class="gb:sync:flex gb:sync:items-center gb:sync:gap-[5px] gb:sync:mt-1.5 gb:sync:text-success-ink gb:sync:text-[10.5px] gb:sync:font-semibold"><span aria-hidden="true">✓</span> Safe to compare — this code doesn’t grant access to your data</div>
    </div>
    <div class="gb:sync:mb-4">
      <div class="gb:sync:flex gb:sync:items-center gb:sync:justify-between gb:sync:mb-1.5">
        <span class="gb:sync:text-[12px] gb:sync:font-semibold gb:sync:text-secondary">Your mnemonic</span>
        <div class="gb:sync:flex gb:sync:gap-1.5">
          <button type="button" id="sync-mnemonic-toggle" class={`${SYNC_MNEMONIC_BUTTON}`} data-sync-action="toggle-mnemonic" aria-label={revealedMnemonic ? 'Hide mnemonic' : 'Show mnemonic'} aria-pressed={!!revealedMnemonic} disabled={!mnemonicReady}>{revealedMnemonic ? 'Hide' : 'Show'}</button>
          <button type="button" class={`${SYNC_MNEMONIC_BUTTON}`} data-sync-action="copy-mnemonic" aria-label="Copy mnemonic" disabled={!mnemonicReady}>Copy</button>
        </div>
      </div>
      <div id="sync-mnemonic" data-masked={!revealedMnemonic} class="gb:sync:font-mono gb:sync:text-[11.5px] gb:sync:bg-secondary-surface gb:sync:py-2.5 gb:sync:px-3 gb:sync:rounded-[8px] gb:sync:border gb:sync:border-line gb:sync:break-words gb:sync:leading-[1.6] gb:sync:min-h-5 {revealedMnemonic ? 'gb:sync:select-all' : 'gb:sync:select-none'} {mnemonicWarning ? 'gb:sync:text-warning-ink' : 'gb:sync:text-ink'}" aria-label="Mnemonic phrase" aria-live="polite">{revealedMnemonic || (mnemonicReady ? mask : mnemonicMessage)}</div>
      <div class={SYNC_HELP}>These words are your encryption key. Store them offline. Never share them.</div>
    </div>
    <div class={`sync-management-actions ${SYNC_ACTIONS}`}>
      <button type="button" class={SYNC_SECONDARY} data-sync-action="open-restore-dialog">Restore / switch identity…</button>
      <button type="button" class={SYNC_SECONDARY} data-sync-action="pause-sync">Pause on this device</button>
    </div>
    <div class={SYNC_HELP}>Pausing keeps this identity and queues local changes for the next resume. Restoring switches this device to another 24-word identity.</div>
    <button type="button" class={`${SYNC_DIAGNOSE} gb:sync:w-full gb:sync:mt-3 gb:sync:mb-2.5`} data-sync-action="show-sync-diagnose">Sync status &amp; storage</button>
    <details class="gb:sync:mb-2">
      <summary class="gb:sync:text-[12px] gb:sync:text-secondary gb:sync:cursor-pointer gb:sync:select-none gb:sync:[@media(pointer:coarse)]:min-h-11 gb:sync:[@media(pointer:coarse)]:py-3 gb:sync:focus-visible:outline-2 gb:sync:focus-visible:outline-accent">Relay &amp; device options</summary>
      <div class="gb:sync:mt-2">
        <label for="sync-relay-input" class="gb:sync:text-[12px] gb:sync:text-secondary gb:sync:block gb:sync:mb-1">Relay server</label>
        <div class="gb:sync:flex gb:sync:gap-2">
          <input type="text" id="sync-relay-input" class={SYNC_INPUT} placeholder="wss://..." bind:value={relayValue}>
          <button type="button" class={SYNC_RELAY_SAVE} data-sync-action="save-relay">Save</button>
        </div>
        <button type="button" class={`${SYNC_DISCONNECT} gb:sync:w-full gb:sync:mt-2`} data-sync-action="disconnect-sync">Disconnect &amp; reset sync on this device</button>
        <div class={SYNC_HELP}>Disconnecting forgets this device’s sync identity and local sync history. Your profile data and relay data are not deleted.</div>
      </div>
    </details>
  {:else if snapshot.paused}
    <div class="gb:sync:text-[12px] gb:sync:text-secondary gb:sync:leading-[1.5] gb:sync:mb-3">Sync is paused on this device. The identity and sync history are retained, and local edits will be uploaded before remote changes are applied when you resume.</div>
    <div class={`sync-setup-actions ${SYNC_ACTIONS}`}>
      <button type="button" class={SYNC_PRIMARY} data-sync-action="resume-sync" disabled={!!snapshot.blocker}>Resume sync</button>
      <button type="button" class={SYNC_MANAGEMENT_DISCONNECT} data-sync-action="disconnect-sync">Disconnect &amp; reset sync</button>
    </div>
    <div class={SYNC_HELP}>Disconnect only if you want this device to forget the current sync identity. Keep your 24-word mnemonic before disconnecting.</div>
  {:else}
    <div class="gb:sync:text-[12px] gb:sync:text-secondary gb:sync:leading-[1.5]">Sync profiles, lab data, and AI settings across your devices. Data is encrypted with a key derived from a 24-word mnemonic — the relay server only sees ciphertext.</div>
    <div class={`sync-setup-actions ${SYNC_ACTIONS}`}>
      <button type="button" class={SYNC_PRIMARY} data-sync-action="setup-new-direct" disabled={!!snapshot.blocker && !snapshot.configured}>Set up new sync</button>
      <button type="button" class={SYNC_SECONDARY} data-sync-action="setup-restore-direct" disabled={!!snapshot.blocker && !snapshot.configured}>Join existing device</button>
    </div>
    <div class={SYNC_HELP}>Choose <b>Join existing device</b> if another device already has sync enabled. You will need its 24-word mnemonic.</div>
  {/if}
</div>
