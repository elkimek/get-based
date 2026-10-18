<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import { AGENT_ACCESS_CLIENTS } from '../settings-agent-access-contract.js';
  import type { AgentAccessSnapshot, AgentAccessSecret } from '../settings-agent-access-contract.js';
  import { AGENT_COPY, AGENT_TITLE, AGENT_DESCRIPTION, AGENT_ROW, AGENT_MINI_BUTTON, AGENT_FULL_BUTTON, AGENT_SETUP_BUTTON, AGENT_LINK, AGENT_TOKEN_HEAD, AGENT_TOKEN_ACTIONS, AGENT_TOKEN_LABEL, AGENT_TOKEN_BOX } from '../settings-agent-access-classes.js';

  let { initial }: { initial: AgentAccessSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let secrets = $state<Record<AgentAccessSecret, string | null>>({ token: null, 'context-key': null });
  let client = $state('hermes');

  export function refresh(next: AgentAccessSnapshot): void {
    secrets = { token: null, 'context-key': null };
    client = 'hermes';
    snapshot = next;
  }

  export function toggleSecret(kind: AgentAccessSecret, value: string): void {
    secrets[kind] = secrets[kind] === null ? value : null;
  }
</script>

<div data-agent-access-view aria-busy={snapshot.pending}>
<div class="{AGENT_ROW} {snapshot.enabled ? 'gb:agent:mb-4' : 'gb:agent:mb-2'}">
  <div class={AGENT_COPY}>
    <div class={AGENT_TITLE}>Agent Access</div>
    <div class={AGENT_DESCRIPTION}>Let AI agents query your labs and context via MCP, Hermes Agent, or OpenClaw</div>
  </div>
  <SettingsToggle id="agent-access-toggle" label="Toggle Agent Access" checked={snapshot.enabled}
    disabled={snapshot.pending || (!snapshot.enabled && !(snapshot.syncReady && snapshot.ownerReady))} syncAction="toggle-messenger" compact/>
</div>

{#if snapshot.enabled && snapshot.hasToken}
  <div class="agent-access-connect-card gb:agent:grid gb:agent:grid-cols-[minmax(0,1fr)_auto] gb:agent:items-end gb:agent:gap-3.5 gb:agent:mb-4 gb:agent:p-[13px] gb:agent:border gb:agent:border-line gb:agent:rounded-[14px] gb:agent:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_55%),var(--bg-card)] gb:agent:max-[720px]:grid-cols-1 gb:agent:max-[720px]:items-stretch">
    <div class={AGENT_COPY}>
      <div class={AGENT_TITLE}>Connect an agent</div>
      <div class={AGENT_DESCRIPTION}>Pick where this machine should connect, then paste one private setup command into that agent's terminal.</div>
      <div class="gb:agent:mt-[11px] gb:agent:mb-1.5 gb:agent:text-secondary gb:agent:font-mono gb:agent:text-[10px] gb:agent:font-semibold gb:agent:tracking-[0.1em] gb:agent:uppercase">Setup target</div>
      <div class="agent-access-client-grid gb:agent:flex gb:agent:flex-wrap gb:agent:gap-1.5" role="radiogroup" aria-label="Agent Access setup target">
        {#each AGENT_ACCESS_CLIENTS as option (option.id)}
          <label class="agent-access-client-chip gb:agent:relative gb:agent:inline-flex gb:agent:items-center gb:agent:cursor-pointer gb:agent:select-none">
            <input type="radio" name="agent-access-client" value={option.id} bind:group={client} checked={client === option.id} class="gb:peer gb:agent:absolute gb:agent:inset-0 gb:agent:opacity-0 gb:agent:cursor-pointer">
            <span class="gb:agent:inline-flex gb:agent:items-center gb:agent:min-h-[27px] gb:agent:px-[9px] gb:agent:py-1 gb:agent:border gb:agent:border-line gb:agent:rounded-full gb:agent:bg-[color-mix(in_srgb,var(--bg-secondary)_86%,transparent)] gb:agent:text-muted gb:agent:text-[11px] gb:agent:font-semibold gb:agent:leading-none gb:agent:transition-colors gb:agent:peer-checked:border-[color-mix(in_srgb,var(--accent)_62%,var(--border))] gb:agent:peer-checked:bg-accent-fill gb:agent:peer-checked:text-accent gb:agent:peer-checked:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] gb:agent:peer-focus-visible:outline-2 gb:agent:peer-focus-visible:outline-[color-mix(in_srgb,var(--accent)_72%,transparent)] gb:agent:peer-focus-visible:outline-offset-2 gb:agent:motion-reduce:transition-none">{option.label}</span>
          </label>
        {/each}
      </div>
    </div>
    <button type="button" class={AGENT_SETUP_BUTTON} data-sync-action="copy-agent-access-setup-command" aria-label="Copy selected agent setup command" disabled={snapshot.pending}>Copy setup command</button>
  </div>

  {#each [{ kind: 'token' as const, id: 'messenger-token', toggleAction: 'toggle-messenger-token', copyAction: 'copy-messenger-token', title: 'Read-only token', label: 'Agent Access token', mask: 64 }, { kind: 'context-key' as const, id: 'messenger-context-key', toggleAction: 'toggle-messenger-context-key', copyAction: 'copy-messenger-context-key', title: 'Context encryption key', label: 'Agent Context encryption key', mask: 48 }] as credential (credential.kind)}
    {@const revealed = secrets[credential.kind] !== null}
    <div class="gb:agent:mb-4">
      <div class={AGENT_TOKEN_HEAD}>
        <span class={AGENT_TOKEN_LABEL}>{credential.title}</span>
        <div class={AGENT_TOKEN_ACTIONS}>
          <button type="button" id="{credential.id}-toggle" class={AGENT_MINI_BUTTON}
            data-sync-action={credential.toggleAction} aria-label="{revealed ? 'Hide' : 'Show'} {credential.kind === 'token' ? 'token' : 'context encryption key'}"
            aria-controls={credential.id} aria-expanded={revealed} disabled={snapshot.pending}>{revealed ? 'Hide' : 'Show'}</button>
          <button type="button" class={AGENT_MINI_BUTTON} data-sync-action={credential.copyAction} aria-label="Copy {credential.kind === 'token' ? 'token' : 'context encryption key'}" disabled={snapshot.pending}>Copy</button>
        </div>
      </div>
      <div id={credential.id} class="{AGENT_TOKEN_BOX} {revealed ? 'gb:agent:select-all' : 'gb:agent:select-none'}" data-masked={!revealed} role="group" aria-label={credential.label}>
        {#if revealed}{secrets[credential.kind]}{:else}{#each Array(credential.mask) as _}•<wbr>{/each}{/if}
      </div>
      <div class="{AGENT_DESCRIPTION} gb:agent:mt-1.5">
        {#if credential.kind === 'token'}
          Use <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" class={AGENT_LINK}>getbased-mcp</a> to connect <a href="https://github.com/hermes-agent/hermes-agent" target="_blank" rel="noopener" class={AGENT_LINK}>Hermes Agent</a>, <a href="https://openclaw.ai" target="_blank" rel="noopener" class={AGENT_LINK}>OpenClaw</a>, or any MCP-compatible agent. Set this as <code>GETBASED_TOKEN</code>; it authorizes relay access only. Manage → Context controls which profile sources enter the encrypted payload.
        {:else}
          Set this as <code>GETBASED_AGENT_CONTEXT_KEY</code>. It decrypts context locally inside your self-hosted MCP. The hosted relay never receives this key.
        {/if}
      </div>
    </div>
  {/each}

  <div class="gb:agent:grid gb:agent:grid-cols-2 gb:agent:gap-2 gb:agent:mb-4">
    <button type="button" class={AGENT_FULL_BUTTON} data-sync-action="regenerate-messenger-token" disabled={snapshot.pending || !snapshot.ownerReady} aria-disabled={snapshot.pending || !snapshot.ownerReady}>Regenerate token</button>
    <button type="button" class={AGENT_FULL_BUTTON} data-sync-action="regenerate-messenger-context-key" disabled={snapshot.pending || !snapshot.ownerReady} aria-disabled={snapshot.pending || !snapshot.ownerReady}>Regenerate context key</button>
  </div>
  <div class="gb:agent:mt-[18px] gb:agent:pt-3.5 gb:agent:border-0 gb:agent:border-t gb:agent:border-dashed gb:agent:border-line">
    <div class={AGENT_ROW}>
      <div class={AGENT_COPY}>
        <div class={AGENT_TITLE}>Push wearable daily series</div>
        <div class={AGENT_DESCRIPTION}>Adds a pivoted daily-values matrix (HRV, RHR, sleep…) so agents can spot trends. ~100 / 400 / 1200 extra tokens for 7 / 30 / 90 days respectively (real-measured at 13 metrics); cached cleanly so the marginal cost per turn is small. Off by default — pick 7 days for cheap follow-ups, 30 for monthly reasoning, 90 for season-spanning analysis.</div>
      </div>
      <select id="agent-wearable-series-select" data-sync-action="set-agent-wearable-series-days" aria-label="Wearable series window pushed to agent"
        value={snapshot.seriesDays ? String(snapshot.seriesDays) : 'off'} disabled={snapshot.pending || !snapshot.ownerReady} aria-disabled={snapshot.pending || !snapshot.ownerReady}
        class="gb:agent:min-w-[90px] gb:agent:px-2.5 gb:agent:py-1.5 gb:agent:border gb:agent:border-line gb:agent:rounded-control gb:agent:bg-select-surface gb:agent:text-ink gb:agent:[font-family:inherit] gb:agent:text-[12px] gb:agent:leading-[normal] gb:agent:focus-visible:outline-2 gb:agent:focus-visible:outline-offset-2 gb:agent:focus-visible:outline-accent">
        <option value="off">Off</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
      </select>
    </div>
  </div>
{:else if !snapshot.syncReady}
  <div class={AGENT_DESCRIPTION}>Agent Access uses your Cross-device Sync identity for relay storage and quota. Enable or restore Cross-device Sync first, then turn this on.</div>
{:else if !snapshot.ownerReady}
  <div class={AGENT_DESCRIPTION}>Sync is enabled, but this device is still resolving its Sync owner. Wait for the mnemonic to finish loading, or restore Cross-device Sync again before enabling Agent Access.</div>
{:else}
  <div class={AGENT_DESCRIPTION}>Let AI agents query your labs — coding agents, messenger bots, or any <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" class={AGENT_LINK}>MCP-compatible tool</a>. The relay receives only end-to-end encrypted context; your Agent Access token authorizes relay fetches and your Agent Context key decrypts locally in your self-hosted MCP.</div>
{/if}

</div>
