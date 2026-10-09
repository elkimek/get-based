<script lang="ts">
  import type {LensActionsView} from '../lens-content-presentation.js';
  import {lensContentClasses as c} from '../lens-content-classes.js';

  let {view}: {view: LensActionsView} = $props();
</script>

{#each view.buttons as button, index}
  <button
    data-lens-content-view
    type="button"
    class={c(`dashboard-action-btn${button.primary ? ' dashboard-action-btn-primary' : ' lens-action-secondary'}`)}
    data-lens-page-action={button.action}
    data-lens-page-id={button.id}
  >{button.label}</button>
  {#if index < view.buttons.length - 1}{' '}{/if}
{/each}
{#if view.affiliate}
  <span data-lens-content-view class={c('lens-header-affiliate')}>No raw file? We recommend a <a
      class={c('lens-affiliate-link')}
      href="https://www.dpbolvw.net/q2101xdmjdl0212824AA4024989447"
      target="_blank"
      rel="noopener sponsored"
    >LivingDNA kit</a>.</span>
{/if}
