<svelte:options runes={true}/>
<script lang="ts">
  import {tipsClasses as c} from '../tips-classes.js';
</script>
<div data-tips-view class={c('rec-disclosure-banner')}>
  General information only. These tips are not instructions, individualized medical advice, or a care plan, and are not intended to diagnose, treat, or prevent disease. Do not start, stop, or change medication or supplements based only on these tips. Discuss relevant options with a qualified healthcare professional, especially if pregnant, nursing, or taking medications. Intended for adults. Affiliate links are marked — brands cannot pay for placement.
  <button class={c('rec-disclosure-btn')} data-rec-action="accept-disclosure">Got it</button>
</div>
