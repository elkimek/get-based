<script lang="ts">
  import LightTodayAI from './LightTodayAI.svelte';
  import LightConditionsPresentation from './LightConditionsPresentation.svelte';
  import LightDashboardPills from './LightDashboardPills.svelte';
  import type{ReviewAIView}from'../light-review-ai-presentation.js';
  import type{ConditionsPresentationProps}from'../light-conditions-presentation.js';
  import type{LightDashboardPill}from'../light-page-presentation.js';
  import type { LightTodayView } from '../light-today-presentation.js';
  let { view, dashboard, conditions, pills }: { view: LightTodayView; dashboard: Readonly<ReviewAIView>|null; conditions: ConditionsPresentationProps; pills: readonly LightDashboardPill[] } = $props();
  const actionClass = 'light-today-cta gb:light-page:[@media(pointer:coarse)]:min-h-11 gb:light-page:max-[480px]:min-h-11 gb:light-page:[@media(pointer:coarse)]:min-w-11 gb:light-page:max-[480px]:min-w-11 gb:light-page:cursor-pointer gb:light-page:rounded-control gb:light-page:border-0 gb:light-page:px-4 gb:light-page:py-2 gb:light-page:text-[13px] gb:light-page:font-semibold gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-offset-2 gb:light-page:focus-visible:outline-accent';
  const chipClass = 'gb:light-page:inline-flex gb:light-page:items-center gb:light-page:rounded-[10px] gb:light-page:border gb:light-page:border-line gb:light-page:bg-hover gb:light-page:px-2.5 gb:light-page:py-[3px] gb:light-page:text-xs gb:light-page:font-semibold gb:light-page:text-ink';
</script>
<section class="light-today-strip gb:light-page:mt-4 gb:light-page:mb-2 gb:light-page:bg-surface gb:light-page:border gb:light-page:border-line gb:light-page:rounded-[var(--radius)] gb:light-page:px-4 gb:light-page:pt-3.5 gb:light-page:pb-3 gb:light-page:shadow-[var(--shadow)] gb:light-page:flex gb:light-page:flex-col gb:light-page:gap-2.5 gb:light-page:min-w-0" data-light-page-presentation>
  <div class="light-today-head gb:light-page:flex gb:light-page:items-center gb:light-page:flex-wrap gb:light-page:gap-2 gb:light-page:mb-1">
    <span class="light-today-icon gb:light-page:text-base gb:light-page:text-accent" aria-hidden="true">☀</span>
    <span class="light-today-title gb:light-page:text-[15px] gb:light-page:font-semibold gb:light-page:text-ink">Light Today</span>
    <span class="light-today-sub gb:light-page:text-xs gb:light-page:text-secondary gb:light-page:ml-1" title={view.weekTitle}>{view.weekTotal} light session{view.weekTotal !== 1 ? 's' : ''} this week</span>
    {#if view.altitude}<span class={`light-today-altitude ${chipClass}`} title={view.altitude.title}>{view.altitude.label}</span>{/if}
    <button type="button" class="light-today-link gb:light-page:ml-auto gb:light-page:[@media(pointer:coarse)]:min-h-11 gb:light-page:max-[480px]:min-h-11 gb:light-page:[@media(pointer:coarse)]:min-w-11 gb:light-page:max-[480px]:min-w-11 gb:light-page:cursor-pointer gb:light-page:border-0 gb:light-page:bg-transparent gb:light-page:p-0 gb:light-page:font-body gb:light-page:text-xs gb:light-page:text-ink gb:light-page:underline gb:light-page:decoration-accent gb:light-page:underline-offset-2 gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-accent" data-light-page-action="navigate-light">Open Light &amp; Sun →</button>
  </div>
  {#if dashboard}<LightTodayAI view={dashboard}/>{/if}{' '}<LightConditionsPresentation {...conditions}/>{' '}<LightDashboardPills {pills}/>
  {#if view.weekly || view.budget}<div class="light-today-vitd-row gb:light-page:mt-1.5 gb:light-page:flex gb:light-page:flex-wrap gb:light-page:items-center gb:light-page:gap-2">
    {#if view.weekly}<span class={`light-today-vitd ${chipClass}`} title="Modeled vitamin D IU-equivalent from incident action-weighted UVB over the last 7 days. This is not measured skin absorption or a predicted blood response; optical and individual biological uncertainty is multi-fold.">{view.weekly}</span>{/if}
    {#if view.budget}<span class={`light-today-vitd-${view.budget.tone} ${chipClass}`} title={view.budget.title}>{view.budget.label}</span>{/if}
  </div>{/if}
  <div class="light-today-foot gb:light-page:flex gb:light-page:items-center gb:light-page:gap-3 gb:light-page:flex-wrap gb:light-page:mt-1 gb:light-page:text-xs gb:light-page:text-secondary">
    {#if view.burn}<span class={`light-today-med light-today-med-${view.burn.tone} gb:light-page:text-ink`} title="Today's modeled erythemal dose compared with a rough Fitzpatrick base MED. This is not a personal threshold, and sunscreen is not credited as extra safe time.">☀ Sun exposure today: <strong>{view.burn.message}</strong>{view.burn.percent > 0 ? ` (${view.burn.percent}%)` : ''}</span>{/if}
    <div class="light-today-cta-group gb:light-page:ml-auto gb:light-page:flex gb:light-page:items-center gb:light-page:gap-2 gb:light-page:flex-wrap gb:light-page:max-[720px]:w-full gb:light-page:max-[720px]:ml-0">
      {#each view.actions as action}<button type="button" class={`${actionClass} ${action.active ? 'light-today-cta-active gb:light-page:bg-danger gb:light-page:text-on-danger gb:light-page:border-danger' : action.primary ? 'gb:light-page:bg-accent gb:light-page:text-on-accent' : 'light-today-cta-secondary gb:light-page:border gb:light-page:bg-surface gb:light-page:text-ink gb:light-page:border-line'}`} data-light-page-action={action.action} title={action.title} aria-label={action.active ? 'Stop active sun session' : undefined}>
        {#if action.active}<span aria-hidden="true">{action.label}</span><span data-live-elapsed-for={action.liveId} aria-live="off">{action.elapsed}</span>{:else}{action.label}{#if action.more}<span aria-hidden="true">▼</span>{/if}{/if}
      </button>{/each}
    </div>
  </div>
</section>
