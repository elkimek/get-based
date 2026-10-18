<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { CliAgentSettingsSnapshot, CliAgentSettingsActions } from '../cli-agent-settings-contract.js';
  import { CLI_COPY, CLI_BUTTON, CLI_PRIMARY, CLI_LINK, CLI_KICKER } from '../cli-agent-settings-classes.js';
  let { initial,actions }: { initial:CliAgentSettingsSnapshot;actions:CliAgentSettingsActions } = $props();
  let snapshot = $state(untrack(() => initial)), status = $state(''), busy = $state(false), howOpen = $state(false);
  let modelHost: HTMLElement | null = $state(null), frame: HTMLIFrameElement | null = $state(null), frameHeight: number | null = $state(null);
  export function refresh(next: CliAgentSettingsSnapshot): void { if (next.companion?.managementHref !== snapshot.companion?.managementHref) frameHeight = null; snapshot = next; }
  export function getSnapshot(): CliAgentSettingsSnapshot { return snapshot; }
  export function setStatus(text: string): void { status = text; }
  export function setBusy(value: boolean): void { busy = value; }
  export function getModelHost(): HTMLElement | null { return modelHost; }
  export function resizeFrame(event: Pick<MessageEvent,'data'|'origin'|'source'>): void {
    if (!frame || event.data?.type !== 'getbased-companion-panel-size' || !Number.isFinite(event.data.height) || event.source !== frame.contentWindow || event.origin !== new URL(frame.src).origin) return;
    frameHeight = Math.max(64,Math.min(800,Math.ceil(event.data.height)));
    const styles = getComputedStyle(frame);
    frame.contentWindow?.postMessage({ type:'getbased-companion-panel-theme',colors:Object.fromEntries(Object.entries({ bg:'--bg-card',text:'--text-primary',muted:'--text-muted',border:'--border',button:'--bg-card',accent:'--accent' }).map(([name,variable]) => [name,styles.getPropertyValue(variable).trim()])) },event.origin);
  }
  const run = (event: MouseEvent, callback: () => unknown) => { event.stopPropagation(); if (!busy) callback(); };
</script>
<section data-cli-agent-settings-view data-ai-provider-mode="cli" class="cli-agent-provider-panel gb:cli:mb-5 gb:cli:min-w-0 gb:cli:rounded-[14px] gb:cli:border gb:cli:border-line gb:cli:bg-surface gb:cli:text-ink" aria-label="CLI agents" aria-busy={busy}>
  <div class="gb:cli:flex gb:cli:flex-wrap gb:cli:items-start gb:cli:justify-between gb:cli:gap-3 gb:cli:border-b gb:cli:border-line gb:cli:p-[15px]">
    <div class="gb:cli:min-w-0 gb:cli:flex-1"><strong id="local-agent-chat-title" class="gb:cli:text-[13px] gb:cli:font-semibold gb:cli:leading-[1.35]">CLI agents</strong><p class={CLI_COPY + ' gb:cli:mt-1'}>Use an installed agent with its existing account or configured model provider. A small local companion connects the browser to CLI programs on this computer.</p></div>
    <button type="button" class={CLI_BUTTON} disabled={busy} data-settings-action="rescan-cli-agents" onclick={event => run(event,actions.scan)}>Check connection</button>
  </div>
  <p class={CLI_COPY + ' gb:cli:mx-[15px] gb:cli:mt-3 gb:cli:rounded-lg gb:cli:border gb:cli:border-line gb:cli:bg-secondary-surface gb:cli:px-[11px] gb:cli:py-[9px]'}><strong>One assistant across getbased.</strong> The selected CLI agent powers chat, supported image and document imports, summaries, explanations, and other AI features. It can read enabled active-profile context through constrained tools; any proposed data change stays a draft until you apply it.</p>
  <div class={CLI_KICKER}>Installed CLIs</div>
  <div id="local-agent-list" aria-live="polite" class="gb:cli:px-2.5 gb:cli:pb-2.5">
    {#if snapshot.phase === 'scanning'}<p role="status" class={CLI_COPY + ' gb:cli:p-4 gb:cli:text-center'}><span aria-hidden="true" class="gb:cli:mr-2 gb:cli:inline-block gb:cli:size-3 gb:cli:animate-spin gb:cli:rounded-full gb:cli:border-2 gb:cli:border-line gb:cli:border-t-accent gb:cli:motion-reduce:animate-none"></span>Scanning this computer…</p>{/if}
    {#if snapshot.error}<p role="status" class="gb:cli:p-4 gb:cli:text-xs gb:cli:text-danger-ink">{snapshot.error}</p>{/if}
    {#each snapshot.rows as row,index (row.id)}
      <div class="local-agent-row gb:cli:rounded-xl gb:cli:p-2.5 {row.compatible ? 'gb:cli:bg-accent-fill' : ''} {index > 0 ? 'gb:cli:rounded-none gb:cli:border-t gb:cli:border-line' : ''}">
        <div class="gb:cli:grid gb:cli:min-h-[58px] gb:cli:grid-cols-[34px_minmax(0,1fr)_auto] gb:cli:items-center gb:cli:gap-2.5 gb:cli:min-[721px]:grid-cols-[38px_minmax(0,1fr)_auto_auto]">
          <div class="local-agent-icon gb:cli:grid gb:cli:size-[34px] gb:cli:place-items-center gb:cli:overflow-hidden gb:cli:rounded-lg gb:cli:border gb:cli:border-line gb:cli:bg-white" aria-hidden="true">{#if row.icon}<img src={row.icon} alt="" draggable="false" class="gb:cli:size-6 gb:cli:object-contain">{:else}<span class="gb:cli:text-[9px] gb:cli:text-black">CLI</span>{/if}</div>
          {#snippet copy()}
            <span class="gb:cli:block gb:cli:text-[13px] gb:cli:font-[650]">{row.name}{#if row.expandable}<span aria-hidden="true" class="gb:cli:ml-2">{row.collapsed ? '›' : '⌄'}</span>{/if}</span>
            <span class="gb:cli:mt-0.5 gb:cli:block gb:cli:truncate gb:cli:text-[10.5px] gb:cli:text-secondary" title={row.metadata}>{row.metadata}</span>
            <span class="local-agent-state gb:cli:mt-1 gb:cli:flex gb:cli:items-center gb:cli:gap-1.5 gb:cli:text-[10.5px] gb:cli:text-secondary"><span class="local-agent-dot gb:cli:size-[7px] gb:cli:shrink-0 gb:cli:rounded-full {row.ready ? 'gb:cli:bg-success' : 'gb:cli:bg-warning'}"></span>{row.status}</span>
          {/snippet}
          {#if row.expandable}<button type="button" class="gb:cli:[@media(pointer:coarse)]:min-h-11 gb:cli:w-full gb:cli:min-w-0 gb:cli:cursor-pointer gb:cli:rounded-control gb:cli:border-0 gb:cli:bg-transparent gb:cli:p-0 gb:cli:text-left gb:cli:text-ink gb:cli:focus-visible:outline-2 gb:cli:focus-visible:outline-accent gb:cli:focus-visible:outline-offset-2" data-settings-action="toggle-cli-agent-options" aria-expanded={!row.collapsed} aria-controls="cli-agent-options" onclick={event => { event.stopPropagation(); actions.disclose(row.id); }}>{@render copy()}</button>{:else}<div class="gb:cli:min-w-0">{@render copy()}</div>{/if}
          <div class="gb:cli:col-start-3 gb:cli:row-start-1 gb:cli:min-[721px]:col-start-4">{#if row.compatible}<SettingsToggle id={`cli-use-${row.id}`} label={`Use ${row.name} in getbased`} checked={row.selected} disabled={!row.ready || busy} action="toggle-cli-codex" agent={row.id} className="local-agent-toggle gb:settings:[@media(pointer:coarse)]:w-11 gb:settings:[@media(pointer:coarse)]:h-11 gb:settings:[@media(pointer:coarse)]:[&>span]:inset-x-1.5 gb:settings:[@media(pointer:coarse)]:[&>span]:top-[13px]" compact onToggle={enabled => actions.toggle(enabled,row.id)} />{/if}</div>
          <div class="gb:cli:col-span-2 gb:cli:col-start-2 gb:cli:min-[721px]:col-span-1 gb:cli:min-[721px]:col-start-3 gb:cli:min-[721px]:row-start-1 gb:cli:flex gb:cli:flex-wrap gb:cli:gap-2">
            {#if row.login}<button type="button" class={CLI_BUTTON} disabled={busy} data-settings-action="copy-cli-agent-login" data-value={row.id} onclick={event => run(event,() => actions.login(row.id))}>Copy sign-in command</button>{/if}
            {#if row.compatible}<button type="button" class={CLI_BUTTON} disabled={!row.ready || busy} title={row.testReason || undefined} data-settings-action="test-cli-codex" data-value={row.id} onclick={event => run(event,() => actions.test(row.id))}>Test</button>{/if}
          </div>
        </div>
        {#if row.expandable}<fieldset id="cli-agent-options" hidden={row.collapsed} disabled={busy} aria-label="CLI model and execution options" bind:this={modelHost} class="gb:cli:m-0 gb:cli:min-w-0 gb:cli:border-0 gb:cli:p-0"></fieldset>{/if}
      </div>
    {/each}
    {#if snapshot.showSetup && snapshot.phase !== 'scanning'}
      <div class="local-agent-install-card gb:cli:my-1 gb:cli:flex gb:cli:min-w-0 gb:cli:flex-col gb:cli:gap-2.5 gb:cli:rounded-[11px] gb:cli:border gb:cli:border-line gb:cli:bg-secondary-surface gb:cli:p-[13px]" role="region" aria-label="Connect local CLI agents">
        <strong class="gb:cli:text-[12.5px]">Connect your installed CLI agents</strong><p class={CLI_COPY}>A browser cannot launch a local program by itself. Copy this one bootstrap command into {snapshot.platform === 'windows' ? 'PowerShell' : 'Terminal'}, then select <strong>Check connection</strong>. Once connected, getbased can install and manage the companion directly.</p>
        <div class="gb:cli:flex gb:cli:flex-wrap gb:cli:gap-2" role="group" aria-label="Operating system">{#each [['linux','Linux'],['macos','macOS'],['windows','Windows']] as [value,label]}<button type="button" class={CLI_BUTTON + ' gb:cli:aria-pressed:bg-accent-fill'} disabled={busy} aria-pressed={snapshot.platform === value} data-settings-action="set-cli-companion-platform" data-value={value} onclick={event => run(event,() => actions.platform(value as 'linux'|'macos'|'windows'))}>{label}</button>{/each}</div>
        <strong class="gb:cli:text-xs">Connect once</strong><p class={CLI_COPY}>Downloads one open-source file to your temporary folder. Nothing is installed automatically.</p>
        <code class="gb:cli:min-w-0 gb:cli:rounded-control gb:cli:border gb:cli:border-line gb:cli:bg-surface gb:cli:p-2 gb:cli:font-mono gb:cli:text-[11px] gb:cli:wrap-anywhere" title={snapshot.runCommand}>{snapshot.runCommand}</code>
        <button type="button" class={CLI_PRIMARY} disabled={busy} data-settings-action="copy-cli-companion-run" onclick={event => run(event,() => actions.copy('run'))}>Copy connection command</button>
        <small class={CLI_COPY}>Already installed but stopped? <button type="button" class={CLI_LINK} disabled={busy} data-settings-action="copy-cli-companion-start" data-command={snapshot.startCommand} onclick={event => run(event,() => actions.copy('start'))}>Copy the start command</button>. Requires Node.js 20+ and at least one configured supported CLI. No port or pairing token is needed. <a class={CLI_LINK} href="https://github.com/elkimek/get-based/blob/main/bin/getbased-companion.js" target="_blank" rel="noopener">Review the source on GitHub</a>.</small>
      </div>
    {/if}
  </div>
  <div id="local-agent-companion-section" class="local-agent-companion-section gb:cli:mt-3">
    {#if snapshot.companion}
      <div class={CLI_KICKER}>Companion</div>
      {#if snapshot.companion.mode === 'embedded'}<iframe bind:this={frame} class="local-agent-management-frame gb:cli:block gb:cli:h-[100px] gb:cli:w-full gb:cli:rounded-lg gb:cli:border gb:cli:border-line gb:cli:bg-secondary-surface gb:cli:max-[480px]:h-[120px]" style:height={frameHeight === null ? undefined : `${frameHeight}px`} title="Companion controls" src={snapshot.companion.managementHref} referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
      {:else}<div class="gb:cli:mx-2.5 gb:cli:flex gb:cli:flex-wrap gb:cli:items-center gb:cli:justify-between gb:cli:gap-3 gb:cli:rounded-lg gb:cli:border gb:cli:border-line gb:cli:bg-secondary-surface gb:cli:p-3" aria-label={snapshot.companion.mode === 'outdated' ? 'Companion update required' : 'Companion controls'}>
        <div class="gb:cli:min-w-0"><strong class="gb:cli:text-xs">{snapshot.companion.title}</strong><p class={CLI_COPY}>{snapshot.companion.description}</p>{#if snapshot.companion.guidance}<p class={CLI_COPY}>{snapshot.companion.guidance}</p>{/if}</div>
        <div class="gb:cli:flex gb:cli:flex-wrap gb:cli:gap-2">
          {#if snapshot.companion.managementHref}<a class={CLI_BUTTON + ' gb:cli:inline-flex gb:cli:items-center gb:cli:no-underline'} href={snapshot.companion.managementHref} target="_blank" rel="noopener noreferrer">Manage Companion</a>{/if}
          {#if snapshot.companion.mode !== 'direct'}<button type="button" class={CLI_BUTTON} disabled={busy} data-settings-action="copy-cli-companion-update" onclick={event => run(event,() => actions.copy('install'))}>{snapshot.companion.mode === 'outdated' ? 'Copy one-time update command' : 'Copy update command'}</button>{/if}
          {#each snapshot.companion.controls as control}<button type="button" class={CLI_BUTTON + (control.danger ? ' gb:cli:text-danger-ink' : '')} disabled={control.disabled || busy} title={control.title || undefined} data-settings-action="control-cli-companion" data-value={control.action} onclick={event => run(event,() => actions.control(control.action))}>{control.label}</button>{/each}
        </div>
      </div>{/if}
    {/if}
  </div>
  <div id="local-agent-status" class="sr-only" role="status" aria-live="polite">{status}</div>
  <details class="gb:cli:mt-3 gb:cli:border-t gb:cli:border-line gb:cli:px-[15px] gb:cli:pt-2.5 gb:cli:pb-[13px]" bind:open={howOpen}><summary class={CLI_LINK}>How CLI agents work</summary><p class="gb:cli:mt-2 gb:cli:mb-0 gb:cli:text-[11px] gb:cli:leading-[1.55] gb:cli:text-secondary">getbased uses a local companion and the selected agent’s existing sign-in. Connection details stay hidden. Local CLI sessions receive health data only through getbased’s approved tools; permission prompts, shell, local files, browser control, plugins, and other computer capabilities stay off. A personal gateway may use tools already configured there under that gateway’s own approval policy, but it does not receive getbased’s local tools. Focused feature jobs such as imports receive no getbased tools.</p></details>
</section>
