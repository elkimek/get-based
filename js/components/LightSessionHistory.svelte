<script lang="ts">
  import LightSessionRow from './LightSessionRow.svelte';
  import LightActiveSession from './LightActiveSession.svelte';
  import type{LightSessionRowProps}from'../light-session-presentation.js';
  let { rows, total, sunCount, deviceCount, modal, showMore, emptySun = false }: { rows: readonly LightSessionRowProps[]; total: number; sunCount: number; deviceCount: number; modal: boolean; showMore: boolean; emptySun?: boolean } = $props();
  const list = 'sun-sessions-list gb:light-session:flex gb:light-session:flex-col gb:light-session:gap-2.5 gb:light-session:w-full gb:light-session:min-w-0 gb:light-session:max-w-full gb:light-session:[.light-page_&]:my-0';
  const modalClass = [
    'modal light-sessions-modal gb:light-session:w-[min(94vw,840px)] gb:light-session:max-w-[840px]',
    'gb:light-session:max-h-[min(88vh,780px)] gb:light-session:p-0 gb:light-session:overflow-hidden gb:light-session:flex',
    'gb:light-session:flex-col gb:light-session:shadow-dialog gb:light-session:max-[720px]:w-full gb:light-session:max-[720px]:max-h-[92vh]',
  ].join(' ');
  const headerClass = [
    'light-sessions-modal-head gb:light-session:relative gb:light-session:flex gb:light-session:items-start',
    'gb:light-session:justify-between gb:light-session:gap-[18px] gb:light-session:pt-6 gb:light-session:pr-16',
    'gb:light-session:pb-[18px] gb:light-session:pl-[26px] gb:light-session:border-b gb:light-session:border-line',
    'gb:light-session:bg-dialog-head gb:light-session:max-[720px]:pt-5 gb:light-session:max-[720px]:pr-[52px] gb:light-session:max-[720px]:pb-4',
    'gb:light-session:max-[720px]:pl-[18px]',
  ].join(' ');
  const bodyClass = [
    'light-sessions-modal-body gb:light-session:min-h-0 gb:light-session:overflow-y-auto gb:light-session:overscroll-contain',
    'gb:light-session:pt-5 gb:light-session:px-[22px] gb:light-session:pb-6 gb:light-session:max-[720px]:p-3',
  ].join(' ');
  const moreClass = [
    'light-sessions-show-more gb:light-session:block gb:light-session:w-full gb:light-session:mt-2',
    'gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:cursor-pointer gb:light-session:border gb:light-session:border-dashed',
    'gb:light-session:border-line gb:light-session:rounded-control gb:light-session:bg-transparent gb:light-session:text-secondary',
    'gb:light-session:text-[12.5px] gb:light-session:px-3 gb:light-session:py-2',
    'gb:light-session:hover:border-accent gb:light-session:focus-visible:outline-2 gb:light-session:focus-visible:outline-accent',
  ].join(' ');
</script>
{#snippet sessionRows()}
  <div class={`${list}${deviceCount ? ' light-sessions-list-unified' : ''} ${modal ? 'gb:light-session:m-0' : 'gb:light-session:my-3'}`} data-light-session-presentation>{#each rows as row}{#if row.kind === 'active'}<LightActiveSession view={row.view}/>{:else}<LightSessionRow view={row.view}/>{/if}{/each}</div>
{/snippet}
{#if modal}
  <div class={modalClass} role="dialog" aria-modal="true" aria-labelledby="light-all-sessions-title" data-light-session-presentation>
    <header class={headerClass}>
      <div><h3 id="light-all-sessions-title" class="gb:light-session:m-0 gb:light-session:text-ink gb:light-session:font-display gb:light-session:text-[22px] gb:light-session:font-bold gb:light-session:max-[720px]:text-[19px]">All sessions ({total})</h3><p class="gb:light-session:mt-[5px] gb:light-session:mb-0 gb:light-session:text-secondary gb:light-session:text-[13px] gb:light-session:leading-normal">{sunCount} outdoor · {deviceCount} device</p></div>
      <button type="button" class="modal-close gb:light-session:absolute gb:light-session:top-2 gb:light-session:right-2 gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11 gb:light-session:text-ink" aria-label="Close" data-light-sessions-close>×</button>
    </header>
    <div class={bodyClass}>
      {#if total}{@render sessionRows()}{:else}<div class="sun-empty"><p>No completed sessions yet.</p></div>{/if}
    </div>
  </div>
{:else if total}
  {@render sessionRows()}
  {#if showMore}<button type="button" class={moreClass} data-light-sessions-action="show-all" data-light-session-presentation>View all {total} sessions</button>{/if}
{:else if emptySun}<div class="sun-empty" data-light-session-presentation><p>No sun sessions logged yet.</p><button type="button" class="import-btn import-btn-primary gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11" data-sun-session-action="quick-log-sun">Log your first session</button></div>
{/if}
