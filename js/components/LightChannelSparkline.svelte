<script lang="ts">
  import type { ChannelSparkline } from '../light-channel-presentation.js';
  import { channelPillClasses as c } from '../light-channel-pill-classes.js';
  let { chart }: { chart: ChannelSparkline } = $props();
</script>
<svg class={c('light-pill-sparkline')} viewBox="0 0 47 14" width="47" height="14" aria-hidden="true" data-light-channel-pills>
  {#each chart.bars as bar}
    {#if bar.empty}<rect x={bar.x} y="12.5" width="5" height="1.5" fill="var(--text-muted)" opacity="0.22" rx="0.6"/>
    {:else}
      {#if bar.sunHeight > 0}<rect x={bar.x} y={14 - bar.sunHeight} width="2" height={bar.sunHeight} fill="var(--channel-accent, var(--accent))" opacity="0.9" rx="0.6"/>{/if}
      {#if bar.deviceHeight > 0}<rect x={bar.x + 3} y={14 - bar.deviceHeight} width="2" height={bar.deviceHeight} fill="var(--channel-accent, var(--accent))" opacity="0.38" rx="0.6"/>{/if}
    {/if}
  {/each}
</svg>
