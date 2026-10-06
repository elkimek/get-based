<script lang="ts">
  import { flushSync, onDestroy } from 'svelte';
  import { initialWalletMintState } from '../wallet-mint-contract.js';
  import type { WalletMintActions, WalletMintEntry, WalletMintState } from '../wallet-mint-contract.js';
  import { PROVIDER_COPY, PROVIDER_INPUT, PROVIDER_PRIMARY, PROVIDER_SECONDARY, PROVIDER_ACTIONS, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { actions }: { actions: WalletMintActions } = $props();
  let mintState = $state(initialWalletMintState()); let draft = $state('');
  let input: HTMLInputElement | null = $state(null); let select: HTMLButtonElement | null = $state(null);
  const normalized = (value: string) => value.trim().replace(/\/+$/, '');
  export function getState(): WalletMintState { return mintState; }
  export function setState(next: WalletMintState): void { mintState = next; }
  export function readDraft(): string { return input?.value ?? draft; }
  export function setDraft(mint: string): void { draft = mint; if (input) input.value = mint; }
  export function focusSelect(): void { select?.focus({ preventScroll: true }); }
  export function clearFields(): void { draft = ''; if (input) input.value = ''; }
  function choose(event: MouseEvent, mint: string): void { event.stopPropagation(); flushSync(() => { draft = mint; if (input) input.value = mint; }); }
  onDestroy(clearFields);
</script>
{#snippet row(entry: WalletMintEntry)}
  <button type="button" class={PROVIDER_SECONDARY + ' gb:cloud-provider:w-full gb:cloud-provider:min-w-0 gb:cloud-provider:grid gb:cloud-provider:grid-cols-[minmax(0,1fr)_auto] gb:cloud-provider:gap-2 gb:cloud-provider:text-left' + (normalized(draft) === entry.mint ? ' gb:cloud-provider:ring-2 gb:cloud-provider:ring-accent' : '')} data-routstr-wallet-action="set-mint-input" data-mint-url={entry.mint} aria-pressed={normalized(draft) === entry.mint} disabled={mintState.pending || mintState.loading} onclick={event => choose(event, entry.mint)}>
    <span class="gb:cloud-provider:min-w-0 gb:cloud-provider:break-all"><span class="gb:cloud-provider:block gb:cloud-provider:text-xs">{entry.mint.replace(/^https?:\/\//, '')}</span><span class={PROVIDER_COPY + ' gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:gap-x-3'}>{#if entry.mint === mintState.mint}<span class="gb:cloud-provider:text-success-ink">Current mint</span>{/if}{#if mintState.accepted.includes(entry.mint)}<span>Accepted by node</span>{/if}</span></span>
    <span class="gb:cloud-provider:text-xs gb:cloud-provider:tabular-nums gb:cloud-provider:whitespace-nowrap">{entry.balance === null ? '—' : entry.balance.toLocaleString() + ' sats'}{#if normalized(draft) === entry.mint}<span aria-hidden="true"> ✓</span>{/if}</span>
  </button>
{/snippet}
<section data-wallet-mint-view data-cloud-provider-settings-view aria-label="Mints and balances" class="gb:cloud-provider:mt-3 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0 gb:cloud-provider:text-ink" aria-busy={mintState.loading || mintState.pending}>
  <h3 class="gb:cloud-provider:text-sm gb:cloud-provider:font-semibold gb:cloud-provider:m-0">Mints &amp; balances</h3>
  <p class={PROVIDER_COPY}>Each mint has its own balance. Choose one to deposit, withdraw, or export funds.</p>
  <p class={PROVIDER_COPY}>Saved mint balances</p>
  <div class="gb:cloud-provider:grid gb:cloud-provider:gap-2 gb:cloud-provider:min-w-0">
    {#each mintState.saved as entry (entry.mint)}{@render row(entry)}{/each}
    {#if mintState.loading}<p class={PROVIDER_COPY}>Loading saved balances…</p>{:else if !mintState.saved.length}<p class={PROVIDER_COPY}>No saved balances found.</p>{/if}
  </div>
  {#if mintState.accepted.some(mint => !mintState.saved.some(entry => entry.mint === mint))}
    <p class={PROVIDER_COPY}>Also accepted by this node</p>
    <div class="gb:cloud-provider:grid gb:cloud-provider:gap-2 gb:cloud-provider:min-w-0">{#each mintState.accepted.filter(mint => !mintState.saved.some(entry => entry.mint === mint)) as mint (mint)}{@render row({ mint, balance: null })}{/each}</div>
  {/if}
  {#if mintState.hints === 'loading'}<p class={PROVIDER_COPY}>Checking this node’s accepted mints… Saved balances are already available.</p>{:else if mintState.hints === 'unavailable'}<p class={PROVIDER_COPY}>Node mint list unavailable. Saved balances remain selectable offline.</p>{/if}
  <div class="gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:pt-3 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2 gb:cloud-provider:min-w-0">
    <label for="routstr-mint-input" class={PROVIDER_COPY}>Mint URL</label>
    <input type="url" id="routstr-mint-input" class={PROVIDER_INPUT + ' gb:cloud-provider:font-mono'} value={draft} bind:this={input} oninput={event => flushSync(() => { draft = event.currentTarget.value; })} disabled={mintState.pending} placeholder="https://mint.example.com" spellcheck="false" autocapitalize="none" aria-describedby="routstr-mint-hint" onkeydown={event => { if (event.key === 'Enter' && !mintState.loading && !mintState.pending) { event.preventDefault(); actions.save(); } }}>
    <p id="routstr-mint-hint" class={PROVIDER_COPY}>Choose a mint above or enter another URL. Existing balances stay at their original mint.</p>
  </div>
  <div class={PROVIDER_ACTIONS}>
    <button type="button" class={PROVIDER_PRIMARY} bind:this={select} disabled={mintState.pending || mintState.loading || !mintState.mint} data-routstr-wallet-action="save-mint" onclick={event => { event.stopPropagation(); actions.save(); }}>Select mint</button>
    <button type="button" class={PROVIDER_SECONDARY} data-routstr-wallet-action="cancel-mint" onclick={event => { event.stopPropagation(); actions.cancel(); }}>Cancel</button>
    <button type="button" class={PROVIDER_SECONDARY} disabled={mintState.pending || mintState.loading} onclick={() => actions.reload()}>Reload balances</button>
  </div>
  <div id="routstr-mint-status" aria-live="polite" role="status" class={PROVIDER_COPY + ' gb:cloud-provider:break-words ' + PROVIDER_TONES[mintState.status.tone]}>{mintState.status.text}</div>
</section>
