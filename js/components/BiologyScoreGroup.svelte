<script lang="ts">
  import type {BiologyPageGroup} from '../biology-page-presentation.js';
  import {biologyPageClasses as c} from '../biology-page-classes.js';
  import BiologyScoreDetail from './BiologyScoreDetail.svelte';
  let {view}: {view: BiologyPageGroup} = $props();
</script>
{#snippet contents()}
  <p class={c('biology-page-group-copy')}>{view.description}</p>
  {#if view.cards.length}
    <div data-lens-shell-view class="dashboard-widgets lens-page-widgets" data-lens-route="biology-scores" data-lens-order-key={`biology-scores-${view.key}`}>
      {#each view.cards as card}<section data-lens-shell-view class="biology-score-lens-row" data-widget-id={card.id}><BiologyScoreDetail view={card.detail} tools={card.tools}/></section>{/each}
    </div>
  {:else}<p class={c('biology-page-group-copy')}>{view.emptyText}</p>{/if}
{/snippet}
{#if view.key === 'waiting'}
  <details class={c('biology-score-unavailable-group biology-score-group')} data-biology-group={view.key}><summary class={c('biology-page-group-title biology-page-group-summary')}>{view.title} <span class={c('biology-section-count')}>{view.cards.length}</span></summary>{@render contents()}</details>
{:else}
  <section class={c('biology-score-group')} data-biology-group={view.key}><h3 class={c('biology-page-group-title')}>{view.title} <span class={c('biology-section-count')}>{view.cards.length}</span></h3>{@render contents()}</section>
{/if}
