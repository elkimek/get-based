<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import { onDestroy, untrack } from 'svelte';
  import RoutstrActions from './RoutstrActions.svelte';
  import ProviderStatus from './ProviderStatus.svelte';
  import type { RoutstrSettingsState, RoutstrSettingsActions, RoutstrRecoveryKind, RoutstrConnectionState, RoutstrSettingsAccount } from '../routstr-settings-contract.js';
  import { WALLET_CARD, WALLET_COPY, WALLET_TOKEN_INPUT, WALLET_NOTICE, WALLET_RAIL, WALLET_PRIMARY, WALLET_SECONDARY, WALLET_REFRESH, PROVIDER_PANEL, PROVIDER_COPY, PROVIDER_NOTICE, PROVIDER_ACTIONS, PROVIDER_PRIMARY, PROVIDER_SECONDARY, PROVIDER_INPUT, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { initial, actions }: { initial: RoutstrSettingsState; actions: RoutstrSettingsActions } = $props();
  let shellState = $state(untrack(() => initial));
  let tokens = $state<Record<RoutstrRecoveryKind, string>>({ deposit: '', withdraw: '' });
  let fields: Partial<Record<RoutstrRecoveryKind, HTMLTextAreaElement>> = {};
  let credential = $state('');
  let credentialField: HTMLInputElement | null = $state(null);
  let receiptField: HTMLTextAreaElement | null = $state(null);
  let receipt: RoutstrSettingsAccount | null = $state(null);
  let connectionOpen = $state(false);
  let connection = $state<RoutstrConnectionState>({ pending: false, receipt: false, copied: false, text: '', tone: 'secondary' });
  export function readCredential(): string { return credentialField?.value ?? credential; }
  export function setCredential(value: string): void { credential = value; if (credentialField) credentialField.value = value; }
  export function getConnection(): RoutstrConnectionState { return connection; }
  export function setConnection(next: RoutstrConnectionState): void { connection = next; }
  export function readReceipt(): RoutstrSettingsAccount | null { return receipt ? { ...receipt } : null; }
  export function hideReceipt(): void { if (receipt) connectionOpen = false; if (receiptField) receiptField.value = ''; receipt = null; connection = { ...connection, receipt: false, copied: false }; }
  export function showReceipt(account: RoutstrSettingsAccount): void { hideReceipt(); receipt = { ...account }; connectionOpen = true; connection = { ...connection, receipt: true }; }
  export function getState(): RoutstrSettingsState { return shellState; }
  export function setState(next: RoutstrSettingsState): void { shellState = next; }
  export function showRecovery(kind: RoutstrRecoveryKind, token: string): void { tokens[kind] = token; if (fields[kind]) fields[kind]!.value = token; shellState = { ...shellState, recoveries: { ...shellState.recoveries, [kind]: { ...shellState.recoveries[kind], visible: !!token } } }; }
  export function readRecovery(kind: RoutstrRecoveryKind): string { return fields[kind]?.value ?? tokens[kind]; }
  export function clearPrivateFields(): void { setCredential(''); hideReceipt(); tokens = { deposit: '', withdraw: '' }; for (const field of Object.values(fields)) if (field) field.value = ''; }
  export function closeMenu(): void { shellState = { ...shellState, menuOpen: false }; }
  onDestroy(clearPrivateFields);
</script>
<form data-routstr-settings-view data-cloud-provider-settings-view class={PROVIDER_PANEL} onsubmit={event => event.preventDefault()}>
  <input type="text" name="ai-provider" value="routstr" autocomplete="username" hidden>
  <p class={WALLET_COPY + ' gb:cloud-provider:m-0'}>Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.</p>
  <section aria-label="Cashu wallet" class={WALLET_CARD}>
    <h3 class="gb:cloud-provider:text-[10px] gb:cloud-provider:font-normal gb:cloud-provider:[font-family:inherit] gb:cloud-provider:uppercase gb:cloud-provider:tracking-[0.5px] gb:cloud-provider:opacity-70 gb:cloud-provider:mb-1.5 gb:cloud-provider:mt-0">⚡ Wallet</h3>
    <p class="gb:cloud-provider:text-[10px] gb:cloud-provider:text-secondary gb:cloud-provider:leading-[1.5] gb:cloud-provider:-mt-0.5 gb:cloud-provider:mb-[3px]">The funded Routstr node session syncs with your 24-word Data Sync mnemonic. Cashu proofs and their separate 12-word recovery seed stay on this device.</p>
    <ProviderStatus id="routstr-wallet-device-status" status={shellState.seed} compact />
    <div class={WALLET_RAIL + ' gb:cloud-provider:justify-between'}>
      <div class={WALLET_RAIL}><ProviderStatus id="routstr-wallet-balance" status={{ text: shellState.walletBalance, tone: 'primary' }} emphasis /><button type="button" class={WALLET_REFRESH} title="Verify proofs against mint" aria-label="Verify wallet proofs against mint" data-provider-panel-action="refresh-cashu-wallet-balance" onclick={event => { event.stopPropagation(); actions.refreshWallet(); }}>↻</button></div>
      <div id="routstr-wallet-actions">
        <RoutstrActions state={{ kind: 'wallet', node: shellState.node, connected: shellState.connected, active: shellState.walletAction }} {actions} bind:menuOpen={shellState.menuOpen} />
      </div>
    </div>
    <div class={WALLET_RAIL + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:mt-1.5 gb:cloud-provider:pt-1.5'}>
      <div class={WALLET_COPY + ' gb:cloud-provider:min-w-0 gb:cloud-provider:break-all'}>Mint: <ProviderStatus id="routstr-mint-label" status={{ text: shellState.mint, tone: 'secondary' }} monospace announce={false} /></div>
      <button type="button" class={WALLET_SECONDARY} data-provider-panel-action="show-routstr-mint-edit" onclick={event => { event.stopPropagation(); actions.mints(); }}>Mints & balances</button>
    </div>
    <div id="routstr-mint-edit" style={componentStaticStyles.hidden}></div>
    <div id="routstr-wallet-fund-area" style={componentStaticStyles.hidden}></div>
    {#each ['deposit', 'withdraw'] as rawKind (rawKind)}
      {@const kind = rawKind as RoutstrRecoveryKind}
      {#if shellState.recoveries[kind].visible}
        <section class={WALLET_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2'} aria-label={'Pending ' + kind + ' recovery'} aria-busy={shellState.recoveries[kind].pending}>
          <h4 class="gb:cloud-provider:text-[11px] gb:cloud-provider:[font-family:inherit] gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink">⚠ Pending {kind} recovery</h4>
          <p class={WALLET_COPY + ' gb:cloud-provider:m-0'}>{kind === 'deposit' ? 'A previous node deposit has an unconfirmed outcome. This token may be unspent. Reconcile the node account before reclaiming it:' : 'An outgoing transfer needs reconciliation. Check its payment status or contact its recipient before reclaiming this token:'}</p>
          <textarea class={WALLET_TOKEN_INPUT} aria-label={'Pending ' + kind + ' recovery token'} readonly rows="3" value={tokens[kind]} bind:this={fields[kind]} onfocus={event => event.currentTarget.select()}></textarea>
          <div class={WALLET_RAIL}><button type="button" class={WALLET_PRIMARY} disabled={shellState.recoveries[kind].pending} onclick={event => { event.stopPropagation(); actions.reclaimRecovery(kind); }}>Recover to Wallet</button><button type="button" class={WALLET_SECONDARY} onclick={event => { event.stopPropagation(); actions.copyRecovery(kind); }}>{shellState.recoveries[kind].copied ? '✓ Copied (clears in 60s)' : 'Copy Token'}</button></div>
          <div class={WALLET_COPY + ' ' + PROVIDER_TONES[shellState.recoveries[kind].status.tone]} role="status" aria-live="polite">{shellState.recoveries[kind].status.text}</div>
        </section>
      {/if}
    {/each}
  </section>
  <section aria-label="Routstr node" class={WALLET_CARD}>
    <h3 class="gb:cloud-provider:text-[10px] gb:cloud-provider:font-normal gb:cloud-provider:[font-family:inherit] gb:cloud-provider:uppercase gb:cloud-provider:tracking-[0.5px] gb:cloud-provider:opacity-70 gb:cloud-provider:mb-1.5 gb:cloud-provider:mt-0">🔗 Node</h3>
    <div class={WALLET_RAIL + ' gb:cloud-provider:justify-between'}>
      <span id="routstr-node-label" class={(shellState.connected ? PROVIDER_TONES.success : 'gb:cloud-provider:text-ink') + ' gb:cloud-provider:break-all'}>{shellState.connected ? '✓ ' : ''}{shellState.nodeLabel}</span>
      <div id="routstr-node-actions">
        <RoutstrActions state={{ kind: 'node', node: shellState.node, connected: shellState.connected, active: shellState.nodeAction }} {actions} />
      </div>
    </div>
    {#if shellState.connected}<div class={WALLET_RAIL + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:mt-1.5 gb:cloud-provider:pt-1.5'}>Session: <ProviderStatus id="routstr-node-balance" status={shellState.nodeBalance} /><button type="button" class={WALLET_REFRESH} aria-label="Refresh node balance" data-provider-panel-action="refresh-routstr-balance" onclick={event => { event.stopPropagation(); actions.refreshNode(); }}>↻</button></div>{/if}
    {#if shellState.refundNode}<div class={WALLET_NOTICE + ' gb:cloud-provider:break-all'}>Saved refund for this node: {shellState.refundNode}<div class={WALLET_RAIL + ' gb:cloud-provider:mt-2'}><button type="button" class={WALLET_SECONDARY} data-routstr-wallet-action="saved-node-refunds" data-node-url={shellState.refundNode} onclick={event => { event.stopPropagation(); actions.refunds(shellState.refundNode); }}>Check refund recovery</button></div></div>{/if}
    <div id="routstr-node-picker" style={componentStaticStyles.hidden}></div>
    {#if actions.account}
      <details class={PROVIDER_NOTICE} bind:open={connectionOpen}>
        <summary class="gb:cloud-provider:cursor-pointer gb:cloud-provider:[@media(pointer:coarse)]:min-h-11 gb:cloud-provider:flex gb:cloud-provider:items-center gb:cloud-provider:text-ink gb:cloud-provider:font-semibold">Connect a session key or Cashu token</summary>
        {#if connection.receipt && receipt}
          <section aria-label="Routstr session key backup" class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2">
            <h4 class="gb:cloud-provider:text-[11px] gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink">⚠ Save your session key</h4>
            <p class={PROVIDER_COPY}>Your Cashu token has been redeemed. This session key is the <strong>only way to access your balance</strong>. It is saved on this device. Keep your own backup as well.</p>
            <label for="routstr-session-key-receipt">Session key</label>
            <textarea id="routstr-session-key-receipt" bind:this={receiptField} value={receipt.key} readonly rows="3" class={PROVIDER_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:text-xs gb:cloud-provider:resize-y'} onfocus={event => event.currentTarget.select()}></textarea>
            <div class={PROVIDER_ACTIONS}>
              <button type="button" class={PROVIDER_PRIMARY} onclick={event => { event.stopPropagation(); actions.account?.copy(); }}>{connection.copied ? '✓ Copied (clears in 60s)' : 'Copy Key'}</button>
              <button type="button" class={PROVIDER_SECONDARY} data-provider-panel-action="acknowledge-routstr-key" onclick={event => { event.stopPropagation(); actions.account?.acknowledge(); }}>I’ve saved it</button>
            </div>
          </section>
        {:else}
          <div class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2">
            <label for="routstr-key-input">Session key or Cashu token</label>
            <input id="routstr-key-input" bind:this={credentialField} type="password" autocomplete="off" spellcheck="false" value={credential} disabled={connection.pending} class={PROVIDER_INPUT} oninput={event => { credential = event.currentTarget.value; }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); actions.account?.save(); } }}>
            <p class={PROVIDER_COPY}>The key or token connects to the node selected above. A token tops up its existing session when connected.</p>
            <div class={PROVIDER_ACTIONS}>
              <button id="save-routstr-key-btn" type="button" disabled={connection.pending || !shellState.node} class={PROVIDER_PRIMARY} onclick={event => { event.stopPropagation(); actions.account?.save(); }}>{connection.pending ? 'Connecting…' : 'Save & Validate'}</button>
              {#if shellState.connected}<button type="button" disabled={connection.pending} class={PROVIDER_SECONDARY} onclick={event => { event.stopPropagation(); actions.account?.remove(); }}>Remove session key</button>{/if}
            </div>
          </div>
        {/if}
        <div id="routstr-key-status" class={PROVIDER_COPY + ' ' + PROVIDER_TONES[connection.tone]} role="status" aria-live="polite" aria-busy={connection.pending}>{connection.text}</div>
      </details>
    {/if}
  </section>
  <div data-routstr-model-settings-host></div>
</form>
