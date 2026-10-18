<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { PpqSettingsSnapshot, PpqAccountReveal, PpqPaymentDetails, PpqTopupState } from '../ppq-settings-contract.js';
  import type { ProviderSettingsModels as PpqModelState, ProviderSettingsMode as PpqModeState, ProviderSettingsStatus as PpqStatus } from '../provider-settings-contract.js';
  import { PPQ_PAYMENT_METHODS, ppqPaymentMethod } from '../ppq-payment-methods.js';
  import { PPQ_CARD, PPQ_PRIVATE_TEXT, PPQ_METHOD, PPQ_METHOD_ACTIVE, PPQ_AMOUNT, PPQ_MINI, PPQ_PAYMENT_PRIMARY, PPQ_PAYMENT_SECONDARY, PPQ_ACCOUNT_PRIMARY, PPQ_ACCOUNT_SECONDARY } from '../ppq-topup-classes.js';
  import PpqPaymentIcon from './PpqPaymentIcon.svelte';
  import { PROVIDER_PANEL, PROVIDER_COPY, PROVIDER_INPUT, PROVIDER_ACTIONS, PROVIDER_PRIMARY, PROVIDER_SECONDARY, PROVIDER_LINK, PROVIDER_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';

  let { initial, submitCustom, cancelCustom }: { initial: PpqSettingsSnapshot; submitCustom(): void; cancelCustom(): void } = $props();
  let snapshot = $state(untrack(() => initial));
  let key = $state('');
  let keyInput: HTMLInputElement | null = $state(null);
  let saveState = $state<PpqStatus & { pending: boolean }>(untrack(() => ({ pending: false, text: initial.connected ? '✓ Connected' : 'No key set', tone: initial.connected ? 'success' : 'secondary' })));
  let balance = $state<PpqStatus>({ text: 'Balance: loading...', tone: 'secondary' });
  const hasCatalog = $derived(snapshot.models.groups.some(group => group.options.length));
  const unavailableModel = $derived(hasCatalog && !snapshot.models.groups.some(group => group.options.some(option => option.value === snapshot.models.selectedModel)));

  export function setModels(models: PpqModelState): void { snapshot = { ...snapshot, models }; }
  export function getModels(): PpqModelState { return snapshot.models; }
  export function setMode(mode: PpqModeState): void { snapshot = { ...snapshot, mode }; }
  export function refresh(next: PpqSettingsSnapshot): void { snapshot = next; }
  export function setSaveState(state: PpqStatus & { pending: boolean }): void { saveState = state; }
  export function setBalance(status: PpqStatus): void { balance = status; }
  export function readKey(): string { return keyInput?.value ?? key; }
  export function setStoredKey(value: string): void { key = value; }
  export function clearKey(): void { key = ''; if (keyInput) keyInput.value = ''; }
  let account = $state<PpqAccountReveal | null>(null);
  let accountCopied = $state(false);
  let payment = $state<PpqPaymentDetails | null>(null);
  let paymentCopied = $state(false);
  let topup = $state<PpqTopupState>({ open: false, phase: 'picker', method: 'btc-lightning', amount: 0, custom: false, status: { text: '', tone: 'secondary' } });
  let customInput: HTMLInputElement | null = $state(null);
  let customAmount = $state('');
  const method = $derived(ppqPaymentMethod(topup.method) || PPQ_PAYMENT_METHODS[0]);
  export function showAccount(value: PpqAccountReveal): void { if (account?.apiKey !== value.apiKey || account?.creditId !== value.creditId) accountCopied = false; account = value; }
  export function readAccount(): PpqAccountReveal | null { return account; }
  export function hideAccount(): void { account = null; accountCopied = false; }
  export function setAccountCopied(): void { accountCopied = true; }
  export function setTopup(state: PpqTopupState): void { topup = state; if (!state.custom) customAmount = ''; }
  export function getTopup(): PpqTopupState { return topup; }
  export function readCustomAmount(): string { return customInput?.value ?? customAmount; }
  export function focusCustomAmount(): void { customInput?.focus(); }
  export function showPayment(value: PpqPaymentDetails): void { payment = value; paymentCopied = false; }
  export function readPayment(): string { return payment?.paymentText || ''; }
  export function clearPayment(): void { payment = null; paymentCopied = false; }
  export function setPaymentCopied(): void { paymentCopied = true; }
  onDestroy(() => { clearKey(); hideAccount(); clearPayment(); customAmount = ''; });
</script>

<form class={PROVIDER_PANEL} data-ppq-settings-view data-cloud-provider-settings-view onsubmit={event => event.preventDefault()}>
  <input type="text" name="ai-provider" value="ppq" autocomplete="username" hidden>
  {#if account}
    <section class={PPQ_CARD} aria-label="Save your PPQ account details">
      <h3 class="gb:cloud-provider:text-[13px] gb:cloud-provider:[font-family:inherit] gb:cloud-provider:font-semibold gb:cloud-provider:text-ink">⚠ Save your account details</h3>
      <p class={PROVIDER_COPY}>PPQ accounts are anonymous — <strong class="gb:cloud-provider:text-ink">there is no way to recover a lost key</strong>. Copy both values now and store them somewhere safe.</p>
      <div class={PROVIDER_COPY}>API Key</div><div class={PPQ_PRIVATE_TEXT}>{account.apiKey}</div>
      <div class={PROVIDER_COPY + ' gb:cloud-provider:mt-2'}>Credit ID (enter at <a class={PROVIDER_LINK} href="https://ppq.ai/invite/8f3017cd" target="_blank" rel="noopener">ppq.ai</a> to access your account on the web)</div>
      <div class={PPQ_PRIVATE_TEXT}>{account.creditId}</div>
      <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:mt-2'}>
        <button type="button" class={PPQ_ACCOUNT_PRIMARY} data-provider-panel-action="copy-ppq-key-reveal">{accountCopied ? '✓ Copied (clears in 60s)' : 'Copy Both'}</button>
        <button type="button" class={PPQ_ACCOUNT_SECONDARY} data-provider-panel-action="dismiss-ppq-key-reveal" disabled={saveState.pending}>{account.activated ? 'I’ve saved it' : 'Finish without activation'}</button>
      </div>
      {#if saveState.pending || saveState.tone === 'danger'}<div class={PROVIDER_COPY + ' ' + PROVIDER_TONES[saveState.tone]} role="status">{saveState.text}</div>{/if}
    </section>
  {:else}
  <div class={PROVIDER_COPY}>Pay-per-query AI aggregator. 300+ models, no subscription, no KYC. Top up with crypto or <a class={PROVIDER_LINK} href="https://www.bitrefill.com/gift-cards/ppq-us/" target="_blank" rel="noopener">gift cards</a>.</div>
  {#if !snapshot.connected}
    <button type="button" class={PROVIDER_PRIMARY} data-provider-panel-action="create-ppq-account" disabled={saveState.pending}>Create Account (instant, no signup)</button>
    <div class={PROVIDER_COPY + ' gb:cloud-provider:text-center'}>or enter existing key</div>
  {/if}
  <div id="ppq-key-status" class={PROVIDER_TONES[saveState.tone]} role="status" aria-live="polite">{saveState.text}</div>
  <label for="ppq-key-input" class={PROVIDER_COPY}>API key</label>
  <input type="password" id="ppq-key-input" class={PROVIDER_INPUT} placeholder="sk-..." autocomplete="new-password" bind:this={keyInput} bind:value={key} disabled={saveState.pending}>
  <div class={PROVIDER_ACTIONS} aria-busy={saveState.pending}>
    <button type="button" id="save-ppq-key-btn" class={PROVIDER_PRIMARY} data-provider-panel-action="save-ppq-key" disabled={saveState.pending}>{saveState.pending ? 'Validating...' : 'Save & Validate'}</button>
    {#if snapshot.connected}<button type="button" class={PROVIDER_SECONDARY} data-provider-panel-action="remove-ppq-key" disabled={saveState.pending}>Remove Key</button>{/if}
  </div>
  {#if snapshot.connected}
    <div class={PROVIDER_ACTIONS}>
      <span id="ppq-balance" class={PROVIDER_COPY + ' ' + PROVIDER_TONES[balance.tone]} role="status">{balance.text}</span>
      <button type="button" class={PPQ_MINI} data-provider-panel-action="refresh-ppq-balance" title="Refresh PPQ balance" aria-label="Refresh PPQ balance">↻</button>
      <button type="button" id="ppq-topup-toggle" class={PPQ_MINI} data-provider-panel-action="show-ppq-topup" aria-expanded={topup.open} aria-controls="ppq-topup-area">{topup.open ? 'Close' : 'Top Up'}</button>
    </div>
  {/if}
  <div id="ppq-model-area" class="gb:cloud-provider:min-w-0">
    {#if hasCatalog}
      <label for="ppq-model-select" class={PROVIDER_COPY}>Model</label>
      <select id="ppq-model-select" class={PROVIDER_INPUT} data-provider-panel-change="ppq-model" bind:value={snapshot.models.selectedModel}>
        {#if unavailableModel}<option value={snapshot.models.selectedModel} disabled>Saved model unavailable: {snapshot.models.selectedModel}</option>{/if}
        {#each snapshot.models.groups as group (group.label)}
          {#if group.label}
            <optgroup label={group.label}>{#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</optgroup>
          {:else}
            {#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
          {/if}
        {/each}
      </select>
      <div id="ppq-model-pricing" class={PROVIDER_COPY + ' ' + PROVIDER_TONES[snapshot.models.pricing.tone]}>{snapshot.models.pricing.text}</div>
    {:else}
      <div class={PROVIDER_COPY}>Model: <span class="gb:cloud-provider:text-ink">{snapshot.models.modelDisplay}</span>{#if snapshot.connected} <span>(save key to load models)</span>{/if}</div>
    {/if}
  </div>
  {#if snapshot.mode.available || snapshot.mode.enabled || snapshot.mode.active}
    <div class={PROVIDER_ACTIONS}>
      <SettingsToggle id="ppq-private-toggle" label="Private TEE Mode" checked={snapshot.mode.enabled} providerChange="ppq-private-mode" touch="coarse" />
      <span class="gb:cloud-provider:text-sm">Private TEE Mode</span>
    </div>
    {#if snapshot.mode.enabled && !snapshot.mode.available}
      <div class={PROVIDER_COPY} role="status">Private model catalog unavailable. Save your key to refresh it. Private mode remains enabled.</div>
    {/if}
    <div id="ppq-private-indicator" class={PROVIDER_COPY} hidden={!snapshot.mode.active}>🔒 Prompts are encrypted in your browser and decrypted only inside a verified PPQ/Tinfoil TEE. Web search is disabled.</div>
  {/if}
  <div id="ppq-topup-area" hidden={!topup.open} class={PPQ_CARD}>
    {#if topup.phase === 'picker'}
      <div class="gb:cloud-provider:grid gb:cloud-provider:grid-cols-3 gb:cloud-provider:sm:grid-cols-5 gb:cloud-provider:gap-1" aria-label="Payment method">
        {#each PPQ_PAYMENT_METHODS as option (option.id)}
          <button type="button" class={PPQ_METHOD + (method.id === option.id ? PPQ_METHOD_ACTIVE : '')} data-provider-panel-action="select-ppq-method" data-ppq-method={option.id} aria-pressed={method.id === option.id}>
            <span class="ppq-method-icon gb:cloud-provider:w-6 gb:cloud-provider:h-6"><PpqPaymentIcon method={option.id} /></span><span class="ppq-method-label gb:cloud-provider:text-[10px] gb:cloud-provider:font-semibold gb:cloud-provider:text-ink">{option.label}</span>
          </button>
        {/each}
      </div>
      <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:mt-2'}>
        {#each method.amounts as amount (amount)}<button type="button" class={PPQ_AMOUNT} data-provider-panel-action="ppq-topup-preset" data-amount={amount}>${amount}</button>{/each}
        <div id="ppq-custom-slot" class="gb:cloud-provider:flex gb:cloud-provider:flex-1 gb:cloud-provider:min-w-0">
          {#if topup.custom}
            <input type="text" inputmode="decimal" id="ppq-custom-amount" class={PPQ_AMOUNT + ' gb:cloud-provider:w-full gb:cloud-provider:cursor-text'} placeholder="$" aria-label="Custom top-up amount in US dollars" bind:this={customInput} bind:value={customAmount} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); submitCustom(); } else if (event.key === 'Escape') { event.preventDefault(); cancelCustom(); } }} onblur={() => { if (customAmount.trim()) submitCustom(); }}>
          {:else}<button type="button" class={PPQ_AMOUNT + ' gb:cloud-provider:w-full'} data-provider-panel-action="show-ppq-custom-input" aria-label="Enter a custom top-up amount">$…</button>{/if}
        </div>
      </div>
      <div class={PROVIDER_COPY + ' gb:cloud-provider:mt-2 gb:cloud-provider:text-center'}>$2 is enough for onboarding, a few imports, and chats · min ${method.min}</div>
    {:else if topup.phase === 'pending'}
      <div class={PROVIDER_COPY} role="status">Generating invoice…</div>
      <button type="button" class={PPQ_PAYMENT_SECONDARY} data-provider-panel-action="cancel-ppq-topup">Cancel</button>
    {:else if topup.phase === 'success'}
      <div class={PROVIDER_TONES.success} role="status">✓ Payment received!<div class={PROVIDER_COPY}>${topup.amount.toFixed(2)} added to your balance</div></div>
    {:else if topup.phase === 'error'}
      <div class={PROVIDER_TONES.danger} role="status">{topup.status.text}</div>
      <button type="button" class={PPQ_PAYMENT_SECONDARY} data-provider-panel-action="cancel-ppq-topup">Close</button>
    {:else if payment}
      <div class="gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:gap-3">
        {#if payment.qrImage}<img src={payment.qrImage} alt={method.id === 'btc-lightning' ? 'Lightning payment invoice QR code' : method.label + ' payment address QR code'} class="gb:cloud-provider:w-[140px] gb:cloud-provider:h-[140px] gb:cloud-provider:bg-white gb:cloud-provider:p-1.5 gb:cloud-provider:rounded-control">{/if}
        <div class="gb:cloud-provider:flex-1 gb:cloud-provider:min-w-0">
          <div class="gb:cloud-provider:text-sm gb:cloud-provider:font-semibold gb:cloud-provider:text-ink">{method.label} — ${payment.amount.toFixed(2)}</div>
          {#if payment.cryptoAmount !== null}<div class={PROVIDER_COPY}>{payment.cryptoAmount}</div>{/if}
          <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:mt-2'}>
            <button type="button" class={PPQ_PAYMENT_PRIMARY} data-provider-panel-action="copy-ppq-payment">{paymentCopied ? '✓ Copied!' : method.id === 'btc-lightning' ? 'Copy Invoice' : 'Copy Address'}</button>
            <a href={payment.walletUri} class={PPQ_PAYMENT_SECONDARY + ' gb:cloud-provider:no-underline'}>Open in Wallet</a>
            <button type="button" class={PPQ_PAYMENT_SECONDARY} data-provider-panel-action="cancel-ppq-topup">Cancel</button>
          </div>
          <div id="ppq-topup-status" class={PROVIDER_COPY + ' ' + PROVIDER_TONES[topup.status.tone]} role="status"><span id="ppq-topup-countdown">{topup.status.text}</span></div>
        </div>
      </div>
      <details class="gb:cloud-provider:mt-2"><summary class={PROVIDER_LINK + ' gb:cloud-provider:cursor-pointer gb:cloud-provider:[@media(pointer:coarse)]:min-h-11 gb:cloud-provider:[@media(pointer:coarse)]:py-3'}>{method.id === 'btc-lightning' ? 'Show invoice text' : 'Show address'}</summary><div class={PPQ_PRIVATE_TEXT + ' gb:cloud-provider:max-h-20 gb:cloud-provider:overflow-y-auto'}>{payment.paymentText}</div></details>
    {/if}
  </div>
  <div class={PROVIDER_NOTICE}>Your key is stored locally. No account data is shared with getbased. <a class={PROVIDER_LINK} href="https://ppq.ai/invite/8f3017cd" target="_blank" rel="noopener">ppq.ai</a></div>
  {/if}
</form>
