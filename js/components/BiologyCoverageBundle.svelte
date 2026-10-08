<script lang="ts">
  import type {BiologyPlanningBundle} from '../biology-planning-presentation.js';
  import {planningClasses as c} from '../biology-planning-classes.js';
  let {bundle}: {bundle: BiologyPlanningBundle} = $props();
</script>
<div class={c('biology-coverage-bundle-card')}>
  <strong class={c('biology-coverage-bundle-title')}>{bundle.title}</strong>
  <div class={c('biology-coverage-marker-list')}>
    {#each bundle.markers as marker}
      <span class={c('biology-score-token biology-score-token-muted biology-planning-token')} title={marker.title}>{marker.label}</span>
    {:else}
      <span class={c('biology-score-token biology-score-token-muted biology-planning-token')}>{bundle.emptyText}</span>
    {/each}
  </div>
</div>
