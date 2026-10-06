<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { ROUTSTR_WALLET_ACTIONS, ROUTSTR_WALLET_MENU, ROUTSTR_NODE_ACTIONS } from '../routstr-settings-contract.js';
  import type { RoutstrSettingsState, RoutstrSettingsActions, RoutstrRecoveryKind } from '../routstr-settings-contract.js';
  import { PROVIDER_PANEL, PROVIDER_COPY, PROVIDER_NOTICE, PROVIDER_ACTIONS, PROVIDER_PRIMARY, PROVIDER_SECONDARY, PROVIDER_INPUT, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { initial, actions }: { initial: RoutstrSettingsState; actions: RoutstrSettingsActions } = $props();
  let shellState = $state(untrack(() => initial));
  let tokens = $state<Record<RoutstrRecoveryKind, string>>({ deposit: '', withdraw: '' });
  let fields: Partial<Record<RoutstrRecoveryKind, HTMLTextAreaElement>> = {};
  let menuButton: HTMLButtonElement | null = $state(null);
  let formRoot: HTMLFormElement | null = $state(null);
  let menuRoot: HTMLDivElement | null = $state(null);
  export function getState(): RoutstrSettingsState { return shellState; }
  export function setState(next: RoutstrSettingsState): void { shellState = next; }
  export function showRecovery(kind: RoutstrRecoveryKind, token: string): void { tokens[kind] = token; if (fields[kind]) fields[kind]!.value = token; shellState = { ...shellState, recoveries: { ...shellState.recoveries, [kind]: { ...shellState.recoveries[kind], visible: !!token } } }; }
  export function readRecovery(kind: RoutstrRecoveryKind): string { return fields[kind]?.value ?? tokens[kind]; }
  export function clearPrivateFields(): void { tokens = { deposit: '', withdraw: '' }; for (const field of Object.values(fields)) if (field) field.value = ''; }
  export function closeMenu(): void { shellState = { ...shellState, menuOpen: false }; }
  function wallet(action: Parameters<RoutstrSettingsActions['wallet']>[0]): void { closeMenu(); actions.wallet(action); }
  function outside(event: MouseEvent): void { if (shellState.menuOpen && event.target instanceof Node && !menuRoot?.contains(event.target)) closeMenu(); }
  function keydown(event: KeyboardEvent): void { if (event.key === 'Escape' && shellState.menuOpen && event.target instanceof Node && formRoot?.contains(event.target)) { event.preventDefault(); event.stopPropagation(); closeMenu(); menuButton?.focus(); } }
  onDestroy(clearPrivateFields);
</script>
<svelte:document onclick={outside} onkeydowncapture={keydown} />
<form bind:this={formRoot} data-routstr-settings-view data-cloud-provider-settings-view class={PROVIDER_PANEL} onsubmit={event => event.preventDefault()}>
  <input type="text" name="ai-provider" value="routstr" autocomplete="username" hidden>
  <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.</p>
  <section aria-label="Cashu wallet" class={PROVIDER_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0'}>
    <h3 class="gb:cloud-provider:text-xs gb:cloud-provider:uppercase gb:cloud-provider:tracking-wide gb:cloud-provider:m-0">⚡ Wallet</h3>
    <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>The funded Routstr node session syncs with your 24-word Data Sync mnemonic. Cashu proofs and their separate 12-word recovery seed stay on this device.</p>
    <div id="routstr-wallet-device-status" class={PROVIDER_COPY + ' ' + PROVIDER_TONES[shellState.seed.tone]} role="status">{shellState.seed.text}</div>
    <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:justify-between'}>
      <div class={PROVIDER_ACTIONS}><span id="routstr-wallet-balance" class="gb:cloud-provider:text-ink gb:cloud-provider:font-semibold" role="status">{shellState.walletBalance}</span><button type="button" class={PROVIDER_SECONDARY} title="Verify proofs against mint" aria-label="Verify wallet proofs against mint" data-provider-panel-action="refresh-cashu-wallet-balance" onclick={event => { event.stopPropagation(); actions.refreshWallet(); }}>↻</button></div>
      <div id="routstr-wallet-actions" class={PROVIDER_ACTIONS + ' gb:cloud-provider:relative'}>
        {#each ROUTSTR_WALLET_ACTIONS as action (action.id)}<button type="button" class={shellState.walletAction === action.id ? PROVIDER_PRIMARY : PROVIDER_SECONDARY} data-routstr-wallet-action="wallet-action" data-wallet-action={action.id} onclick={event => { event.stopPropagation(); wallet(action.id); }}>{action.label}</button>{/each}
        <div bind:this={menuRoot}>
          <button type="button" class={ROUTSTR_WALLET_MENU.some(action => action.id === shellState.walletAction) ? PROVIDER_PRIMARY : PROVIDER_SECONDARY} aria-label="More wallet actions" aria-controls="routstr-wallet-menu" aria-expanded={shellState.menuOpen} data-routstr-wallet-action="toggle-wallet-menu" bind:this={menuButton} onclick={event => { event.stopPropagation(); shellState = { ...shellState, menuOpen: !shellState.menuOpen }; }}>⋯</button>
          <div id="routstr-wallet-menu" hidden={!shellState.menuOpen} style:display={shellState.menuOpen ? 'flex' : 'none'} class="gb:cloud-provider:absolute gb:cloud-provider:right-0 gb:cloud-provider:top-full gb:cloud-provider:mt-1 gb:cloud-provider:z-10 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1 gb:cloud-provider:rounded-control gb:cloud-provider:border gb:cloud-provider:border-line gb:cloud-provider:bg-secondary-surface gb:cloud-provider:p-2 gb:cloud-provider:min-w-48 gb:cloud-provider:shadow-lg">
            {#each ROUTSTR_WALLET_MENU as action (action.id)}<button type="button" class={(shellState.walletAction === action.id ? PROVIDER_PRIMARY : PROVIDER_SECONDARY) + ' gb:cloud-provider:text-left'} data-routstr-wallet-action="wallet-action" data-wallet-action={action.id} onclick={event => { event.stopPropagation(); wallet(action.id); }}>{action.label}</button>{/each}
          </div>
        </div>
      </div>
    </div>
    <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:pt-3'}>
      <div class={PROVIDER_COPY + ' gb:cloud-provider:min-w-0 gb:cloud-provider:break-all'}>Mint: <span id="routstr-mint-label" class="gb:cloud-provider:font-mono">{shellState.mint}</span></div>
      <button type="button" class={PROVIDER_SECONDARY} data-provider-panel-action="show-routstr-mint-edit" onclick={event => { event.stopPropagation(); actions.mints(); }}>Mints & balances</button>
    </div>
    <div id="routstr-mint-edit" style="display:none"></div>
    <div id="routstr-wallet-fund-area" style="display:none"></div>
    {#each ['deposit', 'withdraw'] as rawKind (rawKind)}
      {@const kind = rawKind as RoutstrRecoveryKind}
      {#if shellState.recoveries[kind].visible}
        <section class={PROVIDER_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2'} aria-label={'Pending ' + kind + ' recovery'} aria-busy={shellState.recoveries[kind].pending}>
          <h4 class="gb:cloud-provider:text-sm gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink">⚠ Pending {kind} recovery</h4>
          <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>{kind === 'deposit' ? 'A previous node deposit has an unconfirmed outcome. This token may be unspent. Reconcile the node account before reclaiming it:' : 'An outgoing transfer needs reconciliation. Check its payment status or contact its recipient before reclaiming this token:'}</p>
          <textarea class={PROVIDER_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:text-xs gb:cloud-provider:resize-y'} aria-label={'Pending ' + kind + ' recovery token'} readonly rows="3" value={tokens[kind]} bind:this={fields[kind]} onfocus={event => event.currentTarget.select()}></textarea>
          <div class={PROVIDER_ACTIONS}><button type="button" class={PROVIDER_PRIMARY} disabled={shellState.recoveries[kind].pending} onclick={event => { event.stopPropagation(); actions.reclaimRecovery(kind); }}>Recover to Wallet</button><button type="button" class={PROVIDER_SECONDARY} onclick={event => { event.stopPropagation(); actions.copyRecovery(kind); }}>{shellState.recoveries[kind].copied ? '✓ Copied (clears in 60s)' : 'Copy Token'}</button></div>
          <div class={PROVIDER_COPY + ' ' + PROVIDER_TONES[shellState.recoveries[kind].status.tone]} role="status" aria-live="polite">{shellState.recoveries[kind].status.text}</div>
        </section>
      {/if}
    {/each}
  </section>
  <section aria-label="Routstr node" class={PROVIDER_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0'}>
    <h3 class="gb:cloud-provider:text-xs gb:cloud-provider:uppercase gb:cloud-provider:tracking-wide gb:cloud-provider:m-0">🔗 Node</h3>
    <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:justify-between'}>
      <span id="routstr-node-label" class={(shellState.connected ? PROVIDER_TONES.success : 'gb:cloud-provider:text-ink') + ' gb:cloud-provider:break-all'}>{shellState.connected ? '✓ ' : ''}{shellState.nodeLabel}</span>
      <div id="routstr-node-actions" class={PROVIDER_ACTIONS}>
        {#each ROUTSTR_NODE_ACTIONS.filter(action => action.id === 'browse' || !!shellState.node && (action.id !== 'withdraw' || shellState.connected)) as action (action.id)}<button type="button" class={shellState.nodeAction === action.id ? PROVIDER_PRIMARY : PROVIDER_SECONDARY} data-routstr-wallet-action="node-action" data-node-action={action.id} data-node-url={action.id === 'deposit' ? shellState.node : undefined} onclick={event => { event.stopPropagation(); actions.node(action.id, shellState.node); }}>{action.label}</button>{/each}
      </div>
    </div>
    {#if shellState.connected}<div class={PROVIDER_ACTIONS + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:pt-3'}>Session: <span id="routstr-node-balance" class={PROVIDER_TONES[shellState.nodeBalance.tone]} role="status">{shellState.nodeBalance.text}</span><button type="button" class={PROVIDER_SECONDARY} aria-label="Refresh node balance" data-provider-panel-action="refresh-routstr-balance" onclick={event => { event.stopPropagation(); actions.refreshNode(); }}>↻</button></div>{/if}
    {#if shellState.refundNode}<div class={PROVIDER_NOTICE + ' gb:cloud-provider:break-all'}>Saved refund for this node: {shellState.refundNode}<div class={PROVIDER_ACTIONS + ' gb:cloud-provider:mt-2'}><button type="button" class={PROVIDER_SECONDARY} data-routstr-wallet-action="saved-node-refunds" data-node-url={shellState.refundNode} onclick={event => { event.stopPropagation(); actions.refunds(shellState.refundNode); }}>Check refund recovery</button></div></div>{/if}
    <div id="routstr-node-picker" style="display:none"></div>
  </section>
  <div data-routstr-model-settings-host></div>
</form>
