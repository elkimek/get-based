<script lang="ts">
  import LightSessionAI from './LightSessionAI.svelte';
  import type{SessionAIView}from'../light-session-ai-presentation.js';
  import type { SessionDetailView, SessionDetailNotice } from '../light-session-detail-presentation.js';
  import LightSessionDetailFields from './LightSessionDetailFields.svelte';
  let { view, ai }: { view: SessionDetailView; ai: Readonly<SessionAIView> | null } = $props();
  const modal = [
    'modal sun-detail-modal gb:light-detail:w-full gb:light-detail:max-w-[540px] gb:light-detail:min-w-0 gb:light-detail:max-[480px]:p-4',
    'gb:light-detail:border-[color-mix(in_srgb,var(--session-accent)_24%,var(--border))]',
    'gb:light-detail:[box-shadow:var(--shadow-lg),inset_0_3px_0_color-mix(in_srgb,var(--session-accent)_78%,transparent)]',
  ].join(' ');
  const header = 'modal-header gb:light-detail:bg-dialog-head gb:light-detail:border-line';
  const section = 'sun-detail-section gb:light-detail:my-3.5';
  const sectionLabel = 'sun-detail-section-label gb:light-detail:mb-1.5 gb:light-detail:text-[11px] gb:light-detail:text-secondary gb:light-detail:uppercase gb:light-detail:tracking-[0.04em]';
  const disclosure = 'sun-detail-disclosure gb:light-detail:my-3 gb:light-detail:min-w-0 gb:light-detail:border gb:light-detail:border-line gb:light-detail:rounded-control gb:light-detail:bg-secondary-surface gb:light-detail:overflow-hidden';
  const summary = 'gb:light-detail:px-[13px] gb:light-detail:py-[11px] gb:light-detail:[@media(pointer:coarse)]:min-h-11 gb:light-detail:max-[480px]:min-h-11 gb:light-detail:box-border gb:light-detail:text-[13px] gb:light-detail:font-semibold gb:light-detail:text-ink gb:light-detail:cursor-pointer gb:light-detail:list-inside gb:light-detail:focus-visible:outline-2 gb:light-detail:focus-visible:outline-accent gb:light-detail:in-open:border-b gb:light-detail:in-open:border-line';
  const inset = 'gb:light-detail:mx-3 gb:light-detail:my-2.5';
  const hint = 'gb:light-detail:text-xs gb:light-detail:text-secondary gb:light-detail:leading-normal gb:light-detail:wrap-anywhere';
  const action = 'import-btn import-btn-secondary gb:light-detail:[@media(pointer:coarse)]:min-h-11 gb:light-detail:max-[480px]:min-h-11 gb:light-detail:text-ink';
  const channel = [
    'sun-detail-channel-row sun-detail-channel-row-clickable gb:light-detail:grid gb:light-detail:w-full gb:light-detail:min-w-0',
    'gb:light-detail:grid-cols-[30px_minmax(0,1fr)_auto_auto_14px] gb:light-detail:items-center gb:light-detail:gap-x-2.5 gb:light-detail:gap-y-2',
    'gb:light-detail:[@media(pointer:coarse)]:min-h-11 gb:light-detail:max-[480px]:min-h-11 gb:light-detail:p-3 gb:light-detail:border gb:light-detail:border-line gb:light-detail:rounded-control',
    'gb:light-detail:bg-surface gb:light-detail:text-ink gb:light-detail:font-body gb:light-detail:text-[13px] gb:light-detail:text-left',
    'gb:light-detail:cursor-pointer gb:light-detail:hover:border-accent gb:light-detail:focus-visible:outline-2 gb:light-detail:focus-visible:outline-accent',
    'gb:light-detail:max-[480px]:grid-cols-[24px_minmax(0,1fr)_auto]',
  ].join(' ');
</script>
{#snippet notice(item: SessionDetailNotice)}
  <div class={`light-device-safety${item.danger ? ' is-over' : ''} gb:light-detail:grid gb:light-detail:gap-1 gb:light-detail:my-2.5 gb:light-detail:px-3 gb:light-detail:py-2.5 gb:light-detail:border gb:light-detail:rounded-control ${hint} ${item.danger ? 'gb:light-detail:border-danger gb:light-detail:bg-[var(--red-bg)]' : 'gb:light-detail:border-warning gb:light-detail:bg-[var(--orange-bg)]'}`}>
    <strong class="gb:light-detail:text-ink">{item.title}</strong><span>{item.text}</span>
  </div>
{/snippet}
<div class={`${modal} ${view.kind === 'sun' ? 'gb:light-detail:[--session-accent:var(--orange)]' : 'gb:light-detail:[--session-accent:var(--red)]'}`} data-light-detail-presentation data-session-kind={view.kind} role="dialog" aria-modal="true" aria-label={view.kind === 'sun' ? 'Sun session details' : 'Device session details'}>
  <div class={header}>
    <h3 class="gb:light-detail:wrap-anywhere gb:light-detail:max-[480px]:text-[15px] gb:light-detail:max-[480px]:leading-tight">{view.title}</h3>
    <button type="button" class="modal-close gb:light-detail:[@media(pointer:coarse)]:min-h-11 gb:light-detail:max-[480px]:min-h-11 gb:light-detail:[@media(pointer:coarse)]:min-w-11 gb:light-detail:max-[480px]:min-w-11 gb:light-detail:text-secondary" data-sun-session-action={view.kind === 'sun' ? 'close-modal' : undefined} data-device-session-detail-close={view.kind === 'device' ? '' : undefined} aria-label="Close">×</button>
  </div>
  <div class="modal-body gb:light-detail:min-w-0">
    <LightSessionDetailFields fields={view.summary} kind="summary"/>
    {#each view.notices as item}{@render notice(item)}{/each}
    {#if view.calculation}
      <div class={`sun-calculation-state${view.calculation.error ? ' is-error' : ''} gb:light-detail:flex gb:light-detail:flex-wrap gb:light-detail:items-center gb:light-detail:justify-between gb:light-detail:gap-3 gb:light-detail:mb-3.5 gb:light-detail:p-3 gb:light-detail:border gb:light-detail:rounded-control ${view.calculation.error ? 'gb:light-detail:border-danger gb:light-detail:bg-[var(--red-bg)]' : 'gb:light-detail:border-warning gb:light-detail:bg-[var(--orange-bg)]'} ${hint}`} role="status">
        <span>{view.calculation.message}</span>
        {#if view.calculation.retry}<button type="button" class={action} data-sun-session-action="retry-calculation" data-sun-session-id={view.id}>Retry calculation</button>{/if}
      </div>
    {/if}
    <div class={section}>
      <div class={sectionLabel}>Exposure setup</div>
      <LightSessionDetailFields fields={view.setup} kind="setup"/>
    </div>
    {#if ai}
      <div class={section}><div class={sectionLabel}>Session interpretation</div><LightSessionAI view={ai}/></div>
    {/if}
    <details class={disclosure}>
      <summary class={summary}>Modeled light signals</summary>
      <p class={`${inset} ${hint}`}>{view.signalsDescription}</p>
      {#if view.lightMetric}<div class={inset}>{@render notice(view.lightMetric)}</div>{/if}
      {#if view.channels.length}
        <div class={`sun-detail-channels ${inset} gb:light-detail:flex gb:light-detail:flex-col gb:light-detail:gap-1.5`}>
          {#each view.channels as item}
            <button type="button" class={`${channel} sun-chip-tier-${item.hasSignal ? 2 : 0}`} data-channel={item.key} data-sun-session-action={view.kind === 'sun' ? 'open-channel' : undefined} data-sun-session-channel={view.kind === 'sun' ? item.key : undefined} aria-label={item.ariaLabel}>
              <span class="sun-detail-channel-icon gb:light-detail:text-base gb:light-detail:max-[480px]:col-start-1 gb:light-detail:max-[480px]:row-start-1" aria-hidden="true">{item.icon}</span>
              <span class="sun-detail-channel-label gb:light-detail:font-semibold gb:light-detail:wrap-anywhere gb:light-detail:max-[480px]:col-start-2 gb:light-detail:max-[480px]:row-start-1">{item.label}</span>
              <span class="sun-detail-channel-value gb:light-detail:text-xs gb:light-detail:text-secondary gb:light-detail:tabular-nums gb:light-detail:wrap-anywhere gb:light-detail:text-right gb:light-detail:max-[480px]:text-left gb:light-detail:max-[480px]:col-start-2 gb:light-detail:max-[480px]:row-start-2">{item.value}</span>
              <span class="sun-detail-channel-tier gb:light-detail:text-[10px] gb:light-detail:text-secondary gb:light-detail:border gb:light-detail:border-line gb:light-detail:rounded-full gb:light-detail:px-2 gb:light-detail:py-1 gb:light-detail:uppercase gb:light-detail:wrap-anywhere gb:light-detail:max-[480px]:col-start-2 gb:light-detail:max-[480px]:row-start-3 gb:light-detail:max-[480px]:justify-self-start">{item.source}</span>
              <span class="sun-detail-channel-chevron gb:light-detail:text-secondary gb:light-detail:text-base gb:light-detail:max-[480px]:col-start-3 gb:light-detail:max-[480px]:row-start-1" aria-hidden="true">›</span>
            </button>
          {/each}
        </div>
      {:else}<p class={`sun-detail-empty ${inset} ${hint}`}>{view.channelsEmpty}</p>{/if}
    </details>
    <details class={disclosure}>
      <summary class={summary}>{view.inputTitle}</summary>
      <p class={`${inset} ${hint}`}>{view.inputDescription}</p>
      {#if view.inputs.length}<div class={inset}><LightSessionDetailFields fields={view.inputs} kind="inputs"/></div>
      {:else}<p class={`sun-detail-empty ${inset} ${hint}`}>{view.inputsEmpty}</p>{/if}
      {#if view.location}
        <div class={`sun-detail-input-location ${inset} gb:light-detail:grid gb:light-detail:gap-1 ${hint}`}><span>{view.location.label}</span>{' '}<strong class="gb:light-detail:text-ink gb:light-detail:wrap-anywhere">{view.location.value}</strong></div>
      {/if}
      {#if view.sourceUrl}<p class={inset}><a href={view.sourceUrl} target="_blank" rel="noopener noreferrer" class="gb:light-detail:text-link-ink gb:light-detail:[@media(pointer:coarse)]:min-h-11 gb:light-detail:max-[480px]:min-h-11 gb:light-detail:inline-flex gb:light-detail:items-center">Open saved specification source ↗</a></p>{/if}
    </details>
    {#if view.notes}<div class={section}><div class={sectionLabel}>Notes</div><div class="sun-detail-section-value gb:light-detail:text-[13px] gb:light-detail:text-ink gb:light-detail:leading-normal gb:light-detail:wrap-anywhere">{view.notes}</div></div>{/if}
    <div class="modal-actions gb:light-detail:mt-[18px] gb:light-detail:flex gb:light-detail:flex-wrap gb:light-detail:gap-2">
      {#if view.canEditDuration}<button type="button" class={action} id={view.kind === 'device' ? 'device-detail-edit-duration' : undefined} data-sun-session-action={view.kind === 'sun' ? 'edit-duration' : undefined} data-sun-session-id={view.kind === 'sun' ? view.id : undefined} title={view.kind === 'sun' ? 'Override the session duration. Use when a re-end on a second device set it wrong, or you forgot to stop on time.' : 'Override the session duration. Use when you forgot to stop the timer or stopped late.'}>Edit duration</button>{/if}
      {#if view.canEditMode}<button type="button" class={action} id="device-detail-edit-mode" title="Change which LED-group mode the session ran in. Doses recompute on save.">Edit mode</button>{/if}
      <button type="button" class={`${action} gb:light-detail:border-danger gb:light-detail:text-danger-ink`} id={view.kind === 'device' ? 'device-detail-delete' : undefined} data-sun-session-action={view.kind === 'sun' ? 'delete-session' : undefined} data-sun-session-id={view.kind === 'sun' ? view.id : undefined} data-sun-session-close-modal={view.kind === 'sun' ? 'true' : undefined}>Delete session</button>
    </div>
  </div>
</div>
