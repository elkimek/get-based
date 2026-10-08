<script lang="ts">
  import type { EnvironmentPickerView } from '../light-environment-room-presentation.js';
  import { environmentRoomClasses as c } from '../light-environment-room-classes.js';
  let { view }: {view:EnvironmentPickerView}=$props();
</script>
<div class={c('light-env-picker')}>
  <span class={c('light-env-picker-label')}>{view.label}</span>
  <div class={c('light-env-chip-row')}>
    {#each view.choices as choice}<button type="button" class={c(`light-env-chip${choice.selected?' light-env-chip-active':''}`)} aria-pressed={choice.selected} data-light-env-action={view.action} data-light-env-id={view.id} data-light-env-key={choice.key}>{choice.label}</button>{/each}
  </div>
  {#if view.help}<span class={c('light-env-picker-help')}>{view.help}</span>{/if}
  {#if view.reveal?.kind==='source'}
    <details class={c('light-env-picker-more')} open={view.reveal.open}>
      <summary class={c('room-picker-summary')}>More source types…</summary>
      <select class={c('ctx-select room-picker-field')} data-light-env-action="update-room-primary-source" data-light-env-id={view.id} aria-label="Primary light source">
        {#each view.reveal.options as option}<option value={option.value} selected={option.selected}>{option.label}</option>{/each}
      </select>
    </details>
  {:else if view.reveal?.kind==='hours'}
    <details class={c('light-env-picker-more')}>
      <summary class={c('room-picker-summary')}>Set exact hours…</summary>
      <input type="number" min="0" max="24" step="0.5" class={c('ctx-input room-picker-field')} placeholder="hr/day" value={view.reveal.value} data-light-env-action="update-room-hours" data-light-env-id={view.id} aria-label="Hours per day"/>
    </details>
  {/if}
</div>
