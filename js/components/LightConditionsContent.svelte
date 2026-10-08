<script lang="ts">
  import type { ConditionsView } from '../light-conditions-presentation.js';
  import { conditionsClasses as c } from '../light-conditions-classes.js';
  import LightConditionsTimeline from './LightConditionsTimeline.svelte';
  import LightConditionsSource from './LightConditionsSource.svelte';
  let { view: v }: { view: ConditionsView } = $props();
</script>
{#if v.variant === 'compact'}
  <div class={c('conditions-now-row')} data-light-conditions-presentation>
    {#if v.uvi != null}<!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class={c(`conditions-now-pill ${v.uviReliable ? `conditions-uvi-${v.uviCls}` : 'is-unreliable'}`)} data-conditions-tooltip="WHO UV index — erythema-weighted UV level" tabindex="0">UVI <strong>{v.uvi}</strong></span>{/if}
    {#if v.aqAgg}<!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class={c(`conditions-now-pill conditions-aq-${v.aqAgg.cls}`)} data-conditions-tooltip="Provider-computed European Air Quality Index" tabindex="0">AQ {v.aqAgg.label}</span>{/if}
    {#if v.peakTime}<!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class={c('conditions-now-pill')} data-conditions-tooltip={v.peakTooltip} tabindex="0">peak {v.peakTime}</span>{/if}
    <LightConditionsSource view={v} compact/>
  </div>
  {#if v.compactInterpretation}<div class={c('conditions-now-row-interp')} data-light-conditions-presentation>{v.compactInterpretation}</div>{/if}
{:else}
  <div class={c('conditions-now-grid')} data-light-conditions-presentation>
    <!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class={c(`conditions-now-cell conditions-now-cell-hero ${v.uvi != null && v.uviReliable ? `conditions-uvi-${v.uviCls}` : ''}${v.uviReliable ? '' : ' is-unreliable'}`)} data-conditions-tooltip={v.uviHeroTip} tabindex="0">
      <div class={c('conditions-now-label')}>UV index</div>
      <div class={c('conditions-now-value conditions-now-value-hero')}>{v.uvi != null ? v.uvi : '—'}</div>
      {#if v.uvi != null}<div class={c('conditions-now-interpretation')}>{v.uviReliable ? v.uviLabel : '⚠ UVI data looks inconsistent — see Details'}</div>{/if}
      {#if v.cloudChip || v.peakChip}<div class={c('conditions-now-chips')}>
        {#if v.cloudChip}<span class={c('conditions-now-chip')}>{v.cloudChip}</span>{/if}
        {#if v.peakChip}<span class={c('conditions-now-chip conditions-now-chip-peak')}>{v.peakChip}</span>{/if}
      </div>{/if}
    </div>
    <!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class={c('conditions-now-cell')} data-conditions-tooltip={v.sunPositionTip} tabindex="0">
      <div class={c('conditions-now-label')}>Sun position</div>
      <div class={c('conditions-now-value conditions-now-value-aq')}>{v.sunPosition}</div>
      <div class={c('conditions-now-sub')}>{v.sunPositionSub}</div>
    </div>
    <!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class={c(`conditions-now-cell ${v.ozoneCls}`)} data-conditions-tooltip={v.ozoneTip} tabindex="0">
      <div class={c('conditions-now-label')}>{v.ozoneLabel}</div>
      <div class={c('conditions-now-value conditions-now-value-aq')}>{v.ozoneValue}</div>
      <div class={c('conditions-now-sub')}>{v.ozoneSub}</div>
    </div>
    <!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class={c(`conditions-now-cell ${v.aqAgg ? `conditions-aq-${v.aqAgg.cls}` : ''}`)} data-conditions-tooltip={v.airQualityTip} tabindex="0">
      <div class={c('conditions-now-label')}>Air quality</div>
      <div class={c('conditions-now-value conditions-now-value-aq')}>{v.aqAgg ? v.aqAgg.label : '—'}</div>
      <div class={c('conditions-now-sub')}>{v.airQualitySub}</div>
    </div>
  </div>
  <LightConditionsTimeline view={v}/>
  <div class={c('conditions-now-trust')} data-light-conditions-presentation>
    <LightConditionsSource view={v}/>
    {#if v.sanityWarnings.length}<!-- Keyboard focus exposes the shared tooltip or lets users scroll this read-only data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class={c('conditions-now-warning')} data-conditions-tooltip={v.warningsTooltip} tabindex="0">⚠ {v.sanityWarnings.length} sanity warning{v.sanityWarnings.length === 1 ? '' : 's'}</span>{/if}
  </div>
{/if}
