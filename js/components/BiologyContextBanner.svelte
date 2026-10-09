<script lang="ts">
  import {biologyContextClasses as c} from '../biology-context-classes.js';
  let {labels, page = true, heading = 'From your profile & lab entries'}: {labels: string[]; page?: boolean; heading?: string} = $props();
</script>
{#if labels.length}
  <div data-biology-context-view class={c(`biology-score-context-banner${page ? ' biology-score-context-page' : ''}`)}>
    <strong class={c('biology-context-banner-heading')}>{heading}</strong>
    {#each labels as label}<span class={c('biology-context-banner-label')}>{label}</span>{/each}
  </div>
{/if}
