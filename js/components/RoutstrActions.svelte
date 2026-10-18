<script lang="ts">
  import { ROUTSTR_WALLET_ACTIONS, ROUTSTR_WALLET_MENU, ROUTSTR_NODE_ACTIONS } from '../routstr-settings-contract.js';
  import type { RoutstrActionsState, RoutstrActions } from '../routstr-actions-contract.js';
  import { WALLET_RAIL, WALLET_PRIMARY, WALLET_SECONDARY } from '../provider-settings-classes.js';
  let { state: actionState, actions = { wallet: () => {}, node: () => {} }, menuOpen = $bindable(false) }: { state: RoutstrActionsState; actions?: RoutstrActions; menuOpen?: boolean } = $props();
  let root: HTMLDivElement | null = $state(null), menuRoot: HTMLDivElement | null = $state(null), menuButton: HTMLButtonElement | null = $state(null);
  export function getState(): RoutstrActionsState { return actionState; }
  export function setState(next: RoutstrActionsState): void { actionState = next; if (next.kind !== 'wallet') closeMenu(); }
  export function closeMenu(): void { menuOpen = false; }
  export function invoke(action: string): void {
    if (actionState.kind === 'wallet') {
      if (action === 'menu') { menuOpen = !menuOpen; return; }
      const option = [...ROUTSTR_WALLET_ACTIONS, ...ROUTSTR_WALLET_MENU].find(option => option.id === action);
      if (option) { closeMenu(); actions.wallet(option.id); }
    } else {
      const option = ROUTSTR_NODE_ACTIONS.find(option => option.id === action);
      if (option && (option.id === 'browse' || !!actionState.node && (option.id !== 'withdraw' || actionState.connected))) actions.node(option.id, actionState.node);
    }
  }
  function buttonClass(active: boolean): string {
    return (actionState.compatibility ? 'import-btn ' + (active ? 'import-btn-primary ' : 'import-btn-secondary ') : '') + (active ? WALLET_PRIMARY : WALLET_SECONDARY);
  }
  function outside(event: MouseEvent): void { if (menuOpen && event.target instanceof Node && !menuRoot?.contains(event.target)) closeMenu(); }
  function keydown(event: KeyboardEvent): void {
    const scope = root?.closest('[data-routstr-settings-view],#ai-provider-panel') || root;
    if (event.key === 'Escape' && menuOpen && event.target instanceof Node && scope?.contains(event.target)) { event.preventDefault(); event.stopPropagation(); closeMenu(); menuButton?.focus(); }
  }
</script>
<svelte:document onclickcapture={outside} onkeydowncapture={keydown} />
<div data-routstr-actions-view data-cloud-provider-settings-view bind:this={root} class={WALLET_RAIL + (actionState.kind === 'wallet' ? ' gb:cloud-provider:relative' : '')}>
  {#if actionState.kind === 'wallet'}
    {#each ROUTSTR_WALLET_ACTIONS as action (action.id)}
      <button type="button" class={buttonClass(actionState.active === action.id)} data-routstr-wallet-action="wallet-action" data-wallet-action={action.id} onclick={event => { event.stopPropagation(); invoke(action.id); }}>{action.label}</button>
    {/each}
    <div bind:this={menuRoot}>
      <button type="button" class={buttonClass(ROUTSTR_WALLET_MENU.some(action => action.id === actionState.active))} aria-label="More wallet actions" aria-controls="routstr-wallet-menu" aria-expanded={menuOpen} data-routstr-wallet-action="toggle-wallet-menu" bind:this={menuButton} onclick={event => { event.stopPropagation(); invoke('menu'); }}>⋯</button>
      <div id="routstr-wallet-menu" hidden={!menuOpen} style:display={menuOpen ? 'flex' : 'none'} class="gb:cloud-provider:absolute gb:cloud-provider:right-0 gb:cloud-provider:top-full gb:cloud-provider:mt-1 gb:cloud-provider:z-10 gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-0.5 gb:cloud-provider:rounded-control gb:cloud-provider:border gb:cloud-provider:border-line gb:cloud-provider:bg-secondary-surface gb:cloud-provider:p-1 gb:cloud-provider:min-w-[120px] gb:cloud-provider:shadow-lg">
        {#each ROUTSTR_WALLET_MENU as action (action.id)}
          <button type="button" class={buttonClass(actionState.active === action.id) + ' gb:cloud-provider:text-left'} data-routstr-wallet-action="wallet-action" data-wallet-action={action.id} onclick={event => { event.stopPropagation(); invoke(action.id); }}>{action.label}</button>
        {/each}
      </div>
    </div>
  {:else}
    {#each ROUTSTR_NODE_ACTIONS.filter(action => action.id === 'browse' || !!actionState.node && (action.id !== 'withdraw' || actionState.connected)) as action (action.id)}
      <button type="button" class={buttonClass(actionState.active === action.id)} data-routstr-wallet-action="node-action" data-node-action={action.id} data-node-url={action.id === 'deposit' ? actionState.node : undefined} onclick={event => { event.stopPropagation(); invoke(action.id); }}>{action.label}</button>
    {/each}
  {/if}
</div>
