<script lang="ts">
  import { onDestroy } from 'svelte';
  import { initialWalletWithdrawState } from '../wallet-withdraw-contract.js';
  import type { WalletWithdrawActions, WalletWithdrawState, WalletWithdrawQuote } from '../wallet-withdraw-contract.js';
  import { WALLET_COPY, WALLET_INPUT, WALLET_SECONDARY, WALLET_PRIMARY, WALLET_ACTIONS, WALLET_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { actions }: { actions: WalletWithdrawActions } = $props();
  let withdrawState = $state(initialWalletWithdrawState()); let destination = $state(''); let amount = $state<string | number | undefined>('');
  let token = $state(''); let quote: WalletWithdrawQuote | null = null;
  let destinationInput: HTMLInputElement | null = $state(null); let amountInput: HTMLInputElement | null = $state(null); let tokenText: HTMLTextAreaElement | null = $state(null);
  const needsAmount = $derived(destination.includes('@') && !/^ln(bc|tb|bcrt)/i.test(destination.trim()));
  export function getState(): WalletWithdrawState { return withdrawState; }
  export function setState(next: WalletWithdrawState): void { withdrawState = next; }
  export function readDraft() { return { destination: destinationInput?.value ?? destination, amount: amountInput?.value ?? String(amount ?? '') }; }
  export function setAmount(next: number): void { amount = String(next); }
  export function showQuote(next: WalletWithdrawQuote): void { quote = next; }
  export function readQuote(): WalletWithdrawQuote | null { return quote; }
  export function showToken(next: string): void { token = next; }
  export function readToken(): string { return token; }
  export function clearPrivateFields(): void {
    destination = ''; amount = ''; token = ''; quote = null;
    if (destinationInput) destinationInput.value = ''; if (amountInput) amountInput.value = ''; if (tokenText) tokenText.value = '';
  }
  onDestroy(clearPrivateFields);
</script>
<section data-wallet-withdraw-view data-cloud-provider-settings-view aria-label="Withdraw wallet funds" aria-busy={withdrawState.pending} class="gb:cloud-provider:text-[11px] gb:cloud-provider:leading-[1.5] gb:cloud-provider:mt-2 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0 gb:cloud-provider:text-ink">
  <h3 class="gb:cloud-provider:text-xs gb:cloud-provider:font-semibold gb:cloud-provider:[font-family:inherit] gb:cloud-provider:m-0">Withdraw</h3>
  <p class={WALLET_COPY}>Wallet balance: ⚡ {withdrawState.balance.toLocaleString()} sats</p>
  {#if withdrawState.mint}<p class={WALLET_COPY + ' gb:cloud-provider:break-all'}>Mint: {withdrawState.mint.replace(/^https?:\/\//, '')}</p>{/if}
  <div class={WALLET_ACTIONS}>
    <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} aria-pressed={withdrawState.mode === 'lightning'} data-routstr-wallet-action="withdraw-lightning" onclick={event => { event.stopPropagation(); actions.lightning(); }}>⚡ Lightning</button>
    <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} aria-pressed={withdrawState.mode === 'token'} data-routstr-wallet-action="withdraw-token" onclick={event => { event.stopPropagation(); actions.token(); }}>Cashu Token</button>
  </div>
  <div id="routstr-withdraw-status" class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0">
    {#if withdrawState.mode === 'lightning' && withdrawState.phase === 'form'}
      <label for="routstr-withdraw-input" class={WALLET_COPY}>Lightning invoice or address</label>
      <input id="routstr-withdraw-input" class={WALLET_INPUT} placeholder="lnbc… or user@domain" autocomplete="off" spellcheck="false" disabled={withdrawState.pending} bind:value={destination} bind:this={destinationInput} />
      <div id="routstr-withdraw-ln-amount" style:display={needsAmount ? 'block' : 'none'}>
        <label for="routstr-withdraw-amount" class={WALLET_COPY}>Amount in sats</label>
        <div class={WALLET_ACTIONS}>
          <input id="routstr-withdraw-amount" class={WALLET_INPUT + ' gb:cloud-provider:flex-1'} type="number" min="1" step="1" inputmode="numeric" disabled={withdrawState.pending} bind:value={amount} bind:this={amountInput} />
          <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} data-routstr-wallet-action="withdraw-max" onclick={event => { event.stopPropagation(); actions.maximum(); }}>Max</button>
        </div>
      </div>
      <button type="button" class={WALLET_PRIMARY} disabled={withdrawState.pending} data-routstr-wallet-action="withdraw-quote" onclick={event => { event.stopPropagation(); actions.quote(); }}>Withdraw</button>
    {:else if withdrawState.mode === 'token' && withdrawState.phase === 'form'}
      <label for="routstr-send-amount" class={WALLET_COPY}>Token amount in sats</label>
      <input id="routstr-send-amount" class={WALLET_INPUT} type="number" min="1" step="1" inputmode="numeric" disabled={withdrawState.pending} bind:value={amount} bind:this={amountInput} />
      <div class={WALLET_ACTIONS}>
        {#each [100, 500, 1000, 2500].filter(value => value <= withdrawState.balance) as preset}<button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} data-routstr-wallet-action="send-token-preset" data-amount={preset} onclick={event => { event.stopPropagation(); actions.send(preset); }}>⚡ {preset.toLocaleString()}</button>{/each}
        <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending || withdrawState.balance === 0} data-routstr-wallet-action="send-token-preset" data-amount={withdrawState.balance} onclick={event => { event.stopPropagation(); actions.send(withdrawState.balance); }}>All ({withdrawState.balance.toLocaleString()})</button>
      </div>
      <button type="button" class={WALLET_PRIMARY} disabled={withdrawState.pending} data-routstr-wallet-action="send-token-input" onclick={event => { event.stopPropagation(); actions.send(); }}>Send</button>
    {:else if withdrawState.phase === 'quote'}
      <div class={WALLET_NOTICE}>
        <p>Amount: <strong>{withdrawState.amount.toLocaleString()} sats</strong></p><p>Fee reserve: <strong>{withdrawState.fee.toLocaleString()} sats</strong></p><p>Total: <strong>{(withdrawState.amount + withdrawState.fee).toLocaleString()} sats</strong></p>
        <button type="button" class={WALLET_PRIMARY} disabled={withdrawState.pending} data-routstr-wallet-action="withdraw-execute" onclick={event => { event.stopPropagation(); actions.execute(); }}>Confirm Withdraw</button>
      </div>
    {:else if withdrawState.phase === 'token' && token}
      <div id="routstr-token-result" class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0">
        <p class={WALLET_COPY}>{withdrawState.recovery ? 'Recoverable outgoing token' : 'Token created'}{#if !withdrawState.recovery} — ⚡ {withdrawState.amount.toLocaleString()} sats{/if}</p>
        <p class={WALLET_COPY}>Keep this token private. Created tokens are deducted from your wallet. Copying does not confirm delivery; the recovery record stays until the funds are spent or reclaimed.</p>
        <label for="routstr-outgoing-token" class={WALLET_COPY}>Outgoing Cashu token</label>
        <textarea id="routstr-outgoing-token" class={WALLET_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:resize-y'} rows="4" readonly value={token} bind:this={tokenText} onfocus={event => event.currentTarget.select()}></textarea>
        <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} data-wallet-withdraw-copy onclick={() => actions.copy()}>{withdrawState.copied ? '✓ Copied (60s)' : 'Copy Token'}</button>
        <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} onclick={() => actions.reclaim()}>Recover token to wallet</button>
      </div>
    {/if}
    <div role="status" aria-live="polite" class={WALLET_COPY + ' gb:cloud-provider:break-words ' + PROVIDER_TONES[withdrawState.status.tone]}>{withdrawState.status.text}</div>
  </div>
  <div class={WALLET_ACTIONS}>
    <button type="button" class={WALLET_SECONDARY} disabled={withdrawState.pending} onclick={() => actions.recover()}>Check outgoing recovery</button>
    <button type="button" class={WALLET_SECONDARY} onclick={() => actions.close()}>Close withdrawal</button>
  </div>
</section>
