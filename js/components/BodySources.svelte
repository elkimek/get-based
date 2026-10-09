<script lang="ts">
  import type {BodySourcesView} from '../lens-content-presentation.js';
  import {lensContentClasses as c} from '../lens-content-classes.js';

  let {view}: {view: BodySourcesView} = $props();
</script>

{#if view.empty}
  <button
    data-lens-content-view
    type="button"
    class={c('db-correlation-empty')}
    data-lens-page-action="open-wearables-settings"
  >
    <strong>Connect body data</strong>
    <span class={c('lens-source-empty-copy')}>Oura, Withings, Fitbit, Polar, Apple Health, or manual logging can feed HRV, sleep, recovery, blood pressure, and body composition.</span>
  </button>
{:else}
  <div data-lens-content-view class={c('dashboard-widget-picker-grid')}>
    {#each view.sources as source}
      <button
        type="button"
        class={c('dashboard-widget-picker-card')}
        data-lens-page-action="open-wearables-settings"
      >
        <span class={c('dashboard-widget-picker-title')}>{source.label}</span>
        <span class={c('dashboard-widget-picker-sub')}>{source.synced} · {source.coverage}</span>
        <span class={c('dashboard-widget-picker-action')}>Manage source</span>
      </button>
    {/each}
  </div>
{/if}
