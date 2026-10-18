<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { RoutstrModelSettingsSnapshot } from '../routstr-model-settings-contract.js';
  import type { ProviderSettingsModels, ProviderSettingsMode } from '../provider-settings-contract.js';
  import { PROVIDER_COPY, PROVIDER_INPUT, PROVIDER_ACTIONS, PROVIDER_TONES, PROVIDER_NOTICE } from '../provider-settings-classes.js';

  let { initial }: { initial: RoutstrModelSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  const hasCatalog = $derived(snapshot.models.groups.some(group => group.options.length));
  const unavailableModel = $derived(hasCatalog && !snapshot.models.groups.some(group => group.options.some(option => option.value === snapshot.models.selectedModel)));
  export function refresh(next: RoutstrModelSettingsSnapshot): void { snapshot = next; }
  export function getModels(): ProviderSettingsModels { return snapshot.models; }
  export function setModels(models: ProviderSettingsModels): void { snapshot = { ...snapshot, models }; }
  export function setMode(mode: ProviderSettingsMode): void { snapshot = { ...snapshot, mode }; }
</script>

<section data-routstr-model-settings-view data-cloud-provider-settings-view aria-label="Routstr model settings" class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0 gb:cloud-provider:text-ink">
  <div id="routstr-model-area" class="gb:cloud-provider:min-w-0">
    {#if hasCatalog}
      <label for="routstr-model-select" class={PROVIDER_COPY}>Model</label>
      <select id="routstr-model-select" class={PROVIDER_INPUT} data-provider-panel-change="routstr-model" bind:value={snapshot.models.selectedModel}>
        {#if unavailableModel}<option value={snapshot.models.selectedModel} disabled>Saved model unavailable: {snapshot.models.selectedModel}</option>{/if}
        {#each snapshot.models.groups as group (group.label)}
          {#if group.label}
            <optgroup label={group.label}>{#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</optgroup>
          {:else}
            {#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
          {/if}
        {/each}
      </select>
      <div id="routstr-model-pricing" class={PROVIDER_COPY + ' ' + PROVIDER_TONES[snapshot.models.pricing.tone]}>{snapshot.models.pricing.text}</div>
    {:else}
      <div class={PROVIDER_COPY}>Model: <span class="gb:cloud-provider:text-ink gb:cloud-provider:break-all">{snapshot.models.modelDisplay}</span>{#if snapshot.connected} <span>(connect to a node to load models)</span>{/if}</div>
    {/if}
  </div>
  <div id="routstr-private-controls" class="gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2" style:display={snapshot.mode.available || snapshot.mode.enabled ? '' : 'none'}>
    <div class={PROVIDER_ACTIONS}>
      <SettingsToggle id="routstr-private-toggle" label="Private TEE Mode" checked={snapshot.mode.enabled} providerChange="routstr-private-mode" touch="coarse" />
      <span class="gb:cloud-provider:text-sm">Private TEE Mode</span>
    </div>
    {#if snapshot.mode.enabled && !snapshot.mode.active}
      <div class={PROVIDER_NOTICE} role="status">The saved private model is unavailable in this node's cached catalog. Refresh the node's models or choose an available private model. Private mode remains selected; getbased will verify the TEE before sending messages.</div>
    {/if}
    <div id="routstr-private-indicator" class={PROVIDER_COPY} hidden={!snapshot.mode.active}>
      <span class="gb:cloud-provider:text-success-ink">🔒</span> Prompts and responses are encrypted in your browser and decrypted only inside a verified Tinfoil TEE. The node still sees your session, selected model, and billing metadata. Web search and images are disabled.
    </div>
  </div>
</section>
