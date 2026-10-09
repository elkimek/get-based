<script lang="ts">
  import type {BiologyContextProps} from '../biology-context-presentation.js';
  import {biologyContextClasses as c} from '../biology-context-classes.js';
  import BiologyContextBanner from './BiologyContextBanner.svelte';
  import BiologyContextReview from './BiologyContextReview.svelte';
  let props: BiologyContextProps = $props();
</script>
{#if props.kind === 'panel'}
  <BiologyContextReview view={props.view}/>
{:else}
  <details data-biology-context-view class="biology-context-review-details">
    <summary class={c('biology-context-review-summary biology-context-control')}>Profile &amp; collection context</summary>
    <BiologyContextBanner labels={props.view.labels}/>
    <BiologyContextReview view={props.view.review}/>
  </details>
{/if}
