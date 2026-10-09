<script lang="ts">
  import type {RecommendationPresentationView} from '../recommendation-presentation.js';
  import {recommendationClasses as classes} from '../recommendation-cards-classes.js';
  import RecommendationCard from './RecommendationCard.svelte';
  let {view}: {view: RecommendationPresentationView} = $props();
</script>

{#if view.kind === 'card'}
  <RecommendationCard card={view.card} />
{:else if view.kind === 'list'}
  <div class={classes('rec-next-list')} data-recommendation-cards-view>
    {#each view.cards as card}<RecommendationCard {card} />{/each}
  </div>
{:else if view.kind === 'widget'}
  <div class={classes('rec-next-widget')} data-recommendation-cards-view>
    {#each view.cards as card}<RecommendationCard {card} />{/each}
    <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-dashboard-rec-action="navigate" data-dashboard-rec-route="recommendations">View all tips</button>
  </div>
{:else if view.kind === 'disabled'}
  <button type="button" class="db-correlation-empty" data-dashboard-rec-action="open-privacy-settings">
    <strong>Tips are off</strong>
    <span>Enable Tips in settings to show optional general-information ideas linked to your data.</span>
  </button>
{:else if view.kind === 'loading'}
  <div class="dashboard-widget-empty">Loading tips...</div>
{:else}
  <button type="button" class="db-correlation-empty" data-dashboard-rec-action="navigate" data-dashboard-rec-route="labs">
    <strong>{view.empty.message}</strong>
    <span>Import labs, connect body data, log light exposure, or add DNA to surface optional general-information tips.</span>
  </button>
{/if}
