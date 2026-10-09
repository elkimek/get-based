<script lang="ts">
  import type {RecommendationCardView} from '../recommendation-presentation.js';
  import {recommendationClasses as classes, recommendationCardClasses} from '../recommendation-cards-classes.js';
  let {card}: {card: RecommendationCardView} = $props();
</script>

<article class={recommendationCardClasses(card.compact, card.saved)} data-rec-id={card.id} data-recommendation-cards-view>
  <div class={classes('rec-next-head')}>
    <span class={classes('rec-next-source')}>{card.source}</span>
    <strong class={classes('rec-next-title')}>{card.label}</strong>
  </div>
  <div class={classes('rec-next-reason')}>{card.reason}</div>
  {#if card.hasMeta}<div class={classes('rec-next-meta')}>{card.meta}</div>{/if}
  {#if !card.compact && card.hasPrimaryAction}
    <div class={classes('rec-next-primary')}><span class={classes('rec-next-primary-label')}>Example to explore</span>{card.primaryAction}</div>
  {/if}
  <div class={classes('rec-next-actions')}>
    <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-dashboard-rec-action="open-detail"
      data-dashboard-rec-slot-key={card.slotKey} data-dashboard-rec-label={card.actionLabel} data-dashboard-rec-marker-status={card.markerStatus}>View options</button>
    {#if card.hasMarker}
      <button type="button" class="dashboard-action-btn" data-dashboard-rec-action="view-marker" data-dashboard-rec-marker-id={card.markerId}>View marker</button>
    {/if}
    <button type="button" class="dashboard-action-btn" data-dashboard-rec-action="discuss" data-dashboard-rec-id={card.actionId}>Discuss</button>
    <button type="button" class="dashboard-action-btn" data-dashboard-rec-action="save" data-dashboard-rec-id={card.actionId} data-dashboard-rec-on={card.saved ? 'false' : 'true'}>{card.saved ? 'Bookmarked' : 'Bookmark'}</button>
    {#if !card.compact}
      <button type="button" class="dashboard-action-btn" data-dashboard-rec-action="dismiss" data-dashboard-rec-id={card.actionId} data-dashboard-rec-on={card.dismissed ? 'false' : 'true'}>{card.dismissed ? 'Show' : 'Hide'}</button>
    {/if}
  </div>
</article>
