<script lang="ts">
  import type {RecommendationPageView} from '../recommendation-page-presentation.js';
  import {lensShellClasses as c} from '../lens-shell-classes.js';
  import LensPageHeader from './LensPageHeader.svelte';
  import LensWidgetFrame from './LensWidgetFrame.svelte';
  import LensActionButtons from './LensActionButtons.svelte';
  import RecommendationPresentation from './RecommendationPresentation.svelte';
  let {view}: {view: RecommendationPageView} = $props();
</script>
<div id="recommendations-page" data-tips-page-view>
  <LensPageHeader view={view.header}>{#snippet actions()}<LensActionButtons view={view.actions}/>{/snippet}</LensPageHeader>
  {#if view.content.kind === 'disabled'}
    <LensWidgetFrame view={view.content.widget}>{#snippet body()}<LensActionButtons view={{buttons: [{action: 'open-privacy-settings', label: 'Open settings', primary: true}], affiliate: false}}/>{/snippet}</LensWidgetFrame>
  {:else if view.content.kind === 'loading'}
    <div data-lens-shell-view class={c('dashboard-widget-empty')}>Loading tips...</div>
  {:else if view.content.kind === 'empty'}
    <RecommendationPresentation view={{kind: 'empty', empty: {message: 'No data-linked tips yet.'}}}/>
  {:else}
    <div data-lens-shell-view class={c('dashboard-widgets lens-page-widgets')} data-lens-route={view.content.grid.route} data-lens-order-key={view.content.grid.orderKey}>
      {#each view.content.grid.widgets as widget}
        <LensWidgetFrame view={widget.view}>{#snippet body()}<RecommendationPresentation view={{kind: 'list', cards: widget.content}}/>{/snippet}</LensWidgetFrame>
      {/each}
    </div>
  {/if}
</div>
