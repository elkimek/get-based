<script lang="ts">
  import type { NutritionEditorFeedbackView } from '../nutrition-editor-review-model.js';
  import { readableCopy as copy } from '../nutrition-view-classes.js';
  let { view }: { view: NutritionEditorFeedbackView } = $props();
</script>
{#snippet checks(label: string, items: string[])}
  {#if items.length}<div><small class={`${copy} gb:nutrition:text-xs`}>{label}</small><ul class={`gb:nutrition:mt-1 gb:nutrition:mb-0 gb:nutrition:pl-[19px] ${copy} gb:nutrition:text-xs`}>{#each items as item}<li>{item}</li>{/each}</ul></div>{/if}
{/snippet}
{#if view.kind === 'correction'}
  <strong class="gb:nutrition:text-ink">{view.dirty ? 'Estimate needs recalculation.' : 'Wrong identification?'}</strong> {view.dirty ? view.reasons : 'Edit the meal name or food list, then recalculate.'}
{:else if view.kind === 'evidence'}
  <strong class="gb:nutrition:text-[13px]">{view.title}</strong><span class={`${copy} gb:nutrition:text-xs`}>{view.parts}</span>
  {#if view.usage}<span class="nutrition-analysis-usage gb:nutrition:text-xs gb:nutrition:leading-relaxed gb:nutrition:text-ink gb:nutrition:tabular-nums">{view.usage}</span>{/if}
{:else}
  <div class="nutrition-review-checks-head"><strong class="gb:nutrition:text-[13px]">Assumptions and uncertainties</strong></div>
  {@render checks('Model assumed', view.assumptions)}
  {@render checks('Still uncertain', view.warnings)}
{/if}
