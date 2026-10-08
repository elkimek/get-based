<script lang="ts">
  import type { ChannelPillView } from '../light-channel-presentation.js';
  import LightChannelSparkline from './LightChannelSparkline.svelte';
  import { channelPillClasses as c } from '../light-channel-pill-classes.js';
  let { pills }: { pills: readonly ChannelPillView[] } = $props();
</script>
<div class={c('light-pills-row light-pills-interactive')} data-light-channel-pills>
  {#each pills as pill}
    <button type="button" class={c(`light-pill light-pill-tier-${pill.active ? 2 : 0} light-pill-signal-${pill.active ? 'logged' : 'empty'} light-pill-interactive`, pill.key)} data-light-channel-action="toggle-detail" data-channel={pill.key} aria-expanded="false" aria-controls={`light-pill-detail-${pill.key}`} title={pill.title}>
      <span class={c('light-pill-icon')} aria-hidden="true">{pill.icon}</span>
      <span class={c('light-pill-label')}>{pill.label}</span>
      {#if pill.chart}<LightChannelSparkline chart={pill.chart}/>{/if}
      <span class={c('light-pill-daycount')}>{pill.days}</span>
      <span class="sr-only">{pill.description}</span>
    </button>
  {/each}
</div>
<div class="light-channel-detail-slot gb:channel-pill:mt-3" data-channel-detail-slot data-light-channel-pills></div>
