<script lang="ts">
  import type { projectDeviceChannelChips } from '../light-device-view-formatters.js';
  import { deviceLibraryClasses as c } from '../light-device-library-classes.js';
  let { chips }: { chips: ReturnType<typeof projectDeviceChannelChips> } = $props();
</script>
{#each chips as chip}<span class={c('light-device-feed-chip')} title={chip.title} data-light-device-presentation><span class={c('light-device-feed-icon')} aria-hidden="true">{chip.icon}</span><span class={c('light-device-feed-label')}>{chip.label}</span></span>{/each}
