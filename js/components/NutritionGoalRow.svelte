<script lang="ts">
  import type { NutritionGoalView } from '../nutrition-presentation-model.js';
  import { nutritionToneColor } from '../nutrition-presentation-model.js';
  import { inlineLog, readableCopy as copy, goalHead } from '../nutrition-view-classes.js';
  let { view }: { view: NutritionGoalView } = $props();
</script>
<div data-nutrition-view class="nutrition-goal-row gb:nutrition:grid gb:nutrition:gap-[5px] gb:nutrition:min-w-0"
  class:is-observation={view.observation} class:is-excellent={view.grade?.tone === 'excellent'}
  class:is-good={view.grade?.tone === 'good'} class:is-strained={view.grade?.tone === 'strained'} class:is-poor={view.grade?.tone === 'poor'}>
  <div class="nutrition-goal-row-head {goalHead}"><strong>{view.label}</strong><span class={copy}>{view.comparison}</span></div>
  {#if !view.observation}
    <div class="nutrition-goal-track gb:nutrition:relative gb:nutrition:h-[7px] gb:nutrition:overflow-hidden gb:nutrition:rounded-full gb:nutrition:bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]" role="img" aria-label={view.aria}>
      <span class="gb:nutrition:block gb:nutrition:h-full gb:nutrition:rounded-full" style:width="{Math.min(100, view.percent)}%" style:background={nutritionToneColor(view.grade?.tone)}></span>
      <i class="gb:nutrition:absolute gb:nutrition:right-0 gb:nutrition:top-0 gb:nutrition:h-full gb:nutrition:w-px gb:nutrition:bg-ink" aria-hidden="true"></i>
    </div>
  {/if}
  <div class="nutrition-goal-row-foot gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-2">
    <small class={copy}>{#if view.grade}<span class="nutrition-goal-grade is-{view.grade.tone} gb:nutrition:mr-1 gb:nutrition:font-bold gb:nutrition:text-ink">{view.grade.label}</span> · {/if}{view.note}</small>
    {#if view.fluid}<button type="button" class="nutrition-inline-log {inlineLog}" data-nutrition-action="open-fluid-log">+ Log drink</button>{/if}
  </div>
</div>
