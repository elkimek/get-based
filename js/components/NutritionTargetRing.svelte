<script lang="ts">
  import type { NutritionRingView } from '../nutrition-presentation-model.js';
  import { nutritionToneColor } from '../nutrition-presentation-model.js';
  let { view }: { view: NutritionRingView } = $props();
</script>
<div data-nutrition-view class="nutrition-target-ring gb:nutrition:w-[min(148px,100%)] gb:nutrition:aspect-square gb:nutrition:box-border gb:nutrition:rounded-full gb:nutrition:p-[9px]"
  class:is-secondary={view.accent} class:is-excellent={view.grade?.tone === 'excellent'} class:is-good={view.grade?.tone === 'good'}
  class:is-strained={view.grade?.tone === 'strained'} class:is-poor={view.grade?.tone === 'poor'}
  style:background="conic-gradient({nutritionToneColor(view.grade?.tone || (view.accent ? 'excellent' : undefined))} {view.percent}%, color-mix(in srgb,var(--text-muted) 13%,transparent) 0)"
  role="img" aria-label={view.aria} title={view.grade?.label}>
  <div class="gb:nutrition:h-full gb:nutrition:box-border gb:nutrition:grid gb:nutrition:place-content-center gb:nutrition:justify-items-center gb:nutrition:gap-0.5 gb:nutrition:rounded-full gb:nutrition:bg-surface gb:nutrition:p-3 gb:nutrition:text-center gb:nutrition:text-secondary">
    <small class="nutrition-target-ring-label gb:nutrition:text-[10px] gb:nutrition:font-extrabold gb:nutrition:uppercase gb:nutrition:tracking-wider gb:nutrition:text-ink">{view.label}</small>
    <strong class="gb:nutrition:text-[clamp(21px,2vw,28px)] gb:nutrition:leading-none gb:nutrition:tabular-nums gb:nutrition:text-ink">{view.value}</strong>
    <span class="nutrition-target-ring-unit gb:nutrition:text-[10px]">{view.unit} recorded avg</span>
    <small class="nutrition-target-ring-guide gb:nutrition:mt-1 gb:nutrition:text-[10px] gb:nutrition:font-bold">{view.guide}</small>
  </div>
</div>
