<script lang="ts">
  import type { CompletedLightSessionView } from '../light-session-presentation.js';
  let { view }: { view: CompletedLightSessionView } = $props();
  const badge = 'gb:light-session:shrink-0 gb:light-session:rounded-full gb:light-session:border gb:light-session:px-2 gb:light-session:py-1 gb:light-session:text-[10.5px] gb:light-session:leading-tight gb:light-session:max-[720px]:col-[2/-1] gb:light-session:max-[720px]:justify-self-start gb:light-session:max-[720px]:max-w-full gb:light-session:wrap-anywhere';
  const iconClass = [
    'light-session-icon gb:light-session:inline-flex gb:light-session:items-center gb:light-session:justify-center',
    'gb:light-session:size-[30px] gb:light-session:shrink-0 gb:light-session:rounded-full',
    'gb:light-session:border gb:light-session:border-line gb:light-session:text-base',
    'gb:light-session:max-[720px]:col-start-1 gb:light-session:max-[720px]:row-start-1',
  ].join(' ');
  const summaryClass = [
    'light-session-summary gb:light-session:flex-1 gb:light-session:min-w-0 gb:light-session:max-[720px]:col-start-2',
    'gb:light-session:max-[720px]:row-start-1',
  ].join(' ');
  const titleClass = [
    'light-session-title gb:light-session:flex gb:light-session:items-baseline gb:light-session:gap-2',
    'gb:light-session:text-[13.5px] gb:light-session:font-semibold gb:light-session:text-ink gb:light-session:wrap-anywhere',
  ].join(' ');
  const metadataClass = [
    'light-session-meta-line gb:light-session:flex gb:light-session:flex-wrap gb:light-session:items-center',
    'gb:light-session:gap-x-[9px] gb:light-session:gap-y-1 gb:light-session:mt-1 gb:light-session:text-xs',
    "gb:light-session:text-secondary gb:light-session:tabular-nums gb:light-session:[&>span+span]:before:content-['·'] gb:light-session:[&>span+span]:before:mr-[9px]",
  ].join(' ');
  const chevronClass = [
    'light-session-chevron gb:light-session:text-secondary gb:light-session:text-[21px] gb:light-session:leading-none',
    'gb:light-session:max-[720px]:col-start-3 gb:light-session:max-[720px]:row-start-1',
  ].join(' ');
  const rowClass = [
    'gb:light-session:w-full gb:light-session:min-w-0 gb:light-session:max-w-full gb:light-session:min-h-16',
    'gb:light-session:flex gb:light-session:items-center gb:light-session:gap-3 gb:light-session:rounded-[var(--radius)]',
    'gb:light-session:border gb:light-session:border-line gb:light-session:bg-surface gb:light-session:px-3.5',
    'gb:light-session:py-[11px] gb:light-session:text-left gb:light-session:font-body gb:light-session:cursor-pointer',
    'gb:light-session:focus-visible:outline-2 gb:light-session:focus-visible:outline-offset-2 gb:light-session:focus-visible:outline-accent gb:light-session:hover:border-accent',
    'gb:light-session:max-[720px]:grid gb:light-session:max-[720px]:grid-cols-[30px_minmax(0,1fr)_auto] gb:light-session:max-[720px]:items-start gb:light-session:max-[720px]:gap-y-2',
  ].join(' ');
</script>
<button type="button" class={`sun-session light-session-row light-session-complete light-session-${view.kind} ${rowClass}`} data-light-session-presentation data-light-history-row data-id={view.id} aria-label={view.ariaLabel} data-sun-session-action={view.kind === 'sun' ? 'open-detail' : undefined} data-sun-session-id={view.kind === 'sun' ? view.id : undefined} data-light-sessions-action={view.kind === 'device' ? 'open-device-session' : undefined} data-light-session-id={view.kind === 'device' ? view.id : undefined}>
  <span class={`${iconClass} ${view.kind === 'sun' ? 'gb:light-session:bg-[var(--yellow-bg)] gb:light-session:text-warning-ink' : 'gb:light-session:bg-[var(--red-bg)] gb:light-session:text-danger-ink'}`} aria-hidden="true">{view.kind === 'sun' ? '☀' : '◉'}</span>
  <span class={summaryClass}>
    <span class={titleClass}><span class="light-session-kind gb:light-session:shrink-0 gb:light-session:text-[10px] gb:light-session:text-secondary gb:light-session:uppercase gb:light-session:tracking-[0.05em]">{view.kind === 'sun' ? 'Outdoor' : 'Device'}</span>{view.name}</span>
    <span class={metadataClass}>
      <span class="sun-session-date">{view.date}</span>{' '}{#if view.time}<span>{view.time}</span>{' '}{/if}<span class="sun-session-duration">{view.duration}</span>{' '}{#if view.vitaminD}<span class="light-session-outcome gb:light-session:font-semibold">Vitamin D est. {view.vitaminD}</span>{/if}
    </span>
  </span>
  {#if view.mode}<span class={`light-session-mode-chip${view.mode.accent ? ' light-session-mode-chip-accent' : ''} ${badge} ${view.mode.accent ? 'gb:light-session:border-accent gb:light-session:text-ink gb:light-session:bg-hover gb:light-session:font-semibold' : 'gb:light-session:border-line gb:light-session:text-secondary'}`} title="LED-group mode that fired during this session">{view.mode.label}</span>{/if}
  {#if view.warning}<span class={`light-session-warning${view.warning.danger ? ' light-session-warning-danger' : ''} ${badge} gb:light-session:max-w-[190px] gb:light-session:text-center gb:light-session:text-ink ${view.warning.danger ? 'gb:light-session:border-danger gb:light-session:bg-[var(--red-bg)]' : 'gb:light-session:border-warning gb:light-session:bg-[var(--orange-bg)]'}`}>{view.warning.label}</span>{/if}
  <span class={chevronClass} aria-hidden="true">›</span>
</button>
