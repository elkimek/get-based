<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { PrivacyPreferences, PrivacyConsent, PrivacyConnectionState } from '../settings-privacy-contract.js';
  let { initial }: { initial: PrivacyPreferences } = $props();
  const preferences = untrack(() => initial);
  let consent = $state(preferences.consent);
  let configured = $state(false);
  let protection = $state<'checking' | 'basic' | 'enhanced'>('checking');
  let protectionModel = $state('');
  let connection = $state<PrivacyConnectionState>({ status: 'idle', message: 'Click Test to check', models: [], selectedModel: '' });
  export function setConsent(next: PrivacyConsent): void { consent = next; }
  export function configure(open?: boolean): void { configured = open ?? !configured; }
  export function setProtection(enhanced: boolean, model: string): void { protection = enhanced ? 'enhanced' : 'basic'; protectionModel = model; }
  export function setConnection(next: Partial<PrivacyConnectionState>): void { connection = { ...connection, ...next }; }

  const row = 'gb:privacy:flex gb:privacy:items-center gb:privacy:justify-between gb:privacy:gap-3.5 gb:privacy:max-[720px]:items-start gb:privacy:max-[720px]:gap-3';
  const separated = row + ' gb:privacy:[&+&]:mt-3.5 gb:privacy:pt-3 gb:privacy:mt-3 gb:privacy:border-t gb:privacy:border-line';
  const copy = 'gb:privacy:min-w-0 gb:privacy:flex-auto';
  const title = 'gb:privacy:block gb:privacy:text-ink gb:privacy:text-[13px] gb:privacy:font-semibold gb:privacy:leading-[1.35]';
  const description = 'gb:privacy:mt-0.5 gb:privacy:text-muted gb:privacy:text-[11px] gb:privacy:leading-[1.45]';
  const group = 'gb:privacy:text-[11px] gb:privacy:font-bold gb:privacy:uppercase gb:privacy:tracking-[0.1em] gb:privacy:text-muted gb:privacy:font-mono';
  const label = 'gb:privacy:text-xs gb:privacy:text-muted';
  const input = 'gb:privacy:box-border gb:privacy:w-full gb:privacy:min-w-0 gb:privacy:min-h-10 gb:privacy:px-3 gb:privacy:py-2.5 gb:privacy:border gb:privacy:border-line gb:privacy:rounded-control gb:privacy:bg-surface gb:privacy:text-ink gb:privacy:text-[13px] gb:privacy:font-[monospace] gb:privacy:focus:border-accent gb:privacy:focus:shadow-[0_0_0_3px_var(--accent-fill)]';
  const button = 'gb:privacy:inline-flex gb:privacy:shrink-0 gb:privacy:items-center gb:privacy:justify-center gb:privacy:gap-1.5 gb:privacy:px-[18px] gb:privacy:py-2 gb:privacy:border gb:privacy:border-line gb:privacy:rounded-control gb:privacy:bg-surface gb:privacy:text-secondary gb:privacy:text-sm gb:privacy:leading-[normal] gb:privacy:font-semibold gb:privacy:[font-family:inherit] gb:privacy:cursor-pointer gb:privacy:transition-colors gb:privacy:hover:bg-hover gb:privacy:hover:text-ink gb:privacy:disabled:opacity-50 gb:privacy:disabled:cursor-not-allowed gb:privacy:focus-visible:outline-2 gb:privacy:focus-visible:outline-offset-2 gb:privacy:focus-visible:outline-accent gb:privacy:motion-reduce:transition-none';
</script>

<div class="{group} gb:privacy:mt-3">AI Privacy Protection</div>
<div id="privacy-section" class="gb:privacy:mt-3.5 gb:privacy:pt-0.5 gb:privacy:max-[720px]:mt-3">
  <div class="{row} gb:privacy:mb-3">
    <div aria-hidden="true" class="gb:privacy:inline-flex gb:privacy:items-center gb:privacy:justify-center gb:privacy:w-8 gb:privacy:h-8 gb:privacy:shrink-0 gb:privacy:border gb:privacy:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] gb:privacy:rounded-control gb:privacy:bg-accent-fill gb:privacy:text-[15px] gb:privacy:leading-none">🔒</div>
    <div class={copy}>
      <div class={title}>Privacy protection runs before text-based AI analysis</div>
      <div class={description}>Text imports use deterministic patterns and, optionally, a trusted self-hosted model (this device, LAN, or your remote server) to replace likely identifiers. Review remains recommended because automated detection can miss unusual layouts. Image imports cannot be scrubbed and always require a separate warning.</div>
    </div>
  </div>
  <div id="privacy-status-card" role="status" class="gb:privacy:flex gb:privacy:items-start gb:privacy:gap-2.5 gb:privacy:px-3.5 gb:privacy:py-2.5 gb:privacy:rounded-control gb:privacy:mb-2 gb:privacy:leading-[1.4] gb:privacy:bg-surface {protection === 'checking' ? '' : 'gb:privacy:border gb:privacy:border-line'}">
    <div id="privacy-status-icon" aria-hidden="true" class="gb:privacy:text-lg gb:privacy:leading-[1.4] gb:privacy:shrink-0 gb:privacy:mt-px">🔒</div>
    <div class="gb:privacy:flex-1 gb:privacy:min-w-0">
      <div id="privacy-status-title" class="gb:privacy:text-[13px] gb:privacy:font-semibold {protection === 'enhanced' ? 'gb:privacy:text-success' : protection === 'basic' ? 'gb:privacy:text-warning' : ''}">{protection === 'checking' ? 'Checking...' : protection === 'enhanced' ? 'Enhanced protection' : 'Basic protection'}</div>
      <div id="privacy-status-detail" class="gb:privacy:mt-0.5 gb:privacy:text-xs gb:privacy:leading-[1.4] gb:privacy:text-muted">
        {#if protection === 'enhanced'}Trusted Local AI ({protectionModel}) adds contextual detection, followed by deterministic checks. Review the result before sending because no automated detector can guarantee every identifier is removed.
        {:else if protection === 'basic'}Deterministic pattern matching catches common labeled names, IDs, emails, phone numbers, and addresses. It may miss unusual layouts or non-English personal data.<br><span class="gb:privacy:mt-1 gb:privacy:inline-block">A trusted Local AI model can add contextual detection, but review is still recommended.</span>{/if}
      </div>
    </div>
  </div>
  <button type="button" data-settings-action="toggle-privacy-configure" aria-expanded={configured} aria-controls="privacy-configure-body" class="gb:privacy:flex gb:privacy:items-center gb:privacy:gap-1.5 gb:privacy:w-full gb:privacy:leading-[18px] gb:privacy:text-xs gb:privacy:text-muted gb:privacy:cursor-pointer gb:privacy:mt-3 gb:privacy:px-0 gb:privacy:py-1 gb:privacy:select-none gb:privacy:bg-transparent gb:privacy:border-0 gb:privacy:[font-family:inherit] gb:privacy:hover:text-secondary gb:privacy:focus-visible:outline-2 gb:privacy:focus-visible:outline-offset-2 gb:privacy:focus-visible:outline-accent">
    <span id="privacy-configure-arrow" aria-hidden="true" class="gb:privacy:text-[9px]">{configured ? '▼' : '▶'}</span>Configure Local AI
  </button>
  <div id="privacy-configure-body" style:display={configured ? 'block' : 'none'} class="gb:privacy:pt-2">
    <form id="pii-model-section">
      <input type="text" name="privacy-provider" value="local-ai" autocomplete="username" hidden>
      <div id="pii-local-status" role="status" class="gb:privacy:flex gb:privacy:items-center gb:privacy:gap-2 gb:privacy:text-[13px]">
        <span id="pii-local-dot" aria-hidden="true" class="gb:privacy:w-2 gb:privacy:h-2 gb:privacy:rounded-full gb:privacy:shrink-0 {connection.status === 'connected' ? 'gb:privacy:bg-success gb:privacy:shadow-[0_0_6px_rgba(34,197,94,0.5)]' : connection.status === 'disconnected' ? 'gb:privacy:bg-danger' : 'gb:privacy:bg-muted'}"></span>
        <span id="pii-local-status-text">{connection.message}</span>
      </div>
      <div class="gb:privacy:mt-2">
        <label for="pii-local-apikey-input" class={label}>Privacy server API key <span class="gb:privacy:text-[11px]">(optional, stored separately)</span></label>
        <input type="password" id="pii-local-apikey-input" value={preferences.apiKey} placeholder="Leave empty if not required" class="{input} gb:privacy:mt-1" autocomplete="new-password">
      </div>
      <div class="gb:privacy:mt-2">
        <label for="pii-local-url-input" class={label}>Server address</label>
        <div class="gb:privacy:flex gb:privacy:gap-2 gb:privacy:items-center gb:privacy:mt-1">
          <input type="text" id="pii-local-url-input" value={preferences.url} placeholder="http://localhost:11434" class="{input} gb:privacy:flex-1">
          <button type="button" data-settings-action="test-pii-ollama" class="{button} gb:privacy:whitespace-nowrap">Test</button>
        </div>
      </div>
      <div id="pii-model-dropdown" style:display={connection.models.length ? 'block' : 'none'} class="gb:privacy:mt-2">
        <label for="pii-model-select" class={label}>Privacy model <span class="gb:privacy:text-[11px]">(can be a smaller, faster model)</span></label>
        <select id="pii-model-select" data-settings-action="set-pii-model" class="{input} gb:privacy:mt-1 gb:privacy:cursor-pointer" value={connection.selectedModel}>
          {#each connection.models as model (model)}<option value={model}>{model}</option>{/each}
        </select>
      </div>
    </form>
  </div>
  <div class={separated}>
    <div class={copy}>
      <label for="pii-local-toggle" class={title}>Use self-hosted AI for privacy protection</label>
      <div id="privacy-local-help" class={description}>Requires a server you trust; the original report is sent to that endpoint for scrubbing. Cloud-tagged models are blocked. When disabled, deterministic pattern matching is used instead.</div>
    </div>
    <SettingsToggle id="pii-local-toggle" label="Remove personal identifiers locally" help="privacy-local-help" checked={preferences.localEnabled} action="toggle-pii-local"/>
  </div>
  <div class={separated}>
    <div class={copy}>
      <label for="pii-review-toggle" class={title}>Review obfuscated text before sending to AI</label>
      <div id="privacy-review-help" class={description}>Pause after privacy protection runs so you can inspect what the AI is about to receive.</div>
    </div>
    <SettingsToggle id="pii-review-toggle" label="Review personal identifiers before sending" help="privacy-review-help" checked={preferences.reviewEnabled} action="toggle-pii-review"/>
  </div>
  <div id="cloud-ai-consent-controls">
    <div class={separated}>
      <div class={copy}><div class={title}>AI transparency</div><div class={description}>{consent.transparencyAcknowledged ? 'Acknowledged on this browser. This remains a separate record even when first activation presents it together with destination approval.' : 'Not yet acknowledged. The first AI activation will explain AI-generated content and automatic insight requests.'}</div></div>
    </div>
    <div class={separated}>
      <div class={copy}><div class={title}>Remote AI sensitive-data approval</div><div class={description}>{consent.remoteRecipients.length ? `Approved on this browser for: ${consent.remoteRecipients.join(', ')}. Withdrawing stops future remote AI and remote voice requests until you explicitly approve again.` : 'No current approval is stored. After a connection check succeeds, getbased asks once before activating each remote recipient for health or other sensitive data.'}</div></div>
      <button type="button" class={button} data-settings-action="withdraw-cloud-ai-consent" disabled={!consent.remoteRecipients.length}>Withdraw</button>
    </div>
    <div class={separated}>
      <div class={copy}><div class={title}>Private-network AI destinations</div><div class={description}>{consent.privateRecipients.length ? `Confirmed on this browser for: ${consent.privateRecipients.join(', ')}. Changing an endpoint origin requires confirmation again.` : 'No private-network AI destination is currently confirmed.'}</div></div>
      <button type="button" class={button} data-settings-action="withdraw-ai-route-confirmations" disabled={!consent.privateRecipients.length}>Clear</button>
    </div>
  </div>
</div>
<div class="{group} gb:privacy:mt-[22px] gb:privacy:max-[720px]:mt-[18px]">Anonymous Usage Stats</div>
<div id="privacy-analytics-section" class="gb:privacy:mt-3.5 gb:privacy:max-[720px]:mt-3">
  <div class={row}>
    <div class={copy}>
      <label for="analytics-toggle" class={title}>Send optional cookieless usage stats</label>
      <div id="privacy-analytics-help" class={description}>getbased sends pageviews and limited product events to its Umami analytics service. URL query strings and fragments are excluded. No health records, viewed values, chat content, uploaded files, profile context, or provider credentials are sent. The request IP and user agent are used transiently for coarse location and a daily session identifier; the raw IP is not stored.</div>
      <div class="gb:privacy:mt-[5px] gb:privacy:text-muted gb:privacy:text-[11px] gb:privacy:leading-[1.35]">Takes effect on next launch.</div>
    </div>
    <SettingsToggle id="analytics-toggle" label="Send optional cookieless usage stats" help="privacy-analytics-help" checked={preferences.analyticsEnabled} action="set-analytics"/>
  </div>
</div>
