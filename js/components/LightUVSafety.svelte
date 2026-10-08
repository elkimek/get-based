<script lang="ts">
  import type { LightUVSafetyView } from '../light-page-presentation.js';
  let { view }: { view: LightUVSafetyView } = $props();
  const tones = { info: 'gb:light-page:border-line gb:light-page:bg-surface', warn: 'gb:light-page:border-[var(--orange)] gb:light-page:bg-[var(--orange-bg)]', over: 'gb:light-page:border-danger gb:light-page:bg-[var(--red-bg)]' };
</script>
<section class="light-today-uv-safety gb:light-page:grid gb:light-page:gap-2" aria-label="UV safety today" data-light-page-presentation>
  <div class="light-today-safety-label gb:light-page:text-xs gb:light-page:font-semibold gb:light-page:text-secondary">UV safety today</div>
  <div class={`light-med-banner light-med-${view.tone} gb:light-page:flex gb:light-page:items-start gb:light-page:gap-3 gb:light-page:p-3 gb:light-page:border gb:light-page:rounded-control ${tones[view.tone]}`}>
    <div class="light-med-icon gb:light-page:text-xl gb:light-page:text-ink" aria-hidden="true">{view.icon}</div>
    <div class="light-med-body gb:light-page:min-w-0">
      <div class="light-med-title gb:light-page:text-sm gb:light-page:text-ink">{view.title}{#if view.percent > 0}{' '}<span class="light-med-pct gb:light-page:text-xs gb:light-page:text-secondary">({view.percent}% of base MED)</span>{/if}</div>
      <div class="light-med-sub gb:light-page:mt-0.5 gb:light-page:text-xs gb:light-page:text-secondary">{view.message}</div>
      {#if view.carry}<div class="light-med-carryover gb:light-page:mt-1.5 gb:light-page:text-xs gb:light-page:text-ink" title={view.carry}>⚠ High modeled UV exposure yesterday — be extra cautious today.</div>{/if}
    </div>
  </div>
</section>
