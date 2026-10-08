<script lang="ts">
  import type { DeviceRecommendationsView } from '../light-device-recommendations-presentation.js';
  import { deviceRecommendationsClasses as c } from '../light-device-recommendations-classes.js';
  let { view }: { view: DeviceRecommendationsView } = $props();
</script>
<div class={c('rec-channel-deficit')} role="region" aria-label={`${view.label} channel device options`} data-light-device-options>
  <div class={c('rec-channel-deficit-head')}>Device options related to the {view.label} channel</div>
  <div class={c('rec-channel-deficit-list')}>
    {#each view.rows as row}<a class={`rec-product-link ${c('rec-light-deficit-link')}`} href={row.href} target="_blank" rel="noopener sponsored" data-umami-event={row.event} aria-label={row.label}><strong class={c('rec-light-deficit-name')}>{row.name}</strong>{#if row.blurb} — {row.blurb}{/if} <span class={c('rec-vendor')}>View on {row.vendor} →</span></a>{/each}
  </div>
  <div class={c('rec-channel-deficit-foot')}>Affiliate links · <button type="button" class={c('rec-channel-deficit-opt-out')} data-rec-action="open-privacy-settings">turn off</button></div>
</div>
