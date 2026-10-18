<script lang="ts">
  import { onDestroy } from 'svelte';
  import { initialWalletNodeState } from '../wallet-node-contract.js';
  import type { WalletNodeActions, WalletNodeState, WalletNodeSession, WalletNodeRecovery } from '../wallet-node-contract.js';
  import { WALLET_TOKEN_INPUT, WALLET_COPY, WALLET_INPUT, WALLET_PRIMARY, WALLET_SECONDARY, WALLET_ACTIONS, WALLET_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { actions }: { actions: WalletNodeActions } = $props();
  const id = $props.id(); let nodeState = $state(initialWalletNodeState()); let amount = $state<string | number | undefined>('');
  let recoveries = $state<WalletNodeRecovery[]>([]); let session: WalletNodeSession | null = null;
  let amountInput: HTMLInputElement | null = $state(null); const tokenFields: HTMLTextAreaElement[] = [];
  export function getState(): WalletNodeState { return nodeState; }
  export function setState(next: WalletNodeState): void { nodeState = next; }
  export function readAmount(): string { return amountInput?.value ?? String(amount ?? ''); }
  export function setAmount(next: number): void { amount = next; }
  export function setSession(next: WalletNodeSession): void { session = next; }
  export function readSession(): WalletNodeSession | null { return session; }
  export function readRecovery(index: number): WalletNodeRecovery | null { return recoveries[index] ?? null; }
  export function setRecoveries(next: WalletNodeRecovery[]): void { for (const field of tokenFields) if (field) field.value = ''; recoveries = next; }
  export function clearPrivateFields(): void { amount = ''; session = null; setRecoveries([]); if (amountInput) amountInput.value = ''; }
  onDestroy(clearPrivateFields);
</script>
<section data-wallet-node-view data-cloud-provider-settings-view aria-label="Node accounts and recovery" aria-busy={nodeState.pending} class="gb:cloud-provider:text-[11px] gb:cloud-provider:leading-[1.5] gb:cloud-provider:mt-2 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0 gb:cloud-provider:text-ink">
  <h3 class="gb:cloud-provider:text-xs gb:cloud-provider:font-semibold gb:cloud-provider:[font-family:inherit] gb:cloud-provider:m-0">{nodeState.mode === 'browse' ? 'Browse nodes' : nodeState.mode === 'deposit' ? 'Node deposit' : nodeState.mode === 'recovery' ? 'Deposit outcome unconfirmed' : 'Saved refund recovery'}</h3>
  {#if nodeState.node}<p class={WALLET_COPY + ' gb:cloud-provider:break-all'}>Node: {nodeState.node.replace(/^https?:\/\//, '')}</p>{/if}
  {#if nodeState.mode === 'browse'}
    {#if nodeState.phase === 'loading'}<p class={WALLET_COPY}>Searching Nostr relays…</p>{/if}
    {#each nodeState.nodes as node (node.url)}
      <article class={'gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:items-center gb:cloud-provider:justify-between gb:cloud-provider:gap-1.5 gb:cloud-provider:py-1.5 gb:cloud-provider:border-b gb:cloud-provider:border-line'}>
        <div class="gb:cloud-provider:min-w-0 gb:cloud-provider:flex-1 gb:cloud-provider:break-all"><strong class="gb:cloud-provider:text-xs gb:cloud-provider:font-medium">{node.name}</strong>
          {#if node.tor}<span class="gb:cloud-provider:text-[10px]" title="Tor available"> 🧅</span>{/if}
          {#if node.privateTee}<p class="gb:cloud-provider:m-0 gb:cloud-provider:text-[9px] gb:cloud-provider:font-semibold gb:cloud-provider:text-success-ink">🔒 Advertises Private TEE</p>{/if}
          <p class="gb:cloud-provider:m-0 gb:cloud-provider:text-[10px] gb:cloud-provider:text-secondary">{node.url.replace(/^https?:\/\//, '')} · {node.models} model{node.models === 1 ? '' : 's'}</p><p class="gb:cloud-provider:m-0 gb:cloud-provider:text-[10px] gb:cloud-provider:text-secondary">Operator: {node.operator}</p>
        </div>
        <button type="button" class={WALLET_PRIMARY} disabled={nodeState.pending} data-routstr-wallet-action="connect-node" data-node-url={node.url} onclick={event => { event.stopPropagation(); actions.connect(node.url); }}>Connect</button>
      </article>
    {/each}
    {#if nodeState.phase === 'empty'}<p class={WALLET_COPY}>No online nodes found ({nodeState.discovered} discovered). Try again later.</p>{/if}
    <button type="button" class={WALLET_SECONDARY} disabled={nodeState.pending} onclick={() => actions.refresh()}>Refresh nodes</button>
  {:else if nodeState.mode === 'deposit'}
    {#if nodeState.phase === 'loading'}<p class={WALLET_COPY}>Checking node and wallet balances…</p>{/if}
    {#if nodeState.mint}<p class={WALLET_COPY + ' gb:cloud-provider:break-all'}>Wallet: ⚡ {nodeState.balance.toLocaleString()} sats · {nodeState.mint.replace(/^https?:\/\//, '')}</p>{/if}
    {#if nodeState.phase === 'mints'}
      <h4 class="gb:cloud-provider:text-xs gb:cloud-provider:font-semibold gb:cloud-provider:[font-family:inherit] gb:cloud-provider:m-0">Choose a mint for this node</h4>
      <p class={WALLET_COPY}>This node accepts a different mint. Your current funds stay available in Mints &amp; balances. Review your choice before switching; fund the selected mint if its balance is empty.</p>
      {#each nodeState.accepted as entry (entry.mint)}<button type="button" class={WALLET_SECONDARY + ' gb:cloud-provider:text-left gb:cloud-provider:break-all'} disabled={nodeState.pending} data-routstr-wallet-action="choose-node-mint" data-mint-url={entry.mint} onclick={event => { event.stopPropagation(); actions.chooseMint(entry.mint); }}>{entry.mint.replace(/^https?:\/\//, '')}{#if entry.balance !== null} · {entry.balance.toLocaleString()} sats{/if}</button>{/each}
    {:else if nodeState.phase === 'empty'}<p class={WALLET_COPY}>This mint has no funds yet. Use Deposit in the Wallet section above to add sats.</p>
    {:else if nodeState.phase === 'ready' || nodeState.phase === 'rejected' || nodeState.phase === 'error'}
      <label for="routstr-deposit-amount" class={WALLET_COPY}>Deposit amount in sats</label>
      <input id="routstr-deposit-amount" class={WALLET_INPUT} type="number" min="1" max={nodeState.balance} step="1" inputmode="numeric" disabled={nodeState.pending || nodeState.phase === 'rejected'} bind:value={amount} bind:this={amountInput} />
      <div class={WALLET_ACTIONS}>
        {#each [500, 1000, 2500, 5000].filter(value => value <= nodeState.balance) as preset}<button type="button" class={WALLET_SECONDARY} disabled={nodeState.pending || nodeState.phase === 'rejected'} data-routstr-wallet-action="deposit-node-preset" data-node-url={nodeState.node} data-amount={preset} onclick={event => { event.stopPropagation(); actions.deposit(preset); }}>⚡ {preset.toLocaleString()}</button>{/each}
        <button type="button" class={WALLET_SECONDARY} disabled={nodeState.pending || nodeState.phase === 'rejected'} data-routstr-wallet-action="deposit-node-preset" data-node-url={nodeState.node} data-amount={nodeState.balance} onclick={event => { event.stopPropagation(); actions.deposit(nodeState.balance); }}>All ({nodeState.balance.toLocaleString()})</button>
      </div>
      <button type="button" class={WALLET_PRIMARY} disabled={nodeState.pending || nodeState.phase === 'rejected'} data-routstr-wallet-action="deposit-node-input" data-node-url={nodeState.node} onclick={event => { event.stopPropagation(); actions.deposit(); }}>Deposit</button>
      {#if nodeState.phase === 'rejected'}<p class={WALLET_COPY}>The node rejected this saved session. Start a new session; the previous key and recovery records will be preserved.</p><button type="button" class={WALLET_SECONDARY} disabled={nodeState.pending} data-routstr-wallet-action="new-node-session" onclick={event => { event.stopPropagation(); actions.newSession(); }}>Start a new node session</button>{/if}
    {/if}
  {:else if nodeState.mode === 'refunds'}<p class={WALLET_COPY}>Saved node refunds. These records do not block other node accounts.</p>{#if nodeState.phase === 'empty'}<p class={WALLET_COPY}>No saved refunds.</p>{/if}
  {:else if nodeState.mode === 'recovery'}<p class={WALLET_COPY}>The node may have received this deposit. Check the node account or reclaim this token only if it remains unspent.</p>{/if}
  {#each recoveries as record, index (index)}
    <article class={WALLET_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0'}>
      <p class="gb:cloud-provider:break-all">Node: {record.node}{#if record.mint}<br />Token mint: {record.mint}{/if}{#if record.createdAt > 0}<br />Saved: {new Date(record.createdAt).toLocaleString()}{/if}</p>
      <p id={id + '-hint-' + index}>This saved recovery is separate from any later node deposit. Keep its token until recovery succeeds.</p>
      {#if record.token}<textarea class={WALLET_TOKEN_INPUT} aria-label={nodeState.mode === 'recovery' ? 'Deposit recovery token' : 'Node refund recovery token'} aria-describedby={id + '-hint-' + index} rows="4" readonly value={record.token} bind:this={tokenFields[index]} onfocus={event => event.currentTarget.select()}></textarea>
        <button type="button" class={WALLET_SECONDARY} disabled={nodeState.pending} onclick={() => actions.copy(index)}>Copy Token</button>{/if}
      {#if nodeState.mode === 'recovery'}<button type="button" class={WALLET_PRIMARY} disabled={nodeState.pending} onclick={() => actions.reclaim(index)}>Recover to Wallet</button>
      {:else if record.id && record.generation}<button type="button" class={WALLET_PRIMARY} disabled={nodeState.pending} data-wallet-node-refund-index={index} onclick={() => actions.retry(index)}>Retry refund recovery</button>{/if}
    </article>
  {/each}
  <div id="routstr-deposit-status" role="status" aria-live="polite" class={WALLET_COPY + ' gb:cloud-provider:break-words ' + PROVIDER_TONES[nodeState.status.tone]}>{nodeState.status.text}</div>
  <button type="button" class={WALLET_SECONDARY} onclick={() => actions.close()}>Close node controls</button>
</section>
