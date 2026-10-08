<script lang="ts">
  import type { EnvironmentTodayView } from '../light-environment-screen-presentation.js';
  import { environmentScreenClasses as c } from '../light-environment-screen-classes.js';
  let { view }: { view: EnvironmentTodayView } = $props();
</script>
<button type="button" data-light-environment-today
  class={c(`light-env-today-toggle ${view.active ? 'light-env-today-on' : 'light-env-today-off'}${view.compact ? ' light-env-today-compact' : ''}`)}
  data-light-env-action="set-today-active" data-light-env-kind={view.kind} data-light-env-id={view.id}
  data-light-env-active={view.active ? 'false' : 'true'} title={view.tip}
  aria-label={`${view.label} — click to flip`} aria-pressed={view.active}>
  {#if view.compact}<span aria-hidden="true">{view.icon}</span><span class="gb:sr-only">{view.label}</span>{:else}{view.icon} {view.label}{/if}
</button>
