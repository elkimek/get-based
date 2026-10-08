<script lang="ts">
  import type {BiologyNextCheck} from '../biology-planning-presentation.js';
  import {planningClasses as c} from '../biology-planning-classes.js';
  import BiologyPlanningCard from './BiologyPlanningCard.svelte';
  let {rows}: {rows: BiologyNextCheck[]} = $props();
</script>
<BiologyPlanningCard kind="checks">
  <div class={c('biology-next-checks')}>
    {#each rows as row}
      {#snippet content()}
        <strong class={c('biology-next-check-label')}>{row.label}{#if row.scoreId}{' '}<span aria-hidden="true" class={c('biology-next-check-text')}>↗</span>{/if}</strong><span class={c('biology-next-check-text')}>{row.text}</span>
      {/snippet}
      {#if row.scoreId}
        <button type="button" class={c('biology-next-check biology-next-check-button')} data-biology-score-action="jump-to-domain" data-biology-score-id={row.scoreId}>{@render content()}</button>
      {:else}
        <div class={c('biology-next-check')}>{@render content()}</div>
      {/if}
    {/each}
  </div>
</BiologyPlanningCard>
