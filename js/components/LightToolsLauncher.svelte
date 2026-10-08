<script lang="ts">
  import type { LightToolsLauncherView } from '../light-tools-presentation.js';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  import LightToolAction from './LightToolAction.svelte';
  let { view }: { view: LightToolsLauncherView } = $props();
</script>
<div data-light-tool-view class={c('light-tools-section')}>
  <h3 class={c('light-section-title')}>Light tools</h3>
  <p class={c('light-section-hint')}>On-device checks for room light, screens, windows, and solar logs.</p>
  <div class={c('light-tools-status')} aria-label="Measurement status">
    {#each view.status as text}<span class={c('light-tools-status-chip')}>{text}</span>{/each}
  </div>
  <div class={c('light-tools-recommended')}>
    <div class={c('light-tools-recommended-head')}><span>Recommended next</span><span class={c('light-tools-private')}>Camera stays on device</span></div>
    <div class={c('light-tools-action-grid')}>{#each view.recommended as action}<LightToolAction view={action}/>{/each}</div>
  </div>
  <div class={c('light-tools-drawer')}>
    {#each view.groups as group}
      <details class={c('light-tools-group')}>
        <summary class={c('light-tools-group-head')}><span>{group.title}</span><span class={c('light-tools-group-time')}>{group.time}</span></summary>
        <div class={c('light-tools-grid')}>{#each group.actions as action}<LightToolAction view={action}/>{/each}</div>
      </details>
    {/each}
  </div>
</div>
