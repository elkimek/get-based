<script lang="ts">
  import type { ChannelChart } from '../light-channel-presentation.js';
  import { channelDetailClasses as classes } from '../light-channel-classes.js';
  let { chart }: { chart: ChannelChart } = $props();
  const inner = Math.max(10, ((280 - 36) / 7) * 0.7);
  const sourceWidth = (inner - 2) / 2;
</script>
<div class={classes('light-channel-weekchart')} title="Last 7 days · solid = sunlight, faded = device">
  <div class={classes('light-channel-weekchart-label')}>7-day rhythm <span class={classes('light-channel-weekchart-legend')}><span class={classes('lc-leg-sun')}></span> sunlight · <span class={classes('lc-leg-dev')}></span> device</span></div>
  <svg viewBox="0 0 312 96" width="100%" height="96" aria-label={`7-day per-day exposure: ${chart.summary}`} role="img">
    <desc>{chart.summary}</desc>
    {#each chart.bars as bar}
      <g>
        {#if bar.empty}<rect x={bar.x} y="77" width={inner} height="3" fill="var(--text-muted)" opacity="0.20" rx="1" />{/if}
        {#if bar.sunHeight > 0}<rect x={bar.x} y={bar.sunY} width={sourceWidth} height={bar.sunHeight} fill="var(--channel-accent, var(--accent))" opacity="0.9" rx="1" />{/if}
        {#if bar.deviceHeight > 0}<rect x={bar.x + sourceWidth + 2} y={bar.deviceY} width={sourceWidth} height={bar.deviceHeight} fill="var(--channel-accent, var(--accent))" opacity="0.38" rx="1" />{/if}
        {#if bar.label}<text x={bar.x + inner / 2} y={bar.labelY} text-anchor="middle" font-size="9" fill="var(--text-secondary)">{bar.label}</text>{/if}
        <text class={bar.today ? '' : classes('chart-day')} x={bar.x + inner / 2} y="93" text-anchor="middle" font-size="10" fill={bar.today ? 'var(--text-primary)' : 'var(--text-muted)'} font-weight={bar.today ? '700' : '400'}>{bar.day}</text>
      </g>
    {/each}
  </svg>
</div>
