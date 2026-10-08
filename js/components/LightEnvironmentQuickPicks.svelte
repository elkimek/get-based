<script lang="ts">
  import type {EnvironmentQuickPicksView} from '../light-environment-room-presentation.js';
  import {environmentRoomClasses as c} from '../light-environment-room-classes.js';
  let {view}:{view:EnvironmentQuickPicksView}=$props();
</script>
<div class={c(`light-env-quickpicks-row${view.screen?' light-env-screen-quickpicks':''}`)}>
  <span class={c('light-env-quickpicks-label')}>{view.label}:</span>
  {#each view.choices as choice}<button type="button" class={c('light-env-quickpick')} data-light-env-action={view.screen?'add-screen-with-device':'add-room-named'} data-light-env-room-id={view.roomId} data-light-env-device={choice.device} data-light-env-name={choice.name}>{choice.label}</button>{/each}
  <button type="button" class={c('light-env-quickpick light-env-quickpick-other')} data-light-env-action={view.screen?'add-screen':'add-room-custom'} data-light-env-room-id={view.roomId}>Other…</button>
</div>
