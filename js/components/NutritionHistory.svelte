<script lang="ts">
  import type { NutritionHistoryView } from '../nutrition-presentation-model.js';
  import Goal from './NutritionGoalRow.svelte';
  import Ring from './NutritionTargetRing.svelte';
  import Fuel from './NutritionFuelCard.svelte';
  import Meal from './NutritionMealRow.svelte';
  import { closeButton, rings, goalGrid, button, dashboardButton, dashboardPrimary, historyTab, historyRange, readableCopy as copy, panel, timingPanel, heading, card } from '../nutrition-view-classes.js';
  let { view, current = () => true }: { view: NutritionHistoryView; current?: () => boolean } = $props();
  let root: HTMLDivElement;
  function guard(event: MouseEvent) {
    if (event.target instanceof Node && root?.contains(event.target) && !current()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
</script>
<svelte:document onclickcapture={guard}/>
<div bind:this={root} data-nutrition-history-view data-nutrition-view class="gb:nutrition:min-w-0 gb:nutrition:text-ink gb:nutrition:[overflow-wrap:anywhere]">
  <button type="button" class={closeButton} aria-label="Close Nutrition history" data-nutrition-action="close">×</button>
  {#if view.returnToEditor}<button type="button" class="nutrition-route-back {button}" data-nutrition-action="return-editor">← Meal entry</button>{/if}
  <div class="nutrition-modal-head nutrition-history-head gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-start gb:nutrition:justify-between gb:nutrition:gap-4 gb:nutrition:pr-11">
    <div><h3 id="nutrition-history-title" class="gb:nutrition:mt-0 gb:nutrition:text-xl gb:nutrition:leading-normal">Meals &amp; Nutrition</h3></div>
    <div class="nutrition-history-head-actions gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:gap-2"><button type="button" class={dashboardButton} data-nutrition-action="open-targets" data-nutrition-return="history">Setup</button><button type="button" class={dashboardPrimary} data-nutrition-action="open" data-nutrition-return="history">{view.returnToEditor ? 'New meal' : 'Log meal'}</button></div>
  </div>
  <div class="nutrition-history-tabs gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-1 gb:nutrition:mt-[18px] gb:nutrition:rounded-[10px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-[color-mix(in_srgb,var(--text-muted)_5%,var(--bg-card))] gb:nutrition:p-1" role="tablist" aria-label="Meals & Nutrition history view">
    {#each ['meals', 'trends'] as tab}<button type="button" role="tab" aria-selected={view.tab === tab} class={historyTab} class:active={view.tab === tab} data-nutrition-action="set-history-view" data-nutrition-view={tab}>{tab === 'meals' ? 'Meals' : 'Trends'}</button>{/each}
  </div>
  <div class="ctx-btn-group nutrition-history-range gb:nutrition:mt-[18px] gb:nutrition:max-[720px]:w-full gb:nutrition:box-border" role="group" aria-label="Nutrition history range">
    {#each view.ranges as range}<button type="button" class={historyRange} class:active={range.selected} aria-pressed={range.selected} data-nutrition-action="set-history-range" data-nutrition-range={range.key}>{range.label}</button>{/each}
  </div>
  {#if view.error}<div class="nutrition-history-error gb:nutrition:mt-3 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-danger gb:nutrition:p-3 gb:nutrition:text-sm gb:nutrition:text-danger-ink" role="status">{view.error}</div>{/if}
  {#if !view.hasMeals}
    <div class="nutrition-history-empty {panel} gb:nutrition:mt-4"><span aria-hidden="true" class="gb:nutrition:text-2xl">◎</span><div><strong class="gb:nutrition:text-sm">No intake logged in {view.rangeDescription || 'this timeframe'}</strong><p class={copy}>The selected range stays empty rather than silently showing older data.</p></div>
      {#if view.all}<button type="button" class={button} data-nutrition-action="open" data-nutrition-return="history">Log a meal</button>{:else}<button type="button" class={button} data-nutrition-action="set-history-range" data-nutrition-range="all">Show all history</button>{/if}
    </div>
  {:else if view.tab === 'meals'}
    <div class="nutrition-history-meals-head gb:nutrition:flex gb:nutrition:items-end gb:nutrition:justify-between gb:nutrition:gap-[18px] gb:nutrition:mt-4 gb:nutrition:rounded-[10px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_2.5%,var(--bg-card))] gb:nutrition:px-[13px] gb:nutrition:py-3 gb:nutrition:max-[720px]:flex-col gb:nutrition:max-[720px]:items-start gb:nutrition:max-[720px]:gap-[5px]"><div class="gb:nutrition:grid gb:nutrition:gap-1"><strong class="gb:nutrition:text-sm">{view.total} entries</strong><span class={copy}>{view.days} days with entries · {view.rangeDescription}</span></div><small class={copy}>{view.remaining ? `Showing newest ${view.shown} of ${view.total}.` : `Showing all ${view.total}.`} Select a meal to review, edit, log it again, or delete it.</small></div>
    <div class="nutrition-meal-timeline gb:nutrition:grid gb:nutrition:gap-5 gb:nutrition:mt-4">{#each view.groups as group}<section class="nutrition-timeline-day gb:nutrition:grid gb:nutrition:gap-1"><div class="nutrition-timeline-day-head gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:justify-between gb:nutrition:gap-2 gb:nutrition:border-b gb:nutrition:border-line gb:nutrition:pb-2"><strong class="gb:nutrition:text-xs">{group.label}</strong><span class={copy}>{group.count} {group.count === 1 ? 'entry' : 'entries'}</span></div>{#each group.meals as meal}<Meal view={meal}/>{/each}</section>{/each}</div>
    {#if view.remaining}<button type="button" class="nutrition-history-more {button} gb:nutrition:mt-4 gb:nutrition:w-full" data-nutrition-action="show-history-more">Show more meals <span class={copy}>· {view.remaining.toLocaleString()} remaining</span></button>{/if}
  {:else}
    <div class="nutrition-history-layout gb:nutrition:grid gb:nutrition:grid-cols-1 gb:nutrition:gap-3.5 gb:nutrition:mt-4 gb:nutrition:min-[800px]:grid-cols-2">
      <section class="nutrition-history-overview {panel}">
        <div class="nutrition-history-stat-grid gb:nutrition:grid gb:nutrition:grid-cols-3 gb:nutrition:gap-2 gb:nutrition:max-[380px]:grid-cols-1">{#each view.stats as stat}<div class={card}><strong class="gb:nutrition:text-xl gb:nutrition:tabular-nums">{stat.value}</strong><span class="gb:nutrition:text-[11px] gb:nutrition:font-bold">{stat.label}</span><small class={copy}>{stat.detail}</small></div>{/each}</div>
        <div class="nutrition-history-coverage-chart gb:nutrition:grid gb:nutrition:grid-cols-[repeat(auto-fit,minmax(38px,1fr))] gb:nutrition:gap-2 gb:nutrition:pb-2" role="img" aria-label="Logging coverage over the selected timeframe">{#each view.coverage as bucket}<div class="nutrition-history-coverage-bar gb:nutrition:grid gb:nutrition:grid-rows-[96px_auto_auto] gb:nutrition:gap-1 gb:nutrition:text-center" title={bucket.title}><i class="gb:nutrition:flex gb:nutrition:items-end gb:nutrition:overflow-hidden gb:nutrition:rounded-md gb:nutrition:bg-hover"><span class="gb:nutrition:w-full gb:nutrition:rounded-md gb:nutrition:bg-accent" style:height="{bucket.height}%"></span></i><span class="gb:nutrition:text-[11px] gb:nutrition:font-bold">{bucket.values}</span><small class="{copy} gb:nutrition:truncate">{bucket.label}</small></div>{/each}</div>
        <p class="nutrition-history-caveat {copy} gb:nutrition:m-0">A day with entries may still be partial. Recorded averages include only entered meals; missing meals and days remain unknown.</p>
      </section>
      <section class="nutrition-history-averages {panel}"><div class="nutrition-target-rings {rings}"><Ring view={view.ring}/></div><div class="nutrition-goal-list-head gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:justify-between gb:nutrition:gap-2"><strong class="gb:nutrition:text-xs">Recorded daily averages</strong><span class={copy}>{view.rangeLabel} · {view.goals.length} nutrient rows</span></div>
        {#if view.goals.length}<div class="nutrition-goal-grid {goalGrid(view.goals.length > 4)}" class:is-expanded={view.goals.length > 4}>{#each view.goals as goal}<Goal view={goal}/>{/each}</div>{:else}<div class="nutrition-comparison-empty {copy}">Choose nutrients in Setup.</div>{/if}
      </section>
      <section class="nutrition-history-timing {timingPanel}"><div class={heading}>Logged meal timing</div><div class="gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-2 gb:nutrition:max-[380px]:grid-cols-1">{#each view.timing as timing}<div class={card}><span class={copy}>{timing.label}</span><strong class="gb:nutrition:text-sm gb:nutrition:tabular-nums">{timing.value}</strong></div>{/each}</div><small class={copy}>Eating windows require at least two logged meals in a day. Fasting windows use the last and first logged meals on consecutive days. Missing meals remain unknown.</small></section>
      <section class="nutrition-history-fuel {timingPanel}"><div class={heading}>Carbohydrate and fat mix</div><Fuel view={view.fuel}/></section>
    </div>
    <div class="nutrition-history-ai {panel} gb:nutrition:mt-3"><div class="gb:nutrition:grid gb:nutrition:gap-1"><strong class="gb:nutrition:text-xs">Ask AI about {view.rangeLabel || 'this range'}</strong><span class={copy}>{view.contextEnabled ? 'Sends one compact aggregate for this range. It replaces the automatic nutrition summary for this message.' : 'Turn on Meals & Nutrition in Manage Context to share an aggregate with AI.'}</span></div><button type="button" class={button} data-nutrition-action="ask-history" data-nutrition-range={view.rangeKey} disabled={!view.contextEnabled}>Ask AI</button></div>
  {/if}
</div>
