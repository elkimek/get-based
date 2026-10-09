<script lang="ts">
  import {biologyContextClasses as c} from '../biology-context-classes.js';
  let {labels}: {labels: string[]} = $props();
</script>
{#if labels.length}
  <div data-biology-context-view class={c('biology-score-context-banner biology-score-context-page')}>
    <strong class={c('biology-context-banner-heading')}>From your profile &amp; lab entries</strong>
    {#each labels as label}<span class={c('biology-context-banner-label')}>{label}</span>{/each}
  </div>
{/if}
