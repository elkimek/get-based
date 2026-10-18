<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { OpenRouterModelState, OpenRouterSaveState, OpenRouterSettingsSnapshot, OpenRouterStatus } from '../openrouter-settings-contract.js';
  import { CATALOG_MANUAL_INPUT } from '../provider-settings-classes.js';
  import { OR_PANEL, OR_COPY, OR_INPUT, OR_ACTIONS, OR_PRIMARY, OR_SECONDARY, OR_LINK, OR_NOTICE, OR_TONES } from '../openrouter-settings-classes.js';

  let { initial }: { initial: OpenRouterSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let key = $state('');
  let keyInput: HTMLInputElement | null = $state(null);
  let manualModel = $state('');
  let saveState = $state<OpenRouterSaveState>(untrack(() => ({ pending: false, text: initial.connected ? '✓ Connected' : 'No key set', tone: initial.connected ? 'success' : 'secondary' })));
  manualModel = untrack(() => initial.models.groups.some(group => group.options.some(option => option.value === initial.models.selectedModel)) ? '' : initial.models.selectedModel);
  let balance = $state<OpenRouterStatus>({ text: 'Balance: loading...', tone: 'secondary' });
  let modelCheck = $state<'idle' | 'pending' | 'success' | 'error'>('idle');
  let modelMessage = $state('');
  const hasCatalog = $derived(snapshot.models.groups.some(group => group.options.length));
  const customModel = $derived(hasCatalog && !snapshot.models.groups.some(group => group.options.some(option => option.value === snapshot.models.selectedModel)));
  let selectedModel = $derived(customModel ? '__custom' : snapshot.models.selectedModel);

  export function setModels(models: OpenRouterModelState): void {
    if (models.selectedModel !== snapshot.models.selectedModel) {
      manualModel = models.groups.some(group => group.options.some(option => option.value === models.selectedModel)) ? '' : models.selectedModel;
      modelCheck = 'idle';
      modelMessage = '';
    }
    snapshot = { ...snapshot, models };
  }
  export function refresh(next: OpenRouterSettingsSnapshot): void {
    setModels(next.models);
    snapshot = next;
  }
  export function getModels(): OpenRouterModelState { return snapshot.models; }
  export function readKey(): string { return keyInput?.value ?? key; }
  export function setStoredKey(value: string): void { key = value; }
  export function clearKey(): void { key = ''; if (keyInput) keyInput.value = ''; }
  export function setSaveState(state: OpenRouterSaveState): void { saveState = state; }
  export function setBalance(status: OpenRouterStatus): void { balance = status; }
  export function setModelCheck(state: typeof modelCheck, message = ''): void { modelCheck = state; modelMessage = message; }
  onDestroy(clearKey);
</script>

<form class={OR_PANEL} data-openrouter-settings-view data-cloud-provider-settings-view onsubmit={event => event.preventDefault()}>
  <input type="text" name="ai-provider" value="openrouter" autocomplete="username" hidden>
  <div class={OR_COPY}>API marketplace routing to 200+ models (Claude, GPT, Llama, Gemini, and more). Pay-per-use with a single key.</div>
  {#if !snapshot.connected}
    <button type="button" class={OR_PRIMARY} data-provider-panel-action="start-openrouter-oauth" disabled={saveState.pending}>Connect with OpenRouter</button>
    <div class={OR_COPY + ' gb:cloud-provider:text-center'}>or enter key manually</div>
  {/if}
  <div id="openrouter-key-status" class={OR_TONES[saveState.tone]} role="status" aria-live="polite">{saveState.text}</div>
  <label for="openrouter-key-input" class={OR_COPY}>API key</label>
  <input type="password" id="openrouter-key-input" class={OR_INPUT} placeholder="sk-or-..." autocomplete="new-password" bind:this={keyInput} bind:value={key} disabled={saveState.pending}>
  <div class={OR_ACTIONS} aria-busy={saveState.pending}>
    <button type="button" id="save-openrouter-key-btn" class={OR_PRIMARY} data-provider-panel-action="save-openrouter-key" disabled={saveState.pending}>{saveState.pending ? 'Validating...' : 'Save & Validate'}</button>
    {#if snapshot.connected}<button type="button" class={OR_SECONDARY} data-provider-panel-action="remove-openrouter-key" disabled={saveState.pending}>Remove Key</button>{/if}
  </div>
  {#if snapshot.connected}
    <div class={OR_ACTIONS}>
      <span id="or-balance" class={OR_COPY + ' ' + OR_TONES[balance.tone]} role="status">{balance.text}</span>
      <button type="button" class={OR_SECONDARY} data-provider-panel-action="refresh-openrouter-balance" title="Refresh OpenRouter balance" aria-label="Refresh OpenRouter balance">↻</button>
    </div>
  {/if}
  <div id="openrouter-model-area" class="gb:cloud-provider:min-w-0">
    {#if hasCatalog}
      <label class={OR_COPY} for="openrouter-model-select">Model</label>
      <select id="openrouter-model-select" class={OR_INPUT} data-provider-panel-change="openrouter-model" value={selectedModel}>
        {#if customModel}<option value="__custom" disabled>Using custom model</option>{/if}
        {#each snapshot.models.groups as group (group.label)}
          {#if group.label}
            <optgroup label={group.label}>{#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</optgroup>
          {:else}
            {#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
          {/if}
        {/each}
      </select>
      <label class={OR_COPY + ' gb:cloud-provider:mt-2 gb:cloud-provider:block'} for="openrouter-custom-model">Custom model ID</label>
      <div class={OR_ACTIONS + ' gb:cloud-provider:flex-nowrap'}>
        <input type="text" id="openrouter-custom-model" data-model-check={modelCheck} class={CATALOG_MANUAL_INPUT + (modelCheck === 'error' ? ' gb:cloud-provider:border-danger' : modelCheck === 'success' ? ' gb:cloud-provider:border-success-ink' : '')} placeholder="Or enter model ID (e.g. arcee-ai/trinity-large-preview:free)" data-provider-panel-key="openrouter-custom-model" bind:value={manualModel}>
        <span id="openrouter-model-health" title={modelMessage} role="status" aria-label={modelMessage || 'Model connection status'} class={modelCheck === 'error' ? OR_TONES.danger : modelCheck === 'success' ? OR_TONES.success : OR_TONES.secondary}>{modelCheck === 'pending' ? '⏳' : modelCheck === 'success' ? '✓' : modelCheck === 'error' ? '✗' : ''}</span>
      </div>
      <div class={OR_COPY}>Press Enter to apply — checks model connectivity</div>
      <div id="openrouter-model-pricing" class={OR_COPY + ' ' + OR_TONES[snapshot.models.pricing.tone]}>{snapshot.models.pricing.text}</div>
    {:else}
      <div class={OR_COPY}>Model: <span class="gb:cloud-provider:text-ink">{snapshot.models.modelDisplay}</span>{#if snapshot.connected} <span>(save key to load models)</span>{/if}</div>
    {/if}
  </div>
  <div class={OR_NOTICE}>Your key is stored locally and sent directly to OpenRouter. <a class={OR_LINK} href="https://openrouter.ai/keys" target="_blank" rel="noopener">Get an API key</a> · <a class={OR_LINK} href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener">Add credits</a></div>
</form>
