<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { CustomConnection, CustomSettingsSnapshot, CustomSettingsActions } from '../custom-settings-contract.js';
  import type { ProviderSettingsModels, ProviderSettingsStatus } from '../provider-settings-contract.js';
  import { CATALOG_MANUAL_INPUT, CREDENTIAL_PANEL, CREDENTIAL_COPY, CREDENTIAL_INPUT, PROVIDER_ACTIONS, CREDENTIAL_PRIMARY, CREDENTIAL_SECONDARY, PROVIDER_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { initial, actions }: { initial: CustomSettingsSnapshot; actions: CustomSettingsActions } = $props();
  let snapshot = $state(untrack(() => initial));
  let url = $state(''), key = $state('');
  let urlField: HTMLInputElement | null = $state(null), keyField: HTMLInputElement | null = $state(null), modelField: HTMLInputElement | null = $state(null);
  let manual = $state(untrack(() => initial.models.groups.some(group => group.options.some(option => option.value === initial.models.selectedModel)) ? '' : initial.models.selectedModel));
  let saveState = $state<ProviderSettingsStatus & { pending: boolean }>(untrack(() => ({ pending: false, text: initial.connected ? '✓ Connected' : 'Not connected', tone: initial.connected ? 'success' : 'secondary' })));
  const hasCatalog = $derived(snapshot.models.groups.some(group => group.options.length));
  const customModel = $derived(hasCatalog && !snapshot.models.groups.some(group => group.options.some(option => option.value === snapshot.models.selectedModel)));
  const selection = $derived(customModel ? '__custom' : snapshot.models.selectedModel);
  export function getModels(): ProviderSettingsModels { return snapshot.models; }
  export function setModels(models: ProviderSettingsModels): void {
    if (models.selectedModel !== snapshot.models.selectedModel) manual = models.groups.some(group => group.options.some(option => option.value === models.selectedModel)) ? '' : models.selectedModel;
    snapshot = { ...snapshot, models };
  }
  export function refresh(next: CustomSettingsSnapshot): void { setModels(next.models); snapshot = next; }
  export function setSaveState(next: typeof saveState): void { saveState = next; }
  export function readConnection(): CustomConnection { return { url: urlField?.value ?? url, key: keyField?.value ?? key }; }
  export function setConnection(next: CustomConnection): void { url = next.url; key = next.key; }
  export function readManualModel(): string { return modelField?.value ?? manual; }
  export function clearPrivateFields(): void { url = ''; key = ''; manual = ''; for (const field of [urlField, keyField, modelField]) if (field) field.value = ''; }
  onDestroy(clearPrivateFields);
</script>
<form class={CREDENTIAL_PANEL} data-custom-settings-view data-cloud-provider-settings-view onsubmit={event => { event.preventDefault(); actions.save(); }}>
  <input type="text" name="ai-provider" value="custom" autocomplete="username" hidden>
  <p class={CREDENTIAL_COPY + ' gb:cloud-provider:m-0'}>Connect to any OpenAI-compatible API endpoint. Works with OpenAI, Mistral, Groq, Together, xAI, OpenCode, self-hosted, and more.</p>
  <div id="custom-key-status" class={PROVIDER_TONES[saveState.tone]} role="status" aria-live="polite">{saveState.text}</div>
  <label for="custom-url-input" class={CREDENTIAL_COPY}>Base URL</label>
  <input id="custom-url-input" type="text" class={CREDENTIAL_INPUT} placeholder="https://api.openai.com/v1" autocomplete="url" spellcheck="false" bind:this={urlField} bind:value={url} disabled={saveState.pending}>
  <label for="custom-key-input" class={CREDENTIAL_COPY}>API Key</label>
  <input id="custom-key-input" type="password" class={CREDENTIAL_INPUT} placeholder="sk-..." autocomplete="new-password" bind:this={keyField} bind:value={key} disabled={saveState.pending}>
  <div class={PROVIDER_ACTIONS} aria-busy={saveState.pending}>
    <button type="button" class={CREDENTIAL_PRIMARY} data-provider-panel-action="save-custom-api" disabled={saveState.pending} onclick={event => { event.stopPropagation(); actions.save(); }}>{saveState.pending ? 'Validating...' : 'Save & Validate'}</button>
    {#if snapshot.connected}<button type="button" class={CREDENTIAL_SECONDARY} data-provider-panel-action="remove-custom-api" disabled={saveState.pending} onclick={event => { event.stopPropagation(); actions.remove(); }}>Remove</button>{/if}
  </div>
  {#if snapshot.connected}
    <div id="custom-model-area" class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2 gb:cloud-provider:min-w-0">
      <label class={CREDENTIAL_COPY} for={hasCatalog ? 'custom-model-select' : 'custom-manual-model'}>Model</label>
      {#if hasCatalog}
        <select id="custom-model-select" class={CREDENTIAL_INPUT} data-provider-panel-change="custom-model" value={selection} disabled={saveState.pending} onchange={event => { event.stopPropagation(); actions.select(event.currentTarget.value); }}>
          {#if customModel}<option value="__custom" disabled>Using custom model</option>{/if}
          {#each snapshot.models.groups as group (group.label)}
            {#if group.label}<optgroup label={group.label}>{#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</optgroup>
            {:else}{#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}{/if}
          {/each}
        </select>
        <label class={CREDENTIAL_COPY} for="custom-manual-model">Custom model ID</label>
      {/if}
      <div class={PROVIDER_ACTIONS}>
        <input type="text" id="custom-manual-model" class={(hasCatalog ? CATALOG_MANUAL_INPUT : CREDENTIAL_INPUT) + ' gb:cloud-provider:flex-1'} placeholder={hasCatalog ? 'Or type any model ID and press Enter' : 'e.g. gpt-4o'} data-provider-panel-key="custom-manual-model" bind:this={modelField} bind:value={manual} disabled={saveState.pending} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); actions.apply(); } }}>
        <button type="button" class={CREDENTIAL_SECONDARY} data-provider-panel-action="apply-custom-api-model" disabled={saveState.pending} onclick={event => { event.stopPropagation(); actions.apply(); }}>Apply</button>
      </div>
      <div id="custom-model-pricing" class={CREDENTIAL_COPY + ' ' + PROVIDER_TONES[snapshot.models.pricing.tone]}>{snapshot.models.pricing.text}</div>
    </div>
  {/if}
  <p class={PROVIDER_NOTICE + ' gb:cloud-provider:m-0'}>Direct browser connection only. A connection check never includes your profile, chat, or voice content; some endpoints receive a fixed minimal compatibility probe. After it succeeds, getbased asks once before activating this endpoint for AI requests. Your key and requests go to the endpoint you configure, never through getbased.</p>
</form>
