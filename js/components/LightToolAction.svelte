<script lang="ts">
  import type { LightToolActionView } from '../light-tools-presentation.js';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  let { view }: { view: LightToolActionView } = $props();
</script>
<button type="button" class={c(`light-tool-action${view.primary ? ' light-tool-action-primary' : ''}`)} data-light-tools-action="open-tool" data-light-tool-id={view.id} title={view.title}>
  <span class={c('light-tool-action-icon')} aria-hidden="true">{view.icon}</span>
  <span class={c('light-tool-action-copy')}>
    <span class={c(`light-tool-action-name${view.primary ? ' light-tool-primary-name' : ''}`)}>{view.name}</span>
    <span class={c('light-tool-action-desc')}>{view.reason}</span>
  </span>
</button>
