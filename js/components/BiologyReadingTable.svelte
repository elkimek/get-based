<script lang="ts">
  import type {Snippet} from 'svelte';
  import {readingClasses as c} from '../biology-reading-classes.js';
  let {label, columns, children}: {label: string; columns: readonly string[]; children: Snippet} = $props();
</script>
<!-- Named overflow regions stay in Tab order so keyboard users can scroll
     wide tables. This intentional focus target does not change the region role. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class={c('biology-score-table-scroll')}
  tabindex="0" role="region" aria-label={label}
><table class={c('data-table biology-score-table')}
  ><thead><tr>{#each columns as column}<th scope="col"
    class={c('biology-reading-cell biology-reading-column')}
  >{column}</th>{/each}</tr></thead><tbody>{@render children()}</tbody></table></div>
