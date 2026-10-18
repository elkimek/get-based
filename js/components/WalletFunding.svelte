<script lang="ts">
  import { onDestroy } from 'svelte';
  import { initialWalletFundingState } from '../wallet-funding-contract.js';
  import type { WalletFundingState, WalletFundingInvoice, WalletFundingActions } from '../wallet-funding-contract.js';
  import { WALLET_COPY, WALLET_INPUT, WALLET_ACTIONS, WALLET_PRIMARY, WALLET_SECONDARY, PROVIDER_LINK, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { feePct, actions }: { feePct: number; actions: WalletFundingActions } = $props();
  let fundingState = $state(initialWalletFundingState());
  let payment = $state<WalletFundingInvoice | null>(null);
  let copied = $state(false);
  let custom = $state(''); let token = $state('');
  let customInput: HTMLInputElement | null = $state(null);
  let tokenInput: HTMLInputElement | null = $state(null);
  let invoiceInput: HTMLTextAreaElement | null = $state(null);
  export function getState(): WalletFundingState { return fundingState; }
  export function setState(next: WalletFundingState): void { fundingState = next; if (!next.custom) { custom = ''; if (customInput) customInput.value = ''; } }
  export function showInvoice(next: WalletFundingInvoice): void { if (payment?.invoice !== next.invoice || payment?.quote !== next.quote || payment?.mint !== next.mint) copied = false; payment = next; }
  export function readInvoice(): WalletFundingInvoice | null { return payment; }
  export function clearInvoice(): void { if (invoiceInput) invoiceInput.value = ''; payment = null; copied = false; }
  export function setCopied(): void { copied = true; }
  export function readCustomAmount(): string { return customInput?.value ?? custom; }
  export function focusCustomAmount(): void { customInput?.focus(); }
  export function readToken(): string { return tokenInput?.value ?? token; }
  export function clearToken(): void { token = ''; if (tokenInput) tokenInput.value = ''; }
  export function clearPrivateFields(): void { clearToken(); clearInvoice(); custom = ''; if (customInput) customInput.value = ''; }
  onDestroy(clearPrivateFields);
</script>
<section data-wallet-funding-view data-cloud-provider-settings-view aria-label="Deposit to Cashu wallet" class="gb:cloud-provider:min-w-0 gb:cloud-provider:text-[11px] gb:cloud-provider:leading-[1.5] gb:cloud-provider:mt-2 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-1.5 gb:cloud-provider:text-ink">
  <p class={WALLET_COPY}>Deposit with Lightning</p>
  <div class="gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:gap-1" aria-busy={fundingState.pending}>
    {#each [1000, 5000, 10000, 25000] as sats (sats)}<button type="button" class={WALLET_SECONDARY + ' gb:cloud-provider:flex-1'} data-routstr-wallet-action="fund-wallet-preset" data-sats={sats} disabled={fundingState.pending}>⚡ {sats.toLocaleString()}</button>{/each}
    <div id="routstr-wfund-custom-slot" class="gb:cloud-provider:flex gb:cloud-provider:min-w-0">
      {#if fundingState.custom}
        <div class="gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:gap-1 gb:cloud-provider:w-full">
          <label class={WALLET_COPY} for="routstr-wfund-custom">Deposit amount in sats</label>
          <input type="text" inputmode="numeric" id="routstr-wfund-custom" class={WALLET_INPUT} placeholder="sats" bind:value={custom} bind:this={customInput} disabled={fundingState.pending} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); actions.submitCustom(); } else if (event.key === 'Escape') { event.preventDefault(); actions.cancelCustom(); } }}>
          <button type="button" class={WALLET_PRIMARY} data-routstr-wallet-action="fund-wallet-custom" disabled={fundingState.pending}>Get invoice</button>
        </div>
      {:else}<button type="button" class={WALLET_SECONDARY + ' gb:cloud-provider:w-full'} data-routstr-wallet-action="fund-wallet-custom-input" disabled={fundingState.pending}>⚡ Custom</button>{/if}
    </div>
  </div>
  <p class={WALLET_COPY}>1,000 sats is enough for onboarding and a few chats · min 100 sats</p>
  {#if feePct > 0}<p class={WALLET_COPY}>{Math.round(feePct * 100)}% development fee applies to deposits. You can also paste a Cashu token ({Math.round(feePct * 100)}% fee).</p>{:else}<p class={WALLET_COPY}>Paste a Cashu token</p>{/if}
  <label class={WALLET_COPY} for="routstr-wcashu-input">Cashu token</label>
  <div class={WALLET_ACTIONS}>
    <input type="text" id="routstr-wcashu-input" class={WALLET_INPUT + ' gb:cloud-provider:flex-1'} placeholder="cashuA… or cashuB…" autocomplete="off" spellcheck="false" bind:this={tokenInput} bind:value={token} disabled={fundingState.pending}>
    <button type="button" class={WALLET_PRIMARY} data-routstr-wallet-action="receive-wallet-cashu" disabled={fundingState.pending}>Deposit token</button>
  </div>
  <div id="routstr-wfund-status" class="gb:cloud-provider:min-w-0" aria-live="polite" aria-busy={fundingState.pending}>
    {#if fundingState.phase === 'paid'}
      <div class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:items-center gb:cloud-provider:gap-1.5 gb:cloud-provider:text-success-ink" role="status">
        <span class="gb:cloud-provider:text-3xl" aria-hidden="true">✓</span><strong>Payment received</strong><span>+{fundingState.credited.toLocaleString()} sats added to wallet</span>
      </div>
    {:else if fundingState.phase === 'invoice' && payment}
      <div class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:items-center gb:cloud-provider:gap-1.5 gb:cloud-provider:min-w-0">
        <strong class="gb:cloud-provider:text-sm">⚡ {payment.amount.toLocaleString()} sats</strong>
        <span class={WALLET_COPY + ' gb:cloud-provider:break-all'}>Invoice mint: {payment.mint.replace(/^https?:\/\//, '')}</span>
        <a class={PROVIDER_LINK + ' gb:cloud-provider:max-w-full'} href={'lightning:' + payment.invoice} aria-label="Open Lightning invoice in your wallet">
          {#if payment.qrImage}<img src={payment.qrImage} alt="Lightning deposit invoice QR code" class="gb:cloud-provider:w-[220px] gb:cloud-provider:h-[220px] gb:cloud-provider:max-w-full gb:cloud-provider:bg-white gb:cloud-provider:p-2 gb:cloud-provider:rounded-control">{:else}<span>Open Lightning wallet</span>{/if}
        </a>
        <button type="button" class={WALLET_SECONDARY} data-routstr-wallet-action="copy-funding-invoice">{copied ? '✓ Copied' : payment.invoice.slice(0, 20) + '… copy'}</button>
        <details class="gb:cloud-provider:w-full gb:cloud-provider:min-w-0">
          <summary class={WALLET_SECONDARY + ' gb:cloud-provider:flex gb:cloud-provider:items-center'}>Invoice text</summary>
          <label class={WALLET_COPY} for="routstr-funding-invoice-text">Lightning invoice</label>
          <textarea id="routstr-funding-invoice-text" readonly value={payment.invoice} bind:this={invoiceInput} class={WALLET_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:break-all gb:cloud-provider:resize-y'} onfocus={event => event.currentTarget.select()}></textarea>
        </details>
        <div id="routstr-wfund-poll" class={WALLET_COPY}>{fundingState.poll}</div>
      </div>
    {/if}
    {#if fundingState.status.text}<div role="status" class={WALLET_COPY + ' ' + PROVIDER_TONES[fundingState.status.tone] + ' gb:cloud-provider:whitespace-pre-line gb:cloud-provider:break-words'}>{fundingState.status.text}</div>{/if}
  </div>
  <p class={WALLET_COPY}>Paid deposits keep being checked even after you close this panel.</p>
  <button type="button" class={WALLET_SECONDARY} data-routstr-wallet-action="recover-wallet-funding" disabled={fundingState.pending}>Check pending deposits</button>
</section>
