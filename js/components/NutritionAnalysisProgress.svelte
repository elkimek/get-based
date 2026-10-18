<script lang="ts">
  import type { NutritionProgressView } from '../nutrition-editor-model.js';
  import { focus } from '../nutrition-view-classes.js';
  let { view }: { view: NutritionProgressView } = $props();
</script>
<div data-nutrition-view class={`gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:bg-accent/5 gb:nutrition:px-2.5 gb:nutrition:py-[9px] ${view.state === 'success' ? 'gb:nutrition:border-success/50' : view.state === 'error' ? 'gb:nutrition:border-danger/50' : view.state === 'partial' ? 'gb:nutrition:border-warning/50' : 'gb:nutrition:border-accent/30'}`}>
  <div class="nutrition-analysis-progress-head gb:nutrition:mb-[7px] gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-2.5 gb:nutrition:text-[11px] gb:nutrition:text-ink">
    <strong>{view.label}</strong><span class="gb:nutrition:text-[10px] gb:nutrition:text-secondary">{view.detail}</span>
    {#if view.cancel}<button type="button" data-nutrition-action="cancel-analysis" class={`nutrition-analysis-cancel gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:shrink-0 gb:nutrition:cursor-pointer gb:nutrition:rounded-md gb:nutrition:border gb:nutrition:border-danger/50 gb:nutrition:bg-transparent gb:nutrition:px-[7px] gb:nutrition:py-[3px] gb:nutrition:font-body gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:text-danger-ink gb:nutrition:hover:bg-danger/10 ${focus}`}>Cancel analysis</button>{/if}
  </div>
  {#if view.percent !== null}
    <div class="nutrition-analysis-progress-track gb:nutrition:h-[5px] gb:nutrition:overflow-hidden gb:nutrition:rounded-full gb:nutrition:bg-muted/15" role="progressbar" aria-label={view.accessibleLabel} aria-valuemin="0" aria-valuemax="100" aria-valuenow={view.percent}>
      <span style:width={`${view.percent}%`} class={`gb:nutrition:relative gb:nutrition:block gb:nutrition:h-full gb:nutrition:overflow-hidden gb:nutrition:rounded-[inherit] gb:nutrition:transition-[width] gb:nutrition:duration-300 gb:nutrition:motion-reduce:transition-none ${view.state === 'success' ? 'gb:nutrition:bg-success' : view.state === 'error' ? 'gb:nutrition:bg-danger' : view.state === 'partial' ? 'gb:nutrition:bg-warning' : 'gb:nutrition:bg-accent'}`}>
        {#if view.state === 'running'}<span aria-hidden="true" class="gb:nutrition:absolute gb:nutrition:inset-0 gb:nutrition:animate-[nutrition-analysis-shimmer_1.25s_ease-in-out_infinite] gb:nutrition:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)] gb:nutrition:motion-reduce:animate-none"></span>{/if}
      </span>
    </div>
  {/if}
</div>
