<script lang="ts">
  import { untrack } from 'svelte';
  import type { EncryptionSettingsSnapshot } from '../settings-protection-contract.js';
  import { PROTECTION_PRIMARY, PROTECTION_SECONDARY, PROTECTION_ACTIONS } from '../settings-protection-classes.js';
  let { initial }: { initial: EncryptionSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  export function refresh(next: EncryptionSettingsSnapshot): void { snapshot = next; }
</script>
<div data-protection-view="encryption">
  <div class="encryption-status-card gb:protection:flex gb:protection:items-start gb:protection:gap-3 gb:protection:px-4 gb:protection:py-3.5 gb:protection:rounded-control gb:protection:border gb:protection:border-line gb:protection:border-l-[3px] {snapshot.enabled ? 'encryption-status-on gb:protection:border-l-success' : 'encryption-status-off gb:protection:border-l-warning'}">
    <div class="encryption-status-icon gb:protection:text-[24px] gb:protection:shrink-0 gb:protection:leading-none" aria-hidden="true">{snapshot.enabled ? '🔒' : '🔓'}</div>
    <div class="encryption-status-body gb:protection:flex-1 gb:protection:min-w-0">
      <div class="encryption-status-title gb:protection:text-[14px] gb:protection:font-semibold gb:protection:text-ink">Encryption is {snapshot.enabled ? 'ON' : 'OFF'}</div>
      <div class="encryption-status-detail gb:protection:text-[12px] gb:protection:text-secondary gb:protection:mt-1 gb:protection:leading-[1.5]">
        {#if snapshot.enabled}Your medical data, chat history, wearable history, and API keys are encrypted with AES-256-GCM. Display preferences remain unencrypted.
        {:else}Profile and health data is stored as plaintext. Saved provider credentials remain encrypted with a device-local key.{/if}
      </div>
    </div>
  </div>
  {#if snapshot.enabled}
    <div class="{PROTECTION_ACTIONS} gb:protection:mt-3">
      <button type="button" class={PROTECTION_SECONDARY} data-crypto-action="change-passphrase">Change Passphrase</button>
      <button type="button" class={PROTECTION_SECONDARY} data-crypto-action="disable-encryption">Disable Encryption</button>
    </div>
  {:else}
    <button type="button" class="{PROTECTION_PRIMARY} gb:protection:mt-3" data-crypto-action="enable-encryption">Enable Encryption</button>
  {/if}
</div>
