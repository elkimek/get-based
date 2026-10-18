<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { LocalAiSettingsSnapshot, LocalAiSettingsActions, LocalAiAdvisor, LocalAiConnection } from '../local-ai-settings-contract.js';
  import { PROVIDER_PANEL, PROVIDER_COPY, PROVIDER_INPUT, PROVIDER_ACTIONS, PROVIDER_SECONDARY, PROVIDER_LINK, PROVIDER_NOTICE, PROVIDER_TONES } from '../provider-settings-classes.js';
  let { initial, actions }: { initial: LocalAiSettingsSnapshot; actions: LocalAiSettingsActions } = $props();
  let snapshot = $state(untrack(() => initial));
  let url = $state(''), apiKey = $state('');
  let urlField: HTMLInputElement | null = $state(null), keyField: HTMLInputElement | null = $state(null), overrideField: HTMLInputElement | null = $state(null);
  let status = $state<'testing' | 'connected' | 'disconnected'>('testing'), message = $state('Checking connection...'), pending = $state(false);
  let overrideOpen = $state(untrack(() => initial.advisor?.overrideOpen || false));
  let overrideDraft = $state(untrack(() => initial.advisor?.override || undefined));
  export function refresh(next: LocalAiSettingsSnapshot): void { setAdvisor(next.advisor); snapshot = next; }
  export function setStatus(next: typeof status, text: string, busy = false): void { status = next; message = text; pending = busy; }
  export function getStatus() { return { status, text: message }; }
  export function getSnapshot(): LocalAiSettingsSnapshot { return snapshot; }
  export function setAdvisor(advisor: LocalAiAdvisor | null, models = snapshot.models): void {
    if (advisor && (!snapshot.advisor || advisor.local !== snapshot.advisor.local)) overrideOpen = advisor.overrideOpen;
    if (advisor && advisor.override !== snapshot.advisor?.override) overrideDraft = advisor.override || undefined;
    snapshot = { ...snapshot, advisor, models };
  }
  export function readConnection(): LocalAiConnection { return { url: urlField?.value ?? url, apiKey: keyField?.value ?? apiKey }; }
  export function setConnection(connection: LocalAiConnection): void { url = connection.url; apiKey = connection.apiKey; }
  export function clearPrivateFields(): void { url = ''; apiKey = ''; overrideDraft = undefined; for (const field of [urlField, keyField, overrideField]) if (field) field.value = ''; }
  onDestroy(clearPrivateFields);
  const part = 'gb:cloud-provider:px-3 gb:cloud-provider:py-2.5 gb:cloud-provider:border-t gb:cloud-provider:border-line';
</script>
<form class={PROVIDER_PANEL} data-local-ai-settings-view data-cloud-provider-settings-view onsubmit={event => { event.preventDefault(); actions.test(); }}>
  <input type="text" name="ai-provider" value="local-ai" autocomplete="username" hidden>
  <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>Connects directly to an OpenAI-compatible server. {snapshot.locationCopy} Cloud-tagged models are not considered private/local. Works with <a class={PROVIDER_LINK} href="https://ollama.com" target="_blank" rel="noopener">Ollama</a>, <a class={PROVIDER_LINK} href="https://lmstudio.ai" target="_blank" rel="noopener">LM Studio</a>, <a class={PROVIDER_LINK} href="https://unsloth.ai" target="_blank" rel="noopener">Unsloth Studio</a>, <a class={PROVIDER_LINK} href="https://jan.ai" target="_blank" rel="noopener">Jan</a>, llama.cpp, LocalAI, and others.</p>
  {#if snapshot.insecureRemote}<p class={PROVIDER_NOTICE + ' ' + PROVIDER_TONES.warning}>This remote connection uses plain HTTP. Health data and API credentials are not protected by HTTPS unless your underlying VPN/tunnel encrypts the connection.</p>{/if}
  <div id="local-ai-status" class={PROVIDER_COPY + ' gb:cloud-provider:flex gb:cloud-provider:items-center gb:cloud-provider:gap-2'} role="status" aria-live="polite">
    <span id="local-ai-dot" aria-hidden="true" class="local-ai-status-dot {status === 'testing' ? '' : status} gb:cloud-provider:w-2 gb:cloud-provider:h-2 gb:cloud-provider:rounded-full gb:cloud-provider:shrink-0 {status === 'connected' ? 'gb:cloud-provider:bg-success' : status === 'disconnected' ? 'gb:cloud-provider:bg-danger' : 'gb:cloud-provider:bg-muted'}"></span>
    <span id="local-ai-status-text">{message}</span>
  </div>
  <label for="local-ai-url-input" class={PROVIDER_COPY}>Server address</label>
  <div class={PROVIDER_ACTIONS} aria-busy={pending}>
    <input id="local-ai-url-input" class={PROVIDER_INPUT + ' gb:cloud-provider:flex-1'} type="text" placeholder="http://localhost:11434" autocomplete="url" spellcheck="false" bind:this={urlField} bind:value={url} disabled={pending}>
    <button type="button" class={PROVIDER_SECONDARY} data-provider-panel-action="test-ollama-connection" disabled={pending} onclick={event => { event.stopPropagation(); actions.test(); }}>Test</button>
  </div>
  <label for="local-ai-apikey-input" class={PROVIDER_COPY}>API Key <span>(optional — most local servers don't need one)</span></label>
  <input id="local-ai-apikey-input" class={PROVIDER_INPUT} type="password" placeholder="Leave empty if not required" autocomplete="new-password" bind:this={keyField} bind:value={apiKey} disabled={pending}>
  <div id="local-ai-model-section" style:display={snapshot.models.length ? 'block' : 'none'}>
    <label for="local-ai-model-select" class={PROVIDER_COPY}>AI Model</label>
    <select id="local-ai-model-select" class={PROVIDER_INPUT} value={snapshot.selectedModel} data-provider-panel-change="local-ai-model" disabled={pending} onchange={event => { event.stopPropagation(); actions.select(event.currentTarget.value); }}>
      {#each snapshot.models as model (model.value)}<option value={model.value}>{model.label}</option>{/each}
    </select>
    <p class={PROVIDER_COPY + ' ' + PROVIDER_TONES[snapshot.pricing.tone]}>{snapshot.pricing.text}</p>
  </div>
  <div id="local-ai-advisor">
    {#if snapshot.advisor}
      {@const advisor = snapshot.advisor}
      <div class="model-advisor gb:cloud-provider:mt-3 gb:cloud-provider:rounded-control gb:cloud-provider:border gb:cloud-provider:border-line gb:cloud-provider:overflow-hidden">
        <div class="model-advisor-hw {PROVIDER_COPY} gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:gap-3 gb:cloud-provider:px-3 gb:cloud-provider:py-2.5 gb:cloud-provider:bg-secondary-surface">
          {#each advisor.chips as chip}<span class="model-advisor-hw-chip gb:cloud-provider:min-w-0 gb:cloud-provider:break-words">{chip}</span>{/each}
        </div>
        {#each advisor.rows as row (row.name)}
          <div class="model-advisor-row {row.active ? 'active gb:cloud-provider:bg-secondary-surface' : ''} gb:cloud-provider:px-3 gb:cloud-provider:py-[7px] gb:cloud-provider:border-t gb:cloud-provider:border-line {PROVIDER_COPY} gb:cloud-provider:grid gb:cloud-provider:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gb:cloud-provider:items-center gb:cloud-provider:gap-2 gb:cloud-provider:max-[600px]:grid-cols-[auto_minmax(0,1fr)]">
            <span class="model-advisor-badge gb:cloud-provider:text-[13px] gb:cloud-provider:leading-none {PROVIDER_TONES[row.tone]}" aria-hidden="true">{row.badge}</span>
            <span class="model-advisor-name gb:cloud-provider:font-medium gb:cloud-provider:break-words">{row.name}{#if row.active} <span>← active</span>{:else if row.best} <span>← best pick</span>{/if}</span>
            <span class="model-advisor-size gb:cloud-provider:max-[600px]:col-start-2 gb:cloud-provider:break-words">{[row.size, row.details].filter(Boolean).join(' · ')}</span>
            <span class="model-advisor-fitness gb:cloud-provider:text-[11px] gb:cloud-provider:max-[600px]:col-start-2 {PROVIDER_TONES[row.fitnessTone]}" title={row.fitnessNote}>{row.fitness}</span>
            <span class="model-advisor-verdict gb:cloud-provider:text-[11px] gb:cloud-provider:max-[600px]:col-start-2 {PROVIDER_TONES[row.tone]}">{row.verdict}</span>
          </div>
        {/each}
        {#if advisor.suggestion}
          <div class="model-advisor-suggest {part} {PROVIDER_COPY}">
            <div class="model-advisor-suggest-title gb:cloud-provider:text-[11px] gb:cloud-provider:font-bold gb:cloud-provider:uppercase gb:cloud-provider:tracking-[0.06em] gb:cloud-provider:mb-2">Heuristic model suggestion</div>
            <div class="model-advisor-pull-row {PROVIDER_ACTIONS}">
              <code class="model-advisor-pull-cmd gb:cloud-provider:flex-1 gb:cloud-provider:min-w-0 gb:cloud-provider:break-all">{advisor.suggestion.command || advisor.suggestion.model}</code>
              {#if advisor.suggestion.command}<button type="button" class={PROVIDER_SECONDARY} data-local-ai-action="copy-pull" onclick={event => { event.stopPropagation(); actions.copy(advisor.suggestion!.command!); }}>Copy</button>{/if}
            </div>
            <p class="model-advisor-pull-why gb:cloud-provider:text-[11px] gb:cloud-provider:text-secondary gb:cloud-provider:mb-2">{advisor.suggestion.note} Validate quality with Import Benchmarks on your own reports; this suggestion is not benchmark-derived.</p>
          </div>
        {/if}
        <div class="model-advisor-override gb:cloud-provider:px-3 gb:cloud-provider:py-2 gb:cloud-provider:border-t gb:cloud-provider:border-line">
          <button type="button" class="model-advisor-override-toggle gb:cloud-provider:text-[11px] gb:cloud-provider:text-secondary gb:cloud-provider:[font-family:inherit] gb:cloud-provider:border-0 gb:cloud-provider:bg-transparent gb:cloud-provider:p-0 gb:cloud-provider:cursor-pointer gb:cloud-provider:[@media(pointer:coarse)]:min-h-11 gb:cloud-provider:focus-visible:outline-2 gb:cloud-provider:focus-visible:outline-accent" aria-expanded={overrideOpen} aria-controls="model-advisor-override-body" data-local-ai-action="toggle-override" onclick={event => { event.stopPropagation(); overrideOpen = !overrideOpen; }} onkeydown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); overrideOpen = !overrideOpen; } }}>▸ {advisor.overrideLabel}{advisor.override ? ` (${advisor.override} GB)` : ''}</button>
          <div id="model-advisor-override-body" class="model-advisor-override-body {PROVIDER_ACTIONS} gb:cloud-provider:mt-2" style:display={overrideOpen ? 'flex' : 'none'}>
            <label for="hw-vram-override-input" class={PROVIDER_COPY}>VRAM (GB)</label>
            <input type="number" id="hw-vram-override-input" class="gb:cloud-provider:w-[72px] gb:cloud-provider:min-w-0 gb:cloud-provider:text-xs gb:cloud-provider:px-2 gb:cloud-provider:py-1 gb:cloud-provider:rounded gb:cloud-provider:border gb:cloud-provider:border-line gb:cloud-provider:bg-surface gb:cloud-provider:text-ink gb:cloud-provider:[font-family:inherit] gb:cloud-provider:[@media(pointer:coarse)]:min-h-11" placeholder={advisor.overridePlaceholder} min="1" max="256" step="1" bind:this={overrideField} bind:value={overrideDraft}>
            <button type="button" class={PROVIDER_SECONDARY} data-local-ai-action="apply-hardware-override" onclick={event => { event.stopPropagation(); actions.applyOverride(overrideField?.value || ''); }}>Apply</button>
            {#if advisor.override}<button type="button" class={PROVIDER_SECONDARY} data-local-ai-action="clear-hardware-override" onclick={event => { event.stopPropagation(); actions.clearOverride(); }}>Reset</button>{/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
  <p class={PROVIDER_NOTICE + ' gb:cloud-provider:m-0'}>Connects via <code>/v1/chat/completions</code>. Test the server address above for endpoint-specific connection guidance.</p>
</form>
