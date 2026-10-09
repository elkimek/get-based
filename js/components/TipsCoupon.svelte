<script lang="ts">
  import type {TipsCouponView} from '../tips-presentation.js';
  import {tipsClasses as c} from '../tips-classes.js';
  let {view}: {view: TipsCouponView} = $props();
</script>
<div data-tips-view class={c('rec-coupon')} aria-live="polite" aria-atomic="true">Use code <button type="button" class={c('rec-coupon-code')} data-rec-action="copy-coupon" data-code={view.code} aria-label={`Copy coupon code ${view.code} to clipboard`} title="Click to copy">{view.code}</button> at checkout for {view.discount} off.</div>
