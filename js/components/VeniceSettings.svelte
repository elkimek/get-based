<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { VeniceModelState, VeniceModeState, VeniceSaveState, VeniceSettingsSnapshot, VeniceStatus } from '../venice-settings-contract.js';
  import { CREDENTIAL_PANEL, CREDENTIAL_COPY, CREDENTIAL_INPUT, PROVIDER_ACTIONS, CREDENTIAL_PRIMARY, CREDENTIAL_SECONDARY, PROVIDER_LINK, PROVIDER_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';

  let { initial }: { initial: VeniceSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let key = $state('');
  let keyInput: HTMLInputElement | null = $state(null);
  let saveState = $state<VeniceSaveState>(untrack(() => ({ pending: false, text: initial.connected ? '✓ Connected' : 'No key set', tone: initial.connected ? 'success' : 'secondary' })));
  let balance = $state<VeniceStatus>({ text: 'Balance: loading...', tone: 'secondary' });
  const hasCatalog = $derived(snapshot.models.groups.some(group => group.options.length));
  const unavailableModel = $derived(hasCatalog && !snapshot.models.groups.some(group => group.options.some(option => option.value === snapshot.models.selectedModel)));

  export function setModels(models: VeniceModelState): void { snapshot = { ...snapshot, models }; }
  export function getModels(): VeniceModelState { return snapshot.models; }
  export function setMode(mode: VeniceModeState): void { snapshot = { ...snapshot, mode }; }
  export function refresh(next: VeniceSettingsSnapshot): void { snapshot = next; }
  export function setSaveState(state: VeniceSaveState): void { saveState = state; }
  export function setBalance(status: VeniceStatus): void { balance = status; }
  export function readKey(): string { return keyInput?.value ?? key; }
  export function setStoredKey(value: string): void { key = value; }
  export function clearKey(): void { key = ''; if (keyInput) keyInput.value = ''; }
  onDestroy(clearKey);
</script>

<form class={CREDENTIAL_PANEL} data-venice-settings-view data-cloud-provider-settings-view onsubmit={event => event.preventDefault()}>
  <input type="text" name="ai-provider" value="venice" autocomplete="username" hidden>
  <div class={CREDENTIAL_COPY}>Hosted Venice models with an optional encrypted-message mode. Requires an API key.</div>
  <div id="venice-key-status" class={PROVIDER_TONES[saveState.tone]} role="status" aria-live="polite">{saveState.text}</div>
  <label for="venice-key-input" class={CREDENTIAL_COPY}>API key</label>
  <input type="password" id="venice-key-input" class={CREDENTIAL_INPUT} placeholder="venice-..." autocomplete="new-password" bind:this={keyInput} bind:value={key} disabled={saveState.pending}>
  <div class={PROVIDER_ACTIONS} aria-busy={saveState.pending}>
    <button type="button" id="save-venice-key-btn" class={CREDENTIAL_PRIMARY} data-provider-panel-action="save-venice-key" disabled={saveState.pending}>{saveState.pending ? 'Validating...' : 'Save & Validate'}</button>
    {#if snapshot.connected}<button type="button" class={CREDENTIAL_SECONDARY} data-provider-panel-action="remove-venice-key" disabled={saveState.pending}>Remove Key</button>{/if}
  </div>
  {#if snapshot.connected}
    <div class={PROVIDER_ACTIONS}>
      <span id="venice-balance" class={CREDENTIAL_COPY + ' ' + PROVIDER_TONES[balance.tone]} role="status">{balance.text}</span>
      <button type="button" class={CREDENTIAL_SECONDARY} data-provider-panel-action="refresh-venice-balance" title="Refresh Venice balance" aria-label="Refresh Venice balance">↻</button>
    </div>
  {/if}
  <div id="venice-model-area" class="gb:cloud-provider:min-w-0">
    {#if hasCatalog}
      <label for="venice-model-select" class={CREDENTIAL_COPY}>Model</label>
      <select id="venice-model-select" class={CREDENTIAL_INPUT} data-provider-panel-change="venice-model" bind:value={snapshot.models.selectedModel}>
        {#if unavailableModel}<option value={snapshot.models.selectedModel} disabled>Saved model unavailable: {snapshot.models.selectedModel}</option>{/if}
        {#each snapshot.models.groups as group (group.label)}
          {#if group.label}
            <optgroup label={group.label}>{#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</optgroup>
          {:else}
            {#each group.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
          {/if}
        {/each}
      </select>
      <div id="venice-model-pricing" class={CREDENTIAL_COPY + ' ' + PROVIDER_TONES[snapshot.models.pricing.tone]}>{snapshot.models.pricing.text}</div>
    {:else}
      <div class={CREDENTIAL_COPY}>Model: <span class="gb:cloud-provider:text-ink">{snapshot.models.modelDisplay}</span>{#if snapshot.connected} <span>(save key to load models)</span>{/if}</div>
    {/if}
  </div>
  {#if snapshot.mode.available || snapshot.mode.enabled || snapshot.mode.active}
    <div class={PROVIDER_ACTIONS}>
      <SettingsToggle id="venice-e2ee-toggle" label="Encrypted Mode" checked={snapshot.mode.enabled} providerChange="venice-e2ee" touch="coarse" />
      <span class="gb:cloud-provider:text-sm">Encrypted Mode</span>
    </div>
    {#if snapshot.mode.enabled && !snapshot.mode.available}
      <div class={CREDENTIAL_COPY} role="status">Encrypted model catalog unavailable. Save your key to refresh it. Encrypted mode remains enabled.</div>
    {/if}
    <div id="venice-e2ee-indicator" class={CREDENTIAL_COPY} hidden={!snapshot.mode.active}>
      <div><strong class="gb:cloud-provider:text-ink">🔒 TEE + GPU checked</strong> — Messages are encrypted in your browser and decrypted inside Venice's confidential-computing session. Before connecting, getbased checks both the Intel TDX environment and NVIDIA GPU evidence.</div>
      <details class="gb:cloud-provider:mt-2">
        <summary class={PROVIDER_LINK + ' gb:cloud-provider:cursor-pointer gb:cloud-provider:[@media(pointer:coarse)]:min-h-11 gb:cloud-provider:[@media(pointer:coarse)]:py-3'}>What is checked — and what is not</summary>
        <div class="gb:cloud-provider:mt-2 gb:cloud-provider:pl-3 gb:cloud-provider:border-l-2 gb:cloud-provider:border-line">
          <div><strong class="gb:cloud-provider:text-ink">Checked in your browser</strong><br>Session freshness, encryption-key binding, debug mode, the Intel TDX confidential-computing environment (TEE, verified with DCAP), and NVIDIA's signed GPU result (NRAS).</div>
          <div class="gb:cloud-provider:mt-2"><strong class="gb:cloud-provider:text-ink">Important limit</strong><br>The TDX and GPU checks are valid independently, but they do not prove that both are running together. Approved code measurements and the source of each response are not yet independently verified.</div>
          <div class="gb:cloud-provider:mt-2"><strong class="gb:cloud-provider:text-ink">Who sees what</strong><br>Venice still sees your API key, model, roles, request settings, timing, sizes, and network metadata. Because NVIDIA does not accept browser POSTs, the deployment proxy relays GPU evidence to NRAS; getbased verifies the signed result in your browser. NVIDIA learns that an attestation was checked. Web search and images are disabled.</div>
        </div>
      </details>
    </div>
  {/if}
  <div class={PROVIDER_NOTICE}>Your key is stored locally and sent directly to Venice AI. Requests are handled under Venice's privacy and retention policies; getbased does not independently verify provider-side logging. <a class={PROVIDER_LINK} href="https://venice.ai/chat?ref=lZ4P1b" target="_blank" rel="noopener">Get an API key</a></div>
</form>
