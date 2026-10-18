<script lang="ts">
  import LightEnvironmentAI from './LightEnvironmentAI.svelte';
  import type {EnvironmentRoomView} from '../light-environment-room-presentation.js';
  import {environmentRoomClasses as c} from '../light-environment-room-classes.js';
  import LightEnvironmentTodayToggle from './LightEnvironmentTodayToggle.svelte';
  import LightEnvironmentPicker from './LightEnvironmentPicker.svelte';
  import LightEnvironmentQuickPicks from './LightEnvironmentQuickPicks.svelte';
  import LightEnvironmentScreen from './LightEnvironmentScreen.svelte';
  let {view}:{view:EnvironmentRoomView}=$props();
</script>
<div data-light-environment-room data-id={view.id} class={c(`light-env-room-disclosure light-env-card-sev-${view.severity}${view.active?'':' light-env-card-skipped'}${view.expanded?' room-expanded expanded':''}`)}>
  <div class={c(`light-env-room-disclosure-head${view.expanded?' room-head-expanded':''}`)}>
    <button type="button" class={c('light-env-room-disclosure-toggle')} aria-expanded={view.expanded} aria-label={view.disclosureLabel} data-light-env-action="toggle-room-expanded" data-light-env-id={view.actionId}></button>
    <span class={c(`light-env-sev-dot light-env-sev-${view.severity}`)} title={view.statusTitle}><span class="gb:sr-only">{view.status}</span></span>
    <span class={c('light-env-room-disclosure-name')}>{view.name}</span>
    {#if !view.expanded}<span class={c('light-env-room-disclosure-signals')}>{#each view.signals as signal}<span class={c('light-env-room-signal')}>{signal}</span>{/each}</span>{/if}
    <span class={c('light-env-room-disclosure-spacer')}></span>
    {#if !view.expanded}<LightEnvironmentTodayToggle view={view.today}/>{:else}<button type="button" class={c('light-env-overflow')} data-light-env-action="delete-room-confirm" data-light-env-id={view.actionId} title="Delete room" aria-label="Delete room">⋯</button>{/if}
    <span class={c('light-env-room-disclosure-chevron')} aria-hidden="true">{view.expanded?'▾':'▸'}</span>
  </div>
  {#if view.body}
    {@const body=view.body}
    <div class={c('light-env-room-disclosure-body')}>
      <div class={c('light-env-room-step light-env-room-step-about')}>
        <div class={c('light-env-room-step-head')}><span class={c('room-step-title')}>Room setup</span>{' '}<span class={c(`light-env-room-status-pill light-env-room-status-${view.severity}`)}>{view.status}</span></div>
        <div class={c('light-env-room-step-body light-env-room-setup-body')}>
          <label class={c('ctx-label light-env-room-name-field')}>Room name<input type="text" class={c('ctx-input light-env-room-name-input')} value={view.nameInput} data-light-env-action="update-room-name" data-light-env-id={view.actionId} aria-label="Room name"/></label>
          <div class={c('light-env-room-today-row')}><span class={c('light-env-room-today-copy')}>Use today{' '}<span class={c('room-today-help')}>Skip only for travel, sick days, or rooms you did not use.</span></span><LightEnvironmentTodayToggle view={view.today}/></div>
          {#each body.pickers as picker}<LightEnvironmentPicker view={picker}/>{/each}
        </div>
      </div>
      <div class={c('light-env-room-step light-env-room-step-measure')}>
        <div class={c('light-env-room-step-head')}><span class={c('room-step-title')}>Measure this room</span>{' '}<span class={c('light-env-room-step-tag')}>Optional</span></div>
        <div class={c('light-env-room-step-body')}>
          <div class={c('light-env-room-tools light-env-measure-toolbar')} aria-label="Room measurement tools">
            {#each body.tools as tool}<button type="button" class={c(`light-env-tool-pill${tool.key==='lux'?' light-env-tool-pill-primary':''}`)} data-light-env-action="open-tool" data-light-env-id={view.actionId} data-light-env-tool={tool.key} title={tool.title}>{tool.label}</button>{/each}
          </div>
          {#if !body.readings.length}<p class={c('light-env-room-empty')}>No measurements yet. Run any tool above and the result lives here.</p>{:else}
            <div class={c('light-env-room-readings')}>
              {#each body.readings as reading}<div class={c('light-env-reading')}><span class={c('light-env-reading-icon')}>{reading.icon}</span><span class={c('light-env-reading-value')}>{reading.value}</span><span class={c('light-env-reading-time')}>{reading.time}</span></div>{#if reading.ai}<LightEnvironmentAI view={reading.ai}/>{/if}{/each}
            </div>
          {/if}
        </div>
      </div>
      <!-- Configured room renderer owns this trusted markup, never saved fields. -->
      {#if body.ai}<LightEnvironmentAI view={body.ai}/>{/if}
      <div class={c('light-env-room-step')}>
        <div class={c('light-env-room-step-head')}>{body.screenHeading}</div>
        <div class={c('light-env-room-step-body')}>
          {#if !body.screens.length}<p class={c('light-env-room-empty')}>{body.screenEmpty}</p>{:else}<div class={c('light-env-room-screens-list')}>{#each body.screens as screen}<LightEnvironmentScreen view={screen}/>{/each}</div>{/if}
          <LightEnvironmentQuickPicks view={body.quickPicks}/>
        </div>
      </div>
    </div>
  {/if}
</div>
