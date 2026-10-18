<script lang="ts">
  import type { LightPagePresentationProps } from '../light-page-presentation.js';
  import LightChannelPills from './LightChannelPills.svelte';
  import LightDashboardPills from './LightDashboardPills.svelte';
  import LightLocationHint from './LightLocationHint.svelte';
  import { channelSectionClasses as c } from '../light-channel-section-classes.js';
  let { view }: { view: Extract<LightPagePresentationProps, { kind: 'channels' | 'dashboard-channels' }> } = $props();
</script>
<div class={c(view.kind === 'dashboard-channels')} data-light-channel-section data-light-page-presentation>
  <p class={`light-section-hint ${view.kind === 'channels' ? 'gb:light-page:text-secondary' : 'gb:channel-section:mb-0'}`}>{view.lead}</p>
  {#if view.kind === 'channels'}
    <LightChannelPills pills={view.pills}/>
    {#if view.location}<LightLocationHint view={view.location}/>{/if}
  {:else}
    <LightDashboardPills pills={view.pills}/>
    <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-dashboard-open-btn gb:channel-section:[justify-self:start]" data-dashboard-widget-action="navigate" data-dashboard-widget-route="light">Open Light &amp; Sun</button>
  {/if}
</div>
