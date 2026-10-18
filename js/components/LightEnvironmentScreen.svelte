<script lang="ts">
  import LightEnvironmentAI from './LightEnvironmentAI.svelte';
  import { SCREEN_HOURS_BUCKETS, type EnvironmentScreenView } from '../light-environment-screen-presentation.js';
  import { environmentScreenClasses as c } from '../light-environment-screen-classes.js';
  import LightEnvironmentTodayToggle from './LightEnvironmentTodayToggle.svelte';
  let { view }: { view: EnvironmentScreenView } = $props();
  const eveningBuckets = [{ key: 'none', label: 'None' }, { key: 'lt1', label: '< 1 hr' }, { key: 'mid', label: '1–3 hr' }, { key: 'gt3', label: '3+ hr' }];
</script>
<div data-light-environment-screen data-id={view.id}
  class={c(`light-env-screen-card light-env-card-sev-${view.severity}${view.active ? '' : ' light-env-card-skipped'}${view.expanded ? ' expanded' : ''}`)}>
  <div class={c(`light-env-screen-card-head${view.expanded ? ' screen-head-expanded' : ''}`)}>
    <button type="button" class={c('light-env-screen-disclosure')} aria-expanded={view.expanded}
      aria-label={view.disclosureLabel} data-light-env-action="toggle-screen-expanded" data-light-env-id={view.actionId}></button>
    <span class={c(`light-env-sev-dot light-env-sev-${view.severity}`)} title={view.statusTitle}><span class="gb:sr-only">{view.status}</span></span>
    <span class={c('light-env-screen-card-icon')} aria-hidden="true">{view.icon}</span>
    <span class={c('light-env-screen-card-name')}>{view.deviceLabel}</span>
    {#if !view.expanded}<span class={c('light-env-screen-card-summary')}>{view.summary}</span>{/if}
    <span class={c('light-env-room-disclosure-spacer')}></span>
    {#if view.today}<LightEnvironmentTodayToggle view={view.today}/>{:else if view.alternateToday}<span class={c('screen-trusted-today')}><LightEnvironmentTodayToggle view={view.alternateToday}/></span>{/if}
    {#if view.expanded}<button type="button" class={c('light-env-overflow')} data-light-env-action="delete-screen-confirm" data-light-env-id={view.actionId} title="Delete screen" aria-label="Delete screen">⋯</button>{/if}
    <span class={c('light-env-room-disclosure-chevron')} aria-hidden="true">{view.expanded ? '▾' : '▸'}</span>
  </div>
  {#if view.expanded}
    <div class={c('light-env-screen-card-body')}>
      <div class={c('light-env-screen-meta-row')}>
        <label class={c('ctx-label')}>Device
          <select class={c('ctx-select')} data-light-env-action="update-screen-device" data-light-env-id={view.actionId} aria-label="Device type">
            {#each view.devices as option}<option value={option.value} selected={option.selected}>{option.label}</option>{/each}
          </select>
        </label>
        {#if view.rooms.length}<label class={c('ctx-label')}>Used in
          <select class={c('ctx-select light-env-screen-room')} data-light-env-action="update-screen-room" data-light-env-id={view.actionId} aria-label="Used in room">
            {#each view.rooms as option}<option value={option.value} selected={option.selected}>{option.label}</option>{/each}
          </select>
        </label>{/if}
      </div>
      {#each [{ label: 'Hours per day', action: 'set-screen-hours-bucket', buckets: SCREEN_HOURS_BUCKETS, active: view.hours }, { label: 'Time after sunset', action: 'set-screen-evening-bucket', buckets: eveningBuckets, active: view.evening }] as picker}
        <div class={c('light-env-picker')}>
          <span class={c('light-env-picker-label')}>{picker.label}</span>
          <div class={c('light-env-chip-row')}>
            {#each picker.buckets as bucket}<button type="button" class={c(`light-env-chip${picker.active === bucket.key ? ' light-env-chip-active' : ''}`)} aria-pressed={picker.active === bucket.key}
              data-light-env-action={picker.action} data-light-env-id={view.actionId} data-light-env-key={bucket.key}>{bucket.label}</button>{/each}
          </div>
        </div>
      {/each}
      <div class={c('light-env-screen-blocker')}>
        <span class={c('screen-blocker-copy')}>Blue reduction active
          <span class={c('screen-blocker-help')}>Night Shift, f.lux, amber tint, or glasses may reduce short-wavelength light. Brightness, distance, and duration still matter.</span>
        </span>
        <label class={c('screen-blue-switch')}>
          <input type="checkbox" class={c('screen-blue-input')} checked={view.blueReduced} aria-label="Blue reduction active"
            data-light-env-action="update-screen-blue-blocker" data-light-env-id={view.actionId}/>
          <span class={c(`screen-blue-slider${view.blueReduced ? ' screen-blue-on' : ''}`)} aria-hidden="true"></span>
        </label>
      </div>
      {#if view.ai}<LightEnvironmentAI view={view.ai}/>{/if}
    </div>
  {/if}
</div>
