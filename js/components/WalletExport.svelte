<script lang="ts">
  import { onDestroy } from 'svelte';
  import { initialWalletExportState } from '../wallet-export-contract.js';
  import type { WalletExportActions, WalletExportState } from '../wallet-export-contract.js';
  import { PROVIDER_COPY, PROVIDER_INPUT, PROVIDER_SECONDARY, PROVIDER_ACTIONS, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { actions }: { actions: WalletExportActions } = $props();
  let exportState = $state(initialWalletExportState()); let token = $state(''); let text: HTMLTextAreaElement | null = $state(null);
  export function getState(): WalletExportState { return exportState; }
  export function setState(next: WalletExportState): void { exportState = next; }
  export function showToken(next: string): void { token = next; }
  export function readToken(): string { return token; }
  export function clearPrivateFields(): void { token = ''; if (text) text.value = ''; }
  onDestroy(clearPrivateFields);
</script>
<section data-wallet-export-view data-cloud-provider-settings-view aria-label="Export wallet token" class="gb:cloud-provider:mt-3 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0 gb:cloud-provider:text-ink" aria-busy={exportState.pending}>
  <h3 class="gb:cloud-provider:text-sm gb:cloud-provider:font-semibold gb:cloud-provider:m-0">Export Token</h3>
  <p class={PROVIDER_COPY}>Export a backup of spendable funds at the selected mint. Exporting does not remove funds from your wallet. Keep the token private; it can spend those same funds.</p>
  {#if exportState.mint}<p class={PROVIDER_COPY + ' gb:cloud-provider:break-all'}>Token mint: {exportState.mint.replace(/^https?:\/\//, '')}</p>{/if}
  {#if exportState.phase === 'ready' && token}
    <details class="gb:cloud-provider:min-w-0"><summary class={PROVIDER_SECONDARY + ' gb:cloud-provider:flex gb:cloud-provider:items-center'}>Token text</summary>
      <label for="routstr-export-token" class={PROVIDER_COPY}>Wallet backup token</label>
      <textarea id="routstr-export-token" class={PROVIDER_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:text-xs gb:cloud-provider:resize-y'} rows="4" readonly value={token} bind:this={text} onfocus={event => event.currentTarget.select()}></textarea>
    </details>
    <button type="button" class={PROVIDER_SECONDARY} disabled={exportState.pending} onclick={() => actions.copy()}>{exportState.copied ? '✓ Copied (60s)' : 'Copy Token'}</button>
  {/if}
  <div role="status" aria-live="polite" class={PROVIDER_COPY + ' gb:cloud-provider:break-words ' + PROVIDER_TONES[exportState.status.tone]}>{exportState.status.text}</div>
  <div class={PROVIDER_ACTIONS}>
    {#if exportState.phase === 'error' || exportState.phase === 'empty'}<button type="button" class={PROVIDER_SECONDARY} disabled={exportState.pending} onclick={() => actions.prepare()}>Refresh export</button>{/if}
    <button type="button" class={PROVIDER_SECONDARY} onclick={() => actions.close()}>Close export</button>
  </div>
</section>
