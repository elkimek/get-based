<script lang="ts">
  import type {GenomeImportView, LensActionsView} from '../lens-content-presentation.js';
  import {lensContentClasses as c} from '../lens-content-classes.js';
  import LensActionButtons from './LensActionButtons.svelte';

  let {view}: {view: GenomeImportView} = $props();
  const managementActions: LensActionsView = {
    affiliate: false,
    buttons: [
      {action: 'reimport-dna', label: 'Re-import'},
      {action: 'delete-dna', label: 'Delete genome data'},
    ],
  };
</script>

<div data-lens-content-view class={c('genome-import-details')}>
  <div class={c('genetics-overview-grid')}>
    {#each view.cards as card}
      <div class={c('genetics-overview-card')}>
        <span class={c('genetics-overview-label')}>{card.label}</span>
        <strong class={c('lens-genome-value')}>{card.value}</strong>
        <small class={c('lens-genome-sub')}>{card.sub}</small>
      </div>
    {/each}
  </div>
  {#if view.maternal}
    <div class={c('db-genome-import-note')}>
      <strong class={c('lens-maternal-title')}>{view.maternal.title}</strong>
      {#each view.maternal.lines as line}
        <span class={c('lens-maternal-line')}>{line}</span>
      {/each}
    </div>
  {/if}
  <div class={c('dashboard-widget-inline-controls')}>
    <LensActionButtons view={managementActions}/>
  </div>
</div>
