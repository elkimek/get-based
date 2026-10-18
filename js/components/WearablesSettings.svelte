<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { WearablesSettingsSnapshot, WearablesAction, WearablesRow, WearablesImportProgress } from '../wearables-settings-contract.js';
  import { WEARABLES_HELP, WEARABLES_FOCUS, WEARABLES_SUMMARY, WEARABLES_BUTTON, WEARABLES_CONNECT, WEARABLES_BUTTON_TONE } from '../wearables-settings-classes.js';
  let { initial }: { initial: WearablesSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let manualCounts = $state('Counting readings…');
  let pending = $state(new Set<string>());
  let progress: WearablesImportProgress | null = $state(null);
  let opened = $state(new Set<string>());
  let toggled = $state(new Set<string>());
  let light = $state(false);
  export function update(next: WearablesSettingsSnapshot): void {
    if (next.profileId !== snapshot.profileId) { opened = new Set(); toggled = new Set(); pending = new Set(); progress = null; manualCounts = 'Counting readings…'; }
    snapshot = next;
  }
  export function setManualCounts(message: string): void { manualCounts = message; }
  export function setPending(adapterId: string, busy: boolean): void {
    const next = new Set(pending); if (busy) next.add(adapterId); else next.delete(adapterId); pending = next;
  }
  export function setImportProgress(value: WearablesImportProgress | null): void { progress = value; }
  function rememberOpen(id: string, event: Event): void {
    const detail = event.currentTarget as HTMLDetailsElement;
    const next = new Set(opened); if (detail.open) next.add(id); else next.delete(id); opened = next;
    toggled = new Set(toggled).add(id);
  }
  onMount(() => {
    const root = document.documentElement;
    const refresh = () => { light = root.getAttribute('data-theme') === 'light'; };
    refresh(); const observer = new MutationObserver(refresh); observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  });
</script>
{#snippet actionButton(item: WearablesAction, rowId: string, compactRow = false)}
  <button type="button" class={`${compactRow ? WEARABLES_CONNECT : WEARABLES_BUTTON} ${WEARABLES_BUTTON_TONE[item.tone || 'primary']} ${pending.has(rowId) ? 'is-syncing' : ''}`} data-wearable-settings-action={item.action} data-wearable-settings-adapter={item.adapter} data-wearable-settings-stop-propagation="true" aria-label={item.ariaLabel} title={item.title} disabled={pending.has(rowId) || (rowId === 'apple_health' && !!progress && !progress.failed && progress.percent < 100)}>
    {#if item.action === 'sync-now'}<svg class="wearable-action-icon gb:wearables:shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>{/if}
    <span>{item.label}{#if item.hint}<span class="wearable-action-hint gb:wearables:block gb:wearables:text-[10px] gb:wearables:font-normal gb:wearables:text-inherit gb:wearables:ml-0">{item.hint}</span>{/if}</span>
  </button>
{/snippet}
{#snippet rowHeader(row: WearablesRow)}
  {#if row.iconLight || row.iconDark}<span class="wearable-vendor-icon gb:wearables:flex gb:wearables:items-center gb:wearables:shrink-0" aria-hidden="true"><img class="wearable-vendor-icon-img gb:wearables:max-w-[92px] gb:wearables:h-5 gb:wearables:w-auto" src={light ? row.iconDark || row.iconLight : row.iconLight || row.iconDark} alt="" height="20" loading="lazy"></span>
  {:else if row.mono}<span class="wearable-vendor-icon gb:wearables:shrink-0 gb:wearables:size-5 gb:wearables:bg-ink gb:wearables:[mask-image:var(--mark-url)] gb:wearables:[mask-size:contain] gb:wearables:[mask-repeat:no-repeat] gb:wearables:[mask-position:center]" style:--mark-url={`url('${row.mono}')`} aria-hidden="true"></span>{/if}
  <span class={`wearable-row-name gb:wearables:text-[14px] gb:wearables:font-semibold gb:wearables:text-ink ${row.wordmark ? 'gb:wearables:sr-only' : 'gb:wearables:shrink-0'}`}>{row.name}</span>
  <span class={`wearable-row-status gb:wearables:flex gb:wearables:flex-wrap gb:wearables:items-center gb:wearables:gap-1 gb:wearables:text-[12px] gb:wearables:flex-1 gb:wearables:min-w-0 gb:wearables:break-words ${row.tone === 'success' ? 'wearable-row-status-ok gb:wearables:text-success-ink' : row.tone === 'danger' ? 'wearable-row-status-bad gb:wearables:text-danger' : 'wearable-row-status-muted gb:wearables:text-secondary'}`}><span>{row.status}</span>{#if row.updated}<span class="wearable-row-status-separator gb:wearables:max-[600px]:hidden gb:wearables:text-secondary" aria-hidden="true">·</span><span class="wearable-row-status-detail gb:wearables:max-[600px]:hidden gb:wearables:text-secondary">{row.updated}</span>{/if}</span>
  <span class="wearable-row-action gb:wearables:ml-auto gb:wearables:shrink-0">{#if row.detail === 'none' && row.primaryAction}{@render actionButton(row.primaryAction,row.id,true)}{:else if row.detail !== 'none'}<span class={`wearable-row-chevron gb:wearables:text-secondary gb:wearables:inline-block ${opened.has(row.id) || (row.startOpen && !toggled.has(row.id)) ? 'gb:wearables:rotate-180' : ''}`} aria-hidden="true">▾</span>{/if}</span>
{/snippet}
{#snippet rowDetail(row: WearablesRow)}
  <div class="wearable-row-detail gb:wearables:flex gb:wearables:flex-col gb:wearables:gap-2 gb:wearables:border-t gb:wearables:border-line gb:wearables:bg-secondary-surface gb:wearables:pt-2 gb:wearables:pr-4 gb:wearables:pb-4 gb:wearables:pl-12 gb:wearables:max-[480px]:px-3">
    {#if row.primaryAction}<div class="wearable-adapter-actions gb:wearables:flex gb:wearables:flex-wrap gb:wearables:gap-2">{@render actionButton(row.primaryAction,row.id)}</div>{/if}
    {#if row.identity}<div class="wearable-adapter-identity gb:wearables:text-[13px] gb:wearables:text-ink gb:wearables:break-words">{row.identity}</div>{/if}
    {#if row.meta}<div class="wearable-adapter-meta gb:wearables:text-[11px] gb:wearables:text-secondary">{row.meta}</div>{/if}
    {#each row.notices as notice}<p class={`wearable-adapter-hint wearable-adapter-privacy ${WEARABLES_HELP}`}>{notice}</p>{/each}
    {#if row.detail === 'manual'}<div id="wearable-manual-counts" data-role="manual-counts" role="status" class="wearable-adapter-meta gb:wearables:text-[11px] gb:wearables:text-secondary">{manualCounts}</div>{/if}
    {#if row.explanation}<p class={`wearable-adapter-hint ${WEARABLES_HELP}`}>{row.explanation}{#if row.docsUrl} <a class={`wearable-row-link gb:wearables:inline-flex gb:wearables:items-center gb:wearables:[@media(pointer:coarse)]:min-h-11 gb:wearables:text-ink gb:wearables:underline ${WEARABLES_FOCUS}`} href={row.docsUrl} target="_blank" rel="noopener">{row.docsLabel} ↗</a>{/if}</p>{/if}
    {#if row.actions.length || row.manageAccessUrl}<div class="wearable-adapter-actions gb:wearables:flex gb:wearables:flex-wrap gb:wearables:gap-2">
      {#if row.manageAccessUrl}<a class={`${WEARABLES_BUTTON} gb:wearables:text-ink`} href={row.manageAccessUrl} target="_blank" rel="noopener">Revoke access everywhere ↗</a>{/if}
      {#each row.actions as item}{@render actionButton(item,row.id)}{/each}
    </div>{/if}
    {#if row.detail === 'apple'}
      {#if !row.connected}<details class="wearable-adapter-hint apple-health-howto gb:wearables:text-[12px] gb:wearables:text-secondary">
        <summary class={`gb:wearables:[@media(pointer:coarse)]:min-h-11 gb:wearables:[@media(pointer:coarse)]:py-3 gb:wearables:cursor-pointer gb:wearables:text-ink ${WEARABLES_FOCUS}`}>How to export from your iPhone</summary>
        <ol class="gb:wearables:pl-5 gb:wearables:my-2 gb:wearables:leading-[1.55] gb:wearables:list-decimal"><li>Open the <b>Health</b> app on your iPhone.</li><li>Tap your profile photo (top-right corner).</li><li>Scroll down → tap <b>Export All Health Data</b>.</li><li>AirDrop or email the resulting <code>export.zip</code> to your computer.</li><li>Drop it below (or unzip and drop the <code>export.xml</code> inside).</li></ol>
        <p class="apple-health-privacy gb:wearables:italic">Parsing runs entirely in your browser — the file never leaves this device.</p>
      </details>
      <button type="button" class={`apple-health-dropzone gb:wearables:w-full gb:wearables:mt-2.5 gb:wearables:p-4 gb:wearables:border gb:wearables:border-dashed gb:wearables:border-line gb:wearables:rounded-[8px] gb:wearables:bg-surface gb:wearables:text-secondary gb:wearables:text-center gb:wearables:cursor-pointer gb:wearables:hover:border-accent gb:wearables:[&.drag-over]:border-accent ${WEARABLES_FOCUS}`} data-wearable-settings-dropzone="apple-health" data-wearable-settings-action="pick-apple-health-file" disabled={!!progress && !progress.failed && progress.percent < 100}>
        <span class="apple-health-dropzone-icon gb:wearables:block gb:wearables:text-[22px]" aria-hidden="true">📂</span><span class="apple-health-dropzone-text gb:wearables:block gb:wearables:text-[12px]">Drop <code>export.zip</code> or <code>export.xml</code> here — or click to pick a file</span>
      </button>{/if}
      <div id="apple-health-progress" class="apple-health-progress gb:wearables:mt-2.5 gb:wearables:flex gb:wearables:flex-col gb:wearables:gap-1" hidden={!progress}>
        <div class="apple-health-progress-bar gb:wearables:h-1 gb:wearables:rounded gb:wearables:overflow-hidden gb:wearables:bg-surface" role="progressbar" aria-label="Apple Health import" aria-valuenow={progress?.percent || 0} aria-valuemin="0" aria-valuemax="100"><div class="apple-health-progress-fill gb:wearables:h-full gb:wearables:bg-accent" style:width={`${progress?.percent || 0}%`}></div></div>
        <div class={`apple-health-progress-text gb:wearables:text-[11px] ${progress?.failed ? 'gb:wearables:text-danger' : 'gb:wearables:text-secondary'}`} role="status">{progress?.message || ''}</div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" hidden data-wearable-settings-input="apple-health-file">
    {/if}
  </div>
{/snippet}
<div data-wearables-view class="gb:wearables:[&_[hidden]]:hidden">
  <div class="settings-action-row wearable-visibility-row gb:wearables:mb-4"><div class="settings-copy"><div class="settings-copy-title">Show wearable data on the dashboard</div><div class="settings-copy-desc gb:wearables:text-secondary">Turn this off to hide readings from connected services. Manual weight, blood pressure, and pulse entries stay visible.</div></div>
    <label class="gb:wearables:inline-flex gb:wearables:items-center gb:wearables:justify-center gb:wearables:w-8 gb:wearables:h-7 gb:wearables:[@media(pointer:coarse)]:size-11 gb:wearables:shrink-0 gb:wearables:cursor-pointer"><input type="checkbox" id="wearables-strip-hidden-toggle" aria-label="Show wearable data on the dashboard" checked={!snapshot.stripHidden} data-wearable-settings-input="strip-hidden" class="gb:peer gb:wearables:sr-only"><span aria-hidden="true" class="gb:wearables:relative gb:wearables:block gb:wearables:w-8 gb:wearables:h-[18px] gb:wearables:rounded-full gb:wearables:bg-line gb:wearables:transition-colors gb:wearables:motion-reduce:transition-none gb:wearables:peer-checked:bg-accent gb:wearables:peer-focus-visible:outline-2 gb:wearables:peer-focus-visible:outline-offset-2 gb:wearables:peer-focus-visible:outline-accent gb:wearables:before:content-[''] gb:wearables:before:absolute gb:wearables:before:top-0.5 gb:wearables:before:left-0.5 gb:wearables:before:size-3.5 gb:wearables:before:rounded-full gb:wearables:before:bg-[var(--bg-primary)] gb:wearables:peer-checked:before:translate-x-3.5"></span></label>
  </div>
  <div class="wearable-sources-intro gb:wearables:px-[17px] gb:wearables:py-[15px] gb:wearables:max-[480px]:p-3.5 gb:wearables:border gb:wearables:border-line gb:wearables:rounded-[12px] gb:wearables:bg-surface" aria-labelledby="wearable-sources-title">
    <div class="wearable-sources-heading"><div class="settings-section-title gb:wearables:flex gb:wearables:items-center gb:wearables:gap-2 gb:wearables:text-[14px]" id="wearable-sources-title">Health data sources <span class="wearable-beta-label gb:wearables:px-2 gb:wearables:py-0.5 gb:wearables:border gb:wearables:border-line gb:wearables:rounded-full gb:wearables:text-ink gb:wearables:font-mono gb:wearables:text-[9px] gb:wearables:uppercase">Beta</span></div><p class={WEARABLES_HELP}>Connect a service to bring its readings into this profile. Connections and imported history stay on this device unless you turn on encrypted sync.</p></div>
    <details class="wearable-sources-privacy gb:wearables:mt-3 gb:wearables:pt-2 gb:wearables:border-t gb:wearables:border-line"><summary class={`gb:wearables:[@media(pointer:coarse)]:min-h-11 gb:wearables:[@media(pointer:coarse)]:py-3 gb:wearables:text-[11px] gb:wearables:text-secondary gb:wearables:cursor-pointer ${WEARABLES_FOCUS}`}>How your data is protected</summary><p class={WEARABLES_HELP}>Connection keys plus WHOOP and Google Health imports are always encrypted on this device. Other imported history is encrypted when you protect the profile with a passphrase.</p><p class={WEARABLES_HELP}>On getbased.health, the secure getbased relay forwards supported service requests without intentionally storing their contents. Self-hosted connections use the deployment owner's server.</p><p class={WEARABLES_HELP}>Encrypted sync and cloud AI are separate choices with their own controls.</p></details>
  </div>
  <div class="wearables-adapter-groups gb:wearables:flex gb:wearables:flex-col gb:wearables:gap-5 gb:wearables:mt-4">
    {#each snapshot.groups as group (group.id)}<section class="wearables-adapter-group" data-wearable-group={group.id} aria-labelledby={`wearables-group-${group.id}`}>
      <div class="wearables-adapter-group-heading gb:wearables:flex gb:wearables:items-baseline gb:wearables:justify-between gb:wearables:gap-4 gb:wearables:max-[600px]:block"><h3 id={`wearables-group-${group.id}`} class="wearables-adapter-group-title gb:wearables:m-0 gb:wearables:text-[13px] gb:wearables:font-[650] gb:wearables:leading-[1.4] gb:wearables:text-ink">{group.title}</h3><p class="wearables-adapter-group-hint gb:wearables:m-0 gb:wearables:text-[11px] gb:wearables:text-secondary">{group.hint}</p></div>
      <div class="wearables-adapter-list gb:wearables:mt-2 gb:wearables:border gb:wearables:border-line gb:wearables:rounded-[10px] gb:wearables:overflow-hidden gb:wearables:bg-surface">
        {#each group.rows as row (row.id)}
          {#if row.detail !== 'none'}<details class={`wearable-row gb:wearables:border-b gb:wearables:border-line gb:wearables:last:border-b-0 ${row.connected ? 'is-connected' : ''}`} data-adapter={row.id} open={opened.has(row.id) || (row.startOpen && !toggled.has(row.id))} ontoggle={event => rememberOpen(row.id,event)}><summary class={WEARABLES_SUMMARY}>{@render rowHeader(row)}</summary>{@render rowDetail(row)}</details>
          {:else}<div class="wearable-row gb:wearables:border-b gb:wearables:border-line gb:wearables:last:border-b-0" data-adapter={row.id}><div class={`${WEARABLES_SUMMARY} wearable-row-summary-flat gb:wearables:cursor-default`}>{@render rowHeader(row)}</div></div>{/if}
        {/each}
      </div>
    </section>{/each}
  </div>
</div>
