<script lang="ts">
  import type { LightAuditBlockView } from '../light-audit-presentation.js';
  import { lightAuditClasses as c } from '../light-audit-classes.js';
  import LightAuditCard from './LightAuditCard.svelte';
  import LightAuditCompare from './LightAuditCompare.svelte';
  let { view }: { view: LightAuditBlockView } = $props();
</script>

<div data-light-audit-block data-audit-open={view.open} class={c('light-env-block light-audits-shell light-audits-block')}>
  <div class={c('light-env-block-head light-audits-summary')}>
    <button type="button" class={c('audit-block-toggle')} aria-expanded={view.open} data-light-env-action="toggle-audits-block">Light audits</button>
    <div class={c('light-audit-actions')}>
      {#if view.count >= 2}<button type="button" class={c(`import-btn ${view.compareMode ? 'import-btn-secondary' : 'import-btn-primary'}`)} data-light-env-action="toggle-audit-compare">{view.compareMode ? 'Exit compare' : '⇄ Compare'}</button>{/if}
      <button type="button" class={c('import-btn import-btn-secondary')} data-light-env-action="save-audit" title="Snapshot the current rooms + screens + recent measurements as a dated audit. Save another after you make changes (warmer bulbs, blackouts, blue blockers) to unlock the side-by-side compare.">+ Save audit</button>
    </div>
  </div>
  <div class={c(`light-audits-body${view.open ? '' : ' audit-body-hidden'}`)} hidden={!view.open}>
      {#if !view.count}
        <p class={c('light-env-empty')}>Snapshot your rooms + measurements so you can see what a change actually did. Run the tools, save a "Before" audit, make a change (warmer bulbs, blackouts, blue blockers), save an "After". Once you have two, Compare lights up and you'll see the deltas per room.</p>
      {:else if view.count === 1}
        <p class={c('light-audit-hint')}>Save a second audit after making changes to unlock the side-by-side comparison.</p>
      {/if}
      {#if view.comparison}<LightAuditCompare view={view.comparison}/>
      {:else}
        {#each view.cards as card}<LightAuditCard view={card}/>{/each}
        {#if view.historyLabel}<button type="button" class={c('light-audit-show-more')} data-light-env-action="toggle-audit-history">{view.historyLabel}</button>{/if}
      {/if}
  </div>
</div>
