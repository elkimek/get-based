<script lang="ts">
  import type {TipsEMFProductView} from '../tips-presentation.js';
  import {tipsClasses as c, tipsStyles} from '../tips-classes.js';
  let {view}: {view: TipsEMFProductView} = $props();
</script>
<div data-tips-view class={c('rec-product rec-emf-product')}>
  <div class={c('rec-emf-product-head')}>
    <strong class={tipsStyles('rec-emf-product-name')}>{view.name}</strong>
    {#if view.meta.length}<span class={c('rec-emf-product-meta')}>{view.meta.join(' · ')}</span>{/if}
  </div>
  {#if view.blurb !== null}<div class={c('rec-emf-product-blurb')}>{view.blurb}</div>{/if}
  {#if view.link}<a class={`${c('rec-product-link')} ${tipsStyles('rec-emf-product-link')}`} href={view.link.href} target="_blank" rel="noopener sponsored" data-umami-event={view.link.event} aria-label={view.link.label}>View on {view.vendor} →</a>{/if}
</div>
