<script lang="ts">
  import type {TipsSectionView} from '../tips-presentation.js';
  import {tipsClasses as c, tipsStyles} from '../tips-classes.js';
  import TipsBanner from './TipsBanner.svelte';
  import TipsGenetics from './TipsGenetics.svelte';
  import TipsTier from './TipsTier.svelte';
  import TipsEMFProduct from './TipsEMFProduct.svelte';
  import TipsCoupon from './TipsCoupon.svelte';
  import TipsDisclosure from './TipsDisclosure.svelte';
  import TipsDisclaimer from './TipsDisclaimer.svelte';
  let {view, headingMode = 'section', showBanner = true}: {view: TipsSectionView; headingMode?: 'section' | 'chat'; showBanner?: boolean} = $props();
</script>
{#if view.banner && showBanner}<TipsBanner/>{/if}
<div data-tips-view class={c(`rec-section${view.variant === 'emf' ? ' rec-emf-section' : ''}${view.gated ? ' rec-section-gated' : ''}`)} data-rec-section-click-guard>
  <div class={c(headingMode === 'chat' ? 'rec-chat-subheading' : 'rec-section-header')}>{view.header}</div>
  <div class="rec-content">
    {#if view.normalNote}<div class={c('rec-in-range-note')}>Your value is in range. These tips are general information only.</div>{/if}
    {#if view.genetics.length}<TipsGenetics rows={view.genetics}/>{/if}
    {#each view.tiers as tier}<TipsTier view={tier}/>{/each}
    {#each view.products as product}<TipsEMFProduct view={product}/>{/each}
    {#if view.coupon}<TipsCoupon view={view.coupon}/>{/if}
    {#if view.suggestionHref}<div class={c('rec-suggest')}><a class={tipsStyles('rec-suggest-link')} href={view.suggestionHref} target="_blank" rel="noopener noreferrer">Suggest a better study</a></div>{/if}
    <TipsDisclosure view={view.footer}/>
    {#if view.disclaimer}<TipsDisclaimer/>{/if}
  </div>
</div>
