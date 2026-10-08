<script lang="ts">
  import type { ConditionsInspectionView } from '../light-conditions-presentation.js';
  import { conditionsClasses as c } from '../light-conditions-classes.js';
  let { view: v }: { view: ConditionsInspectionView } = $props();
</script>
<div class="modal gb:conditions:max-w-[640px]" role="dialog" aria-label="Inspect conditions data" data-light-conditions-presentation>
  <div class="modal-header"><h3>Inspect conditions data</h3><button type="button" class="modal-close" aria-label="Close" data-conditions-inspect-close>×</button></div>
  <div class="modal-body">
    <p class="modal-body-hint">Last response from the conditions provider, exactly as parsed. Use this to verify the math is using the values you expect.</p>
    {#each v.fields as field}
      <div class={c('sun-detail-section')}><div class={c('sun-detail-section-label')}>{field.label}</div><div class={c('sun-detail-section-value')}>{#if field.title}<span title={field.title}>{field.value}</span>{:else}{field.value}{/if}</div></div>
    {/each}
    <div class={c('sun-detail-section')}>
      <div class={c('sun-detail-section-label')}>{v.warnings.length ? 'Sanity warnings' : 'Sanity check'}</div>
      <div class={`${c('sun-detail-section-value')} ${v.warnings.length ? 'gb:conditions:[&.sun-detail-section-value]:[color:var(--conditions-orange,var(--orange))]' : 'gb:conditions:[&.sun-detail-section-value]:[color:var(--conditions-green,var(--green))]'}`}>{#each v.warnings as warning, index}{#if index}<br/>{/if}⚠ {warning}{:else}✓ All values plausible{/each}</div>
    </div>
    <div class={c('sun-detail-section')}><div class={c('sun-detail-section-label')}>Raw payload</div><!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre role="region" aria-label="Raw conditions payload" tabindex="0" class={c('conditions-inspect-payload')}>{v.raw}</pre></div>
    <div class={c('sun-detail-section')}><div class={c('sun-detail-section-label')}>localStorage cache ({v.cacheKeys.length} entr{v.cacheKeys.length === 1 ? 'y' : 'ies'})</div><div class={`${c('sun-detail-section-value')} gb:conditions:[&.sun-detail-section-value]:[font-family:var(--font-mono,monospace)] gb:conditions:[&.sun-detail-section-value]:text-[11px] gb:conditions:[&.sun-detail-section-value]:[color:var(--conditions-muted,var(--text-muted))]`}>{#each v.cacheKeys as key, index}{#if index}<br/>{/if}{key}{:else}— (no cached entries){/each}</div></div>
    <div class="modal-actions gb:conditions:mt-[18px]"><button type="button" class="import-btn import-btn-secondary" data-conditions-inspect-close>Close</button><button type="button" class="import-btn import-btn-primary" id="conditions-inspect-refresh">↻ Force refresh</button></div>
  </div>
</div>
