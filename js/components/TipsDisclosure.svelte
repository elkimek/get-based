<script lang="ts">
  import type {TipsDisclosureView} from '../tips-presentation.js';
  import {tipsClasses as c} from '../tips-classes.js';
  let {view}: {view: TipsDisclosureView} = $props();
</script>
<div data-tips-view class={c('rec-disclosure')}>Affiliate links are marked. Brands cannot pay for placement. <span class={c('rec-region-tag')}>Showing for {view.region} · <a href="#modal-overlay" class={c('rec-region-edit')} data-rec-action="edit-region" aria-label="Change country for product tips">change</a></span></div>
