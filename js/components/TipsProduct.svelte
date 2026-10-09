<script lang="ts">
  import type {TipsProductView} from '../tips-presentation.js';
  import {tipsClasses as c} from '../tips-classes.js';
  let {view}: {view: TipsProductView} = $props();
</script>
<div data-tips-view class={c('rec-product')}>
  <span class={c('rec-product-info')}>{#if view.brand !== null}<strong>{view.brand}</strong>{/if}{#if view.name !== null}{#if view.brand !== null}{' · '}{/if}{view.name}{/if}{#if view.meta.length}{' · '}{view.meta.join(' · ')}{/if}</span>
  {#if view.link}<a class={c('rec-product-link')} href={view.link.href} target="_blank" rel="noopener sponsored" data-umami-event={view.link.event} aria-label={view.link.label}>View →</a>{/if}
</div>
