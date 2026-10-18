<script lang="ts">
  import type { NutritionDashboardView } from '../nutrition-dashboard-model.js';
  import { dashboardButton as button, dashboardPrimary as primary, dashboardLoading, starterAction, copy, panel, goalPanel, rings, goalGrid, goalHead } from '../nutrition-view-classes.js';
  import Ring from './NutritionTargetRing.svelte';
  import Goal from './NutritionGoalRow.svelte';
  import Fuel from './NutritionFuelCard.svelte';
  let { view }: { view: NutritionDashboardView } = $props();
</script>
{#if view.kind === 'fuel'}
  <div data-nutrition-view data-nutrition-dashboard-view="fuel" class="nutrition-fuel-widget gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-4 gb:nutrition:text-ink"><Fuel view={view.fuel}/></div>
{:else}
  <div data-nutrition-view data-nutrition-dashboard-view="intake"
    class="nutrition-widget gb:nutrition:@container/nutrition-widget gb:nutrition:grid gb:nutrition:min-w-0 gb:nutrition:gap-4 gb:nutrition:text-ink gb:nutrition:[overflow-wrap:anywhere]">
    <span data-nutrition-loading-status role="status" aria-live="polite" aria-atomic="true" class="gb:nutrition:sr-only"></span>
    <div class="nutrition-widget-actions-row gb:nutrition:flex gb:nutrition:justify-end">
      <div class="nutrition-widget-actions gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:gap-2 gb:nutrition:@max-[500px]/nutrition-widget:w-full gb:nutrition:@max-[500px]/nutrition-widget:[&_button]:flex-1">
        {#if view.hasMeals}<button type="button" class={`${button} ${dashboardLoading}`} data-nutrition-action="open-history">History</button>{/if}
        <button type="button" class={`${button} ${dashboardLoading}`} data-nutrition-action="open-targets">Customize</button>
        <button type="button" class={`${primary} ${dashboardLoading}`} data-nutrition-action="open">Log meal</button>
      </div>
    </div>
    {#if view.hasMeals}
      {#if !view.configured}
        <div class="nutrition-widget-starter-note gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-3 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-hover gb:nutrition:px-3 gb:nutrition:py-2">
          <span class={copy}>Using starter guides</span><button type="button" class={`${starterAction} ${dashboardLoading}`} data-nutrition-action="open-targets">Review and personalize</button>
        </div>
      {/if}
      <div class="nutrition-recorded-notice gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-baseline gb:nutrition:justify-between gb:nutrition:gap-3 gb:nutrition:rounded-lg gb:nutrition:border-l-[3px] gb:nutrition:border-accent gb:nutrition:bg-hover gb:nutrition:px-3 gb:nutrition:py-2">
        <strong class="gb:nutrition:text-[11px]">Recorded intake, not verified full days</strong><span class="gb:nutrition:text-[10px] gb:nutrition:leading-[1.45] gb:nutrition:text-secondary gb:nutrition:text-right">Averages include what you entered; missing meals remain unknown.</span>
      </div>
      <div class="nutrition-dashboard-grid gb:nutrition:grid gb:nutrition:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] gb:nutrition:gap-3.5 gb:nutrition:@max-[640px]/nutrition-widget:grid-cols-1">
        <section class="nutrition-dashboard-hero {panel}" aria-label="Recorded energy and coverage">
          <div class="nutrition-target-rings {rings}"><Ring view={view.ring}/></div>
          <div class="nutrition-day-coverage gb:nutrition:grid gb:nutrition:gap-[7px]">
            <div class={goalHead}><strong>Days with entries</strong><span class={copy}>{view.loggedDays} of 7 days</span></div>
            <div class="nutrition-day-strip gb:nutrition:grid gb:nutrition:grid-cols-7 gb:nutrition:gap-1.5" role="img" aria-label="Entries logged on {view.loggedDays} of the last 7 days">
              {#each view.days as day}
                <div class="nutrition-day gb:nutrition:grid gb:nutrition:justify-items-center gb:nutrition:gap-1" class:is-logged={day.logged} title={day.title}>
                  <span class={copy}>{day.label}</span><i class="gb:nutrition:h-[17px] gb:nutrition:w-full gb:nutrition:rounded-[5px] {day.logged ? 'gb:nutrition:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_68%,white),var(--accent))] gb:nutrition:shadow-[0_3px_10px_color-mix(in_srgb,var(--accent)_18%,transparent)]' : 'gb:nutrition:bg-[color-mix(in_srgb,var(--text-muted)_11%,transparent)]'}"></i>
                </div>
              {/each}
            </div>
            <small class={copy}>A day can still be partial when only some meals were entered.</small>
          </div>
        </section>
        <section class="nutrition-goal-list {goalPanel}" aria-label="Recorded nutrient averages">
          <div class="nutrition-goal-list-head {goalHead}"><strong>Recorded daily averages</strong><span class={copy}>Last 7 days · {view.goals.length} nutrient rows</span></div>
          {#if view.goals.length}
            <div class="nutrition-goal-grid {goalGrid(view.goals.length > 4)}" class:is-expanded={view.goals.length > 4}>{#each view.goals as goal}<Goal view={goal}/>{/each}</div>
          {:else}<div class="nutrition-comparison-empty {copy}">Choose nutrients in Customize.</div>{/if}
        </section>
      </div>
    {:else}
      <div class="nutrition-widget-empty gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:gap-3 gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-dashed gb:nutrition:border-line gb:nutrition:bg-hover gb:nutrition:p-[18px]">
        <span aria-hidden="true" class="gb:nutrition:text-[28px] gb:nutrition:text-accent">◎</span><div><strong class="gb:nutrition:text-[13px]">No intake logged yet</strong><p class="{copy} gb:nutrition:mb-0 gb:nutrition:mt-1">Log a meal to start seven-day recorded averages.</p></div>
      </div>
    {/if}
  </div>
{/if}
