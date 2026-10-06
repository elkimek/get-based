<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { VoiceKind } from '../../types/voice-local.js';
  import type { VoiceSettingsSnapshot, VoiceField, VoiceModelView } from '../settings-voice-contract.js';
  import { voiceActionId } from '../settings-voice-contract.js';
  import { VOICE_COPY, VOICE_TITLE, VOICE_DESCRIPTION, VOICE_ROW, VOICE_CONNECTION_ROW, VOICE_CARD, VOICE_CONTROL, VOICE_INPUT, VOICE_SELECT, VOICE_LINK, VOICE_BUTTON, VOICE_MODEL_BUTTON, VOICE_ACTIONS, VOICE_GROUP } from '../settings-voice-classes.js';
  let { initial }: { initial: VoiceSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let models = $state<Record<VoiceKind, Partial<VoiceModelView>>>({ stt: {}, tts: {} });
  let hardware = $state<Record<VoiceKind, string>>({ stt: '', tts: '' });
  let catalogue = $state<Record<string, string>>({});
  let tests = $state<Record<string, { text: string; error: boolean }>>({});
  let actions = $state<Record<string, { busy: boolean; label: string }>>({});
  let keys = $state(Object.fromEntries(untrack(() => initial.connections.map(row => [row.provider, row.key]))));
  let keyStatus = $state(Object.fromEntries(untrack(() => initial.connections.map(row => [row.provider, row.keyStatus]))));
  export function refresh(next: VoiceSettingsSnapshot): void {
    models = { stt: {}, tts: {} };
    snapshot = next;
  }
  export function setModel(kind: VoiceKind, next: Partial<VoiceModelView>): void { models[kind] = { ...models[kind], ...next }; }
  export function setHardwareDescription(kind: VoiceKind, text: string): void { hardware[kind] = text; }
  export function setTestStatus(provider: string, text: string, error: boolean): void { tests[provider] = { text, error }; }
  export function setCatalogStatus(provider: string, text: string): void { catalogue[provider] = text; }
  export function setKey(provider: string, key: string, status: string): void { keys[provider] = key; keyStatus[provider] = status; }
  export function setActionBusy(id: string, busy: boolean, label: string): void { actions[id] = { busy, label }; }
  function busy(action: string, provider = '', kind = ''): boolean { return !!actions[voiceActionId(action, provider, kind)]?.busy; }
  function actionLabel(action: string, original: string, provider = '', kind = ''): string { const state = actions[voiceActionId(action, provider, kind)]; return state?.busy ? state.label : original; }
  const actionRow = 'gb:voice:flex gb:voice:items-center gb:voice:justify-between gb:voice:gap-3.5 gb:voice:max-[720px]:items-start gb:voice:max-[720px]:gap-3';
  const summary = 'gb:voice:flex gb:voice:items-center gb:voice:justify-between gb:voice:gap-3 gb:voice:p-0 gb:voice:text-ink gb:voice:cursor-pointer gb:voice:focus-visible:outline-2 gb:voice:focus-visible:outline-offset-2 gb:voice:focus-visible:outline-accent gb:voice:max-[720px]:flex-col gb:voice:max-[720px]:items-start';
</script>

{#snippet fieldRow(field: VoiceField)}
  {@const model = field.type === 'model' && field.kind ? { ...snapshot.models[field.kind], ...models[field.kind] } : null}
  {@const modelBusy = field.setting === 'localSttModel' || field.setting === 'localSttBackend' ? (models.stt.busy ?? snapshot.models.stt.busy) : field.setting === 'localTtsModel' || field.setting === 'localTtsBackend' ? (models.tts.busy ?? snapshot.models.tts.busy) : false}
  <div class="{VOICE_ROW} {field.type === 'model' ? 'voice-model-row gb:voice:[&.voice-model-attention]:outline-2 gb:voice:[&.voice-model-attention]:outline-[color-mix(in_srgb,var(--accent)_68%,transparent)] gb:voice:[&.voice-model-attention]:outline-offset-[-2px] gb:voice:[&.voice-model-attention]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent)]' : ''}" hidden={field.hidden}
    data-voice-visible={field.visible} data-voice-mode={field.separate ? 'separate' : undefined} data-voice-model-kind={field.type === 'model' ? field.kind : undefined} data-voice-output-language-row={field.language === 'output' ? '' : undefined}>
    <div class={VOICE_COPY}>
      <div class={VOICE_TITLE}>{model?.label || field.title}{#if field.type === 'range'} <output id="voice-rate-value" class="gb:voice:text-accent gb:voice:font-mono gb:voice:font-medium">{snapshot.settings.rate.toFixed(2).replace(/0$/, '')}×</output>{/if}</div>
      <div class={VOICE_DESCRIPTION} data-voice-language-description={field.language === 'input' ? '' : undefined} data-voice-output-language-description={field.language === 'output' ? '' : undefined}
        data-voice-hardware-description={field.type === 'hardware' && field.kind === 'stt' ? '' : undefined} data-voice-output-hardware-description={field.type === 'hardware' && field.kind === 'tts' ? '' : undefined}>
        {model?.description || (field.type === 'hardware' && field.kind ? hardware[field.kind] : field.description)}
      </div>
      {#if model && field.kind}
        <div class="voice-model-state gb:voice:mt-[5px] gb:voice:text-muted gb:voice:text-[10px] gb:voice:leading-[1.4] gb:voice:data-[state=ready]:text-success gb:voice:data-[state=working]:text-accent gb:voice:data-[state=error]:text-danger" data-state={model.state} data-voice-model-status={field.kind} title={model.detail} role="status">{model.status}</div>
        <div class="voice-model-progress gb:voice:max-w-[430px] gb:voice:pt-[9px] gb:voice:[&[hidden]]:hidden" hidden={!model.progress} data-voice-model-progress={field.kind}>
          <div class="voice-model-progress-track {model.progressPhase === 'preparing' ? 'indeterminate' : model.progressPhase === 'complete' ? 'complete' : ''} gb:voice:h-1.5 gb:voice:overflow-hidden gb:voice:rounded-[99px] gb:voice:bg-secondary-surface" role="progressbar" aria-label="{model.label} download progress" aria-valuenow={model.progressPhase === 'complete' ? 100 : undefined} aria-valuemin="0" aria-valuemax="100">
            <span class="gb:voice:block gb:voice:h-full gb:voice:rounded-[inherit] gb:voice:bg-accent {model.progressPhase === 'complete' ? 'gb:voice:w-full' : model.progressPhase === 'preparing' ? 'gb:voice:w-[35%] gb:voice:animate-voice-progress gb:voice:motion-reduce:animate-none' : 'gb:voice:w-0'}"></span>
          </div>
          <small class="gb:voice:block gb:voice:mt-[5px] gb:voice:text-muted gb:voice:text-[9.5px] gb:voice:leading-[1.5]">{model.progressLabel}</small>
        </div>
      {/if}
    </div>
    {#if model && field.kind}
      <div class="voice-model-actions {VOICE_ACTIONS} gb:voice:max-[720px]:w-full">
        <button type="button" class="{VOICE_MODEL_BUTTON}" data-voice-action="install-model" data-kind={field.kind} disabled={model.busy || model.ready}>{model.operation === 'install-model' ? 'Downloading…' : model.ready ? 'Ready' : 'Download'}</button>
        <button type="button" class={VOICE_LINK} data-voice-action="remove-model" data-kind={field.kind} disabled={model.busy || !model.ready}>{model.operation === 'remove-model' ? 'Removing…' : 'Remove files'}</button>
      </div>
    {:else if field.type === 'static'}
      <span class={VOICE_CONTROL} data-voice-openrouter-model-label={field.openRouterModel}>{field.value}</span>
    {:else}
      <div class="{field.provider ? 'voice-control-stack gb:voice:grid gb:voice:w-[min(300px,100%)] gb:voice:justify-items-stretch gb:voice:max-[720px]:w-full' : ''}">
        <label class="{VOICE_CONTROL} {field.type === 'range' ? 'voice-rate-field gb:voice:flex gb:voice:items-center' : ''}">
          <span class="gb:voice:sr-only">{field.label}</span>
          {#if field.type === 'range'}
            <input type="range" min="0.5" max="2" step="0.05" value={field.value} data-voice-setting={field.setting} class="gb:voice:w-full gb:voice:m-0 gb:voice:accent-accent">
          {:else if field.type === 'text'}
            <input class={VOICE_INPUT} value={field.value} data-voice-setting={field.setting} autocomplete="off" spellcheck="false">
          {:else}
            <select class={VOICE_SELECT} value={field.value} data-voice-setting={field.setting} data-voice-cloud-voices={field.provider} disabled={field.disabled || modelBusy}>
              {#if field.options?.some(option => option.group)}
                {#each [...new Set(field.options.map(option => option.group))] as group}
                  <optgroup label={group}>{#each field.options.filter(option => option.group === group) as option (option.id)}<option value={option.id}>{option.label}</option>{/each}</optgroup>
                {/each}
              {:else}{#each field.options || [] as option (option.id)}<option value={option.id}>{option.label}</option>{/each}{/if}
            </select>
          {/if}
        </label>
        {#if field.provider}
          <button type="button" class="{VOICE_LINK} gb:voice:justify-self-start gb:voice:mt-[5px] gb:voice:text-[10px]" data-voice-action="refresh-voices" data-provider={field.provider} disabled={busy('refresh-voices', field.provider)}>{actionLabel('refresh-voices', 'Refresh voices', field.provider)}</button>
          <small class="voice-catalog-status gb:voice:min-h-3.5 gb:voice:mt-1 gb:voice:text-muted gb:voice:text-[9px] gb:voice:leading-[1.4] gb:voice:text-left" data-voice-catalog-status={field.provider} role="status">{catalogue[field.provider] ?? field.catalogStatus}</small>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="voice-overview gb:voice:pt-2"><div class="gb:voice:px-[13px] gb:voice:py-[11px] gb:voice:max-[720px]:py-3 gb:voice:border gb:voice:border-[color-mix(in_srgb,var(--green)_24%,var(--border))] gb:voice:rounded-control gb:voice:bg-[color-mix(in_srgb,var(--green)_5%,var(--bg-card))]">
  <div class={VOICE_TITLE}><span aria-hidden="true" class="gb:voice:inline-block gb:voice:w-[7px] gb:voice:h-[7px] gb:voice:mr-[7px] gb:voice:rounded-full gb:voice:bg-success gb:voice:shadow-[0_0_0_3px_color-mix(in_srgb,var(--green)_13%,transparent)] gb:voice:align-[1px]"></span>Voice can stay on this device</div>
  <div class={VOICE_DESCRIPTION}>Choose On this device to keep recordings and reply text in this browser. Automatic can reuse a voice-capable direct AI provider, but stays on this device during CLI chat unless you explicitly choose another voice service.</div>
</div>
</div>
<div class={VOICE_GROUP}>Service</div>
<div class="voice-service-card {VOICE_CARD} gb:voice:pt-2">
  <div class={VOICE_ROW} data-voice-mode="linked" hidden={!snapshot.settings.providersLinked}>
    <div class={VOICE_COPY}><div class={VOICE_TITLE}>Default speech service</div><div class={VOICE_DESCRIPTION}>Used for both STT and TTS unless you separate them below.</div></div>
    <label class={VOICE_CONTROL}><span class="gb:voice:sr-only">Voice service</span><select class={VOICE_SELECT} value={snapshot.settings.inputProvider} data-voice-shared-provider>{#each snapshot.sharedProviders as option (option.id)}<option value={option.id}>{option.label}</option>{/each}</select></label>
  </div>
  <div class={VOICE_ROW} data-voice-auto-row hidden={snapshot.settings.inputProvider !== 'auto' && snapshot.settings.outputProvider !== 'auto'}>
    <div class={VOICE_COPY}><div class={VOICE_TITLE}>Automatic provider</div><div class={VOICE_DESCRIPTION} data-voice-auto-status data-state={snapshot.automatic.state}>{snapshot.automatic.text}</div></div>
    <button type="button" class={VOICE_LINK} data-settings-tab="ai">AI settings</button>
  </div>
  <div class="{VOICE_ROW}">
    <div class={actionRow}><div class={VOICE_COPY}><div class={VOICE_TITLE}>Use separate STT and TTS services</div><div class={VOICE_DESCRIPTION}>For example, keep dictation on-device while using a cloud voice.</div></div><SettingsToggle id="voice-providers-linked" label="Use separate speech-to-text and text-to-speech services" checked={!snapshot.settings.providersLinked} voiceSetting="providersLinked"/></div>
  </div>
</div>
{#each [{ kind: 'stt', title: 'Speech-to-text', description: 'Dictation: turns what you say into text.', fields: snapshot.input }, { kind: 'tts', title: 'Text-to-speech', description: 'Listening: turns assistant replies into audio.', fields: snapshot.output }] as task (task.kind)}
  <section class="voice-task-block gb:voice:mt-6" aria-labelledby="voice-{task.kind}-heading">
    <header class="voice-task-heading gb:voice:flex gb:voice:items-baseline gb:voice:justify-between gb:voice:gap-4 gb:voice:mx-0.5 gb:voice:mt-0 gb:voice:mb-2 gb:voice:max-[720px]:flex-col gb:voice:max-[720px]:items-start gb:voice:max-[720px]:gap-[3px]">
      <h3 id="voice-{task.kind}-heading" class="gb:voice:m-0 gb:voice:text-ink gb:voice:text-[14px] gb:voice:font-[650]">{task.title} <span class="gb:voice:inline-block gb:voice:ml-[5px] gb:voice:px-[5px] gb:voice:py-0.5 gb:voice:border gb:voice:border-line gb:voice:rounded-[5px] gb:voice:text-muted gb:voice:font-mono gb:voice:text-[9px] gb:voice:font-semibold gb:voice:tracking-[0.08em] gb:voice:align-[1px]">{task.kind.toUpperCase()}</span></h3>
      <p class="gb:voice:m-0 gb:voice:text-muted gb:voice:text-[10.5px] gb:voice:leading-[1.4] gb:voice:text-right gb:voice:max-[720px]:text-left">{task.description}</p>
    </header>
    <div class="voice-task-card {VOICE_CARD}">
      {#each task.fields as field (field.id)}{@render fieldRow(field)}{/each}
      {#if task.kind === 'tts'}<div class="{VOICE_ROW}"><div class={actionRow}><div class={VOICE_COPY}><div class={VOICE_TITLE}>Read new replies automatically</div><div class={VOICE_DESCRIPTION}>Works while chat is open. You can stop playback at any time.</div></div><SettingsToggle id="voice-auto-read" label="Read new replies automatically" checked={snapshot.settings.autoRead} voiceSetting="autoRead"/></div></div>{/if}
    </div>
  </section>
{/each}
<details class="voice-advanced-connections gb:voice:mt-6 gb:voice:overflow-hidden gb:voice:border gb:voice:border-line gb:voice:rounded-control gb:voice:bg-[color-mix(in_srgb,var(--bg-card)_60%,transparent)] gb:voice:open:[&>summary]:border-b gb:voice:open:[&>summary]:border-line">
  <summary class="gb:voice:flex gb:voice:items-center gb:voice:justify-between gb:voice:px-3.5 gb:voice:py-[13px] gb:voice:text-ink gb:voice:cursor-pointer gb:voice:focus-visible:outline-2 gb:voice:focus-visible:outline-offset-[-2px] gb:voice:focus-visible:outline-accent"><span><strong class="gb:voice:block gb:voice:text-[12px]">Advanced connections</strong><small class="gb:voice:block gb:voice:mt-[3px] gb:voice:text-muted gb:voice:text-[10px] gb:voice:font-normal">Local server and direct provider keys</small></span></summary>
  <div class="voice-connections gb:voice:flex gb:voice:flex-col gb:voice:px-3.5 gb:voice:pt-2 gb:voice:pb-2 gb:voice:max-[720px]:px-3">
    <div class="{VOICE_CONNECTION_ROW}"><div class={actionRow}><div class={VOICE_COPY}><div class={VOICE_TITLE}>AI provider connections</div><div class={VOICE_DESCRIPTION}>PPQ, OpenRouter, and Venice reuse the encrypted connection from AI settings and receive compatible voice requests directly from this browser. Routstr voice is not live yet and falls back to this device.</div></div><button type="button" class={VOICE_LINK} data-settings-tab="ai">Manage</button></div></div>
    {#each snapshot.connections as connection (connection.provider)}
      <div class="{VOICE_CONNECTION_ROW}">
        <details class="voice-connection-card gb:voice:min-w-0" data-voice-connection={connection.provider}>
          <summary class={summary}><span class="gb:voice:min-w-0"><strong class="gb:voice:text-[12px]">{connection.title}</strong><small class="gb:voice:block gb:voice:mt-[5px] gb:voice:text-muted gb:voice:text-[10px] gb:voice:leading-[1.45]">{connection.description}</small></span><em class="gb:voice:shrink-0 gb:voice:text-muted gb:voice:text-[9px] gb:voice:not-italic" data-voice-key-status={connection.provider}>{keyStatus[connection.provider]}</em></summary>
          <form class="voice-connection-body gb:voice:grid gb:voice:gap-3 gb:voice:pl-[18px] gb:voice:pr-0 gb:voice:pt-3.5 gb:voice:pb-0.5" data-voice-connection-form={connection.provider}>
            <input type="text" name="voice-provider" value={connection.provider} autocomplete="username" hidden>
            {#if connection.provider === 'local-server'}
              <label class="voice-field gb:voice:flex gb:voice:min-w-0 gb:voice:flex-col"><span class="gb:voice:text-ink gb:voice:text-[12px] gb:voice:font-semibold">Server URL</span><input type="url" class="{VOICE_INPUT} gb:voice:mt-1.5" value={snapshot.settings.localServerUrl} placeholder="http://127.0.0.1:8000" data-voice-setting="localServerUrl" autocomplete="url" spellcheck="false"><small class="gb:voice:block gb:voice:mt-[5px] gb:voice:text-muted gb:voice:text-[10px] gb:voice:leading-[1.45]">Connects directly from this browser. The URL and optional key stay on this device.</small></label>
            {:else}<p class="voice-cloud-disclosure gb:voice:m-0 gb:voice:text-muted gb:voice:text-[10px] gb:voice:leading-[1.5]">Connects directly from this browser to {connection.title}. Your key is sent only to that provider for its requests.</p>{/if}
            <label class="voice-field gb:voice:flex gb:voice:min-w-0 gb:voice:flex-col"><span class="gb:voice:text-ink gb:voice:text-[12px] gb:voice:font-semibold">{connection.keyLabel}</span><input type="password" class="{VOICE_INPUT} gb:voice:mt-1.5" data-voice-key-input={connection.provider} value={keys[connection.provider]} placeholder="Paste key" autocomplete="new-password" autocapitalize="none" spellcheck="false"></label>
            <div class="voice-connection-actions {VOICE_ACTIONS}">
              {#each [{ action: 'save-key', label: 'Save key' }, { action: 'clear-key', label: 'Clear' }, { action: 'test-provider', label: 'Test connection' }] as button (button.action)}<button type="button" class={button.action === 'save-key' ? VOICE_BUTTON : VOICE_LINK} data-voice-action={button.action} data-provider={connection.provider} disabled={busy(button.action, connection.provider)}>{actionLabel(button.action, button.label, connection.provider)}</button>{/each}
              {#if connection.docs}<a class={VOICE_LINK} href={connection.docs} target="_blank" rel="noopener">Create key ↗</a>{/if}
            </div>
            <div class="voice-test-status gb:voice:min-h-3.5 gb:voice:text-[10px] {tests[connection.provider]?.error ? 'error gb:voice:text-danger' : 'gb:voice:text-success'}" role="status" aria-live="polite" data-voice-test-status={connection.provider}>{tests[connection.provider]?.text || ''}</div>
          </form>
        </details>
      </div>
    {/each}
  </div>
</details>
