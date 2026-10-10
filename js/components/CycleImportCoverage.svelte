<script lang="ts">
  import type {CycleImportCoverageView} from '../cycle-import-presentation.js';
  import {cycleImportClasses as classes} from '../cycle-import-classes.js';
  import CycleImportSourceRow from './CycleImportSourceRow.svelte';
  let {view}: {view: CycleImportCoverageView} = $props();
</script>
<section class={classes('cycle-editor-section cycle-import-summary-section')} data-cycle-import-view>
  <div class={classes('cycle-editor-section-title')}>Import Coverage</div>
  <div class={classes('cycle-import-coverage')}><span>{view.periodCount} observed periods</span><span>{view.observationCount} local daily observations</span>{#if view.showRange}<span>{view.firstDate} - {view.lastDate}</span>{/if}</div>
  {#if view.sources.length}<div class={classes('cycle-source-list')}>{#each view.sources as source}<CycleImportSourceRow view={source}/>{/each}</div>{/if}
</section>
