<script lang="ts">
  import type { ChannelDetailView } from '../light-channel-presentation.js';
  import { channelDetailClasses as classes } from '../light-channel-classes.js';
  import LightChannelChart from './LightChannelChart.svelte';
  import LightChannelResearch from './LightChannelResearch.svelte';
  let { view }: { view: ChannelDetailView } = $props();
</script>
<div data-light-channel-presentation class={classes('light-channel-detail', view.channel)} data-channel={view.channel} id={`light-pill-detail-${view.channel}`} role="region" aria-label={`${view.label} detail`}>
  <header class={classes('light-channel-detail-head')}>
    <span class={classes('light-channel-detail-icon')} aria-hidden="true">{view.icon}</span>
    <h4 class={classes('light-channel-detail-title')}>{view.label}</h4>
    <button type="button" class={classes('light-channel-detail-close')} aria-label={`Close ${view.label} detail`} data-light-channel-action="toggle-detail" data-channel={view.channel}>×</button>
  </header>
  <div class={classes('light-channel-hero')}>
    <div class={classes('light-channel-hero-top')}><div class={classes('light-channel-hero-primary')}>{view.primary}</div></div>
    <div class={classes('light-channel-hero-sub')}>{view.sub}</div>
  </div>
  <p class={classes('light-channel-detail-body')}>{view.meaning}</p>
  {#if view.hasSun || view.hasDevice}
    <div class={classes('light-channel-sources')} aria-label="Sources logged this week">
      <span class={classes(`light-channel-source ${view.hasSun ? 'is-logged' : 'is-empty'}`)}><span class={classes('lc-leg-sun')}></span>Sunlight: {view.hasSun ? 'logged' : 'not logged'}</span>
      <span class={classes(`light-channel-source ${view.hasDevice ? 'is-logged' : 'is-empty'}`)}><span class={classes('lc-leg-dev')}></span>Device: {view.hasDevice ? 'logged separately' : 'not logged'}</span>
      {#if view.hasSun && view.hasDevice}<small class={classes('source-note')}>Both reached this pathway, but they are not combined into one score.</small>{/if}
    </div>
  {/if}
  {#if view.chart}<LightChannelChart chart={view.chart} />{/if}
  {#if view.note}<p class={classes('light-channel-banking-note')}><strong class={classes('reading-label')}>How to read it.</strong> {view.note}</p>{/if}
  {#if view.takeaway}
    <section class={classes('light-channel-nextmove')}>
      <div class={classes('light-channel-nextmove-label')}>Simple takeaway</div>
      <p class={classes('light-channel-nextmove-text')}>{#if view.takeaway.peakTime}UV is expected to peak near <strong class={classes('takeaway-peak')}>{view.takeaway.peakTime}</strong> today. {/if}{view.takeaway.text}</p>
      <div class={classes('light-channel-nextmove-actions')}>
        <button type="button" class={classes('import-btn import-btn-primary light-channel-cta-btn')} data-light-channel-action="quick-log-sun">☀ Log a sun session</button>
        {#if view.takeaway.matchingDevice}<button type="button" class={classes('import-btn import-btn-secondary light-channel-cta-btn')} data-light-channel-action="quick-log-device">🔴 Log device session</button>{/if}
      </div>
    </section>
  {/if}
  {#if view.research}<LightChannelResearch research={view.research} />{/if}
</div>
