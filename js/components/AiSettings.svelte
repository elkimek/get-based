<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { AiSettingsSnapshot, AiSettingsActions } from '../ai-settings-contract.js';
  let { initial,actions }: { initial:AiSettingsSnapshot; actions:AiSettingsActions } = $props();
  let snapshot = $state(untrack(() => initial)), phase = $state<'loading'|'ready'|'error'>('loading'), pauseError = $state('');
  let providerHost: HTMLElement | null = $state(null);
  export function getSnapshot(): AiSettingsSnapshot { return snapshot; }
  export function setEnabled(enabled: boolean): void { snapshot = { ...snapshot,enabled }; }
  export function setSelected(activeProvider: string): void { snapshot = { ...snapshot,activeProvider }; }
  export function setProviderStatus(value: 'loading'|'ready'|'error'): void { phase = value; }
  export function setPauseError(message: string): void { pauseError = message; }
  export function getProviderHost(): HTMLElement | null { return providerHost; }
</script>
<div data-ai-settings-view class="gb:ai:@container gb:ai:min-w-0 gb:ai:text-ink">
  <div class="gb:ai:mb-4 gb:ai:rounded-xl gb:ai:border gb:ai:border-line gb:ai:bg-surface gb:ai:p-4">
    <div class="gb:ai:flex gb:ai:items-center gb:ai:justify-between gb:ai:gap-3">
      <strong class="gb:ai:text-sm">AI features</strong>
      <SettingsToggle id="ai-pause-toggle" label="AI features" checked={snapshot.enabled} action="toggle-ai-pause" touch onToggle={actions.pause} />
    </div>
    {#if pauseError}<p class="gb:ai:mt-2 gb:ai:text-xs gb:ai:text-danger-ink" role="status">{pauseError}</p>{/if}
  </div>
  <div id="ai-provider-settings" hidden={snapshot.hideProviders}>
    <h3 class="gb:ai:mb-2 gb:ai:mt-0 gb:ai:px-1 gb:ai:text-sm gb:ai:font-semibold">AI providers</h3>
    <div id="ai-provider-advanced-section" class="gb:ai:mb-4 gb:ai:min-w-0 gb:ai:rounded-xl gb:ai:border gb:ai:border-line gb:ai:bg-surface gb:ai:p-4">
      <strong class="gb:ai:mb-2.5 gb:ai:block gb:ai:text-sm">Choose how getbased runs AI</strong>
      <p class="gb:ai:mb-3 gb:ai:mt-0 gb:ai:rounded-r-control gb:ai:border-l-[3px] gb:ai:border-accent gb:ai:bg-hover gb:ai:px-3 gb:ai:py-2 gb:ai:text-xs gb:ai:leading-relaxed gb:ai:text-secondary">Use an API provider, a locally served model, or an installed CLI agent with its existing account or configured provider.<br>Stick with the same model across imports to keep marker keys consistent.</p>
      <div class="ai-provider-toggle gb:ai:flex gb:ai:gap-0.5 gb:ai:max-[720px]:flex-wrap gb:ai:max-[720px]:gap-1.5 gb:ai:@max-[580px]:flex-wrap gb:ai:@max-[580px]:gap-1.5" role="group" aria-label="AI providers">
        {#each snapshot.choices as choice (choice.id)}
          <button type="button" class="ai-provider-btn gb:ai:inline-flex gb:ai:min-h-11 gb:ai:min-w-0 gb:ai:flex-[1_1_auto] gb:ai:cursor-pointer gb:ai:items-center gb:ai:justify-center gb:ai:gap-[3px] gb:ai:whitespace-nowrap gb:ai:rounded-control gb:ai:border gb:ai:px-[3px] gb:ai:py-1.5 gb:ai:font-body gb:ai:text-xs gb:ai:font-medium gb:ai:focus-visible:outline-2 gb:ai:focus-visible:outline-offset-2 gb:ai:focus-visible:outline-accent gb:ai:max-[720px]:basis-[calc(50%-3px)] gb:ai:max-[720px]:px-2 gb:ai:@max-[580px]:basis-[calc(50%-3px)] gb:ai:@max-[580px]:px-2 {snapshot.activeProvider === choice.id ? 'active gb:ai:border-accent gb:ai:bg-accent gb:ai:text-on-accent' : 'gb:ai:border-line gb:ai:bg-surface gb:ai:text-secondary gb:ai:hover:bg-hover'}" data-provider={choice.id} aria-pressed={snapshot.activeProvider === choice.id} data-settings-action={choice.id === 'cli' ? 'show-cli-agent-provider' : 'switch-ai-provider'} onclick={event => { event.stopPropagation(); actions.select(choice.id,event.currentTarget); }}>
            {#if choice.asset}<img class="ai-provider-logo gb:ai:size-3.5 gb:ai:shrink-0 gb:ai:max-[480px]:size-3" src={choice.asset} alt="">
            {:else if choice.path}<svg class="ai-provider-logo gb:ai:size-3.5 gb:ai:shrink-0 gb:ai:max-[480px]:size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={choice.path}></path></svg>
            {:else}<svg class="ai-provider-logo gb:ai:size-3.5 gb:ai:shrink-0 gb:ai:max-[480px]:size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 7 4 5-4 5"></path><path d="M11 17h8"></path></svg>{/if}
            {choice.label}
          </button>
        {/each}
      </div>
      {#if phase !== 'ready'}<p class="gb:ai:mb-0 gb:ai:mt-3 gb:ai:text-xs gb:ai:leading-relaxed gb:ai:text-secondary" role="status">{phase === 'loading' ? 'Loading provider settings...' : 'Provider settings could not load. Reopen Settings to retry.'}</p>{/if}
      <div id="ai-provider-panel" class="gb:ai:mt-3 gb:ai:min-w-0" aria-busy={phase === 'loading'} bind:this={providerHost}></div>
    </div>
  </div>
</div>
