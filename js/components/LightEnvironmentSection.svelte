<script lang="ts">
  import type {EnvironmentSectionView} from '../light-environment-room-presentation.js';
  import {environmentRoomClasses as c} from '../light-environment-room-classes.js';
  import LightEnvironmentRoom from './LightEnvironmentRoom.svelte';
  import LightEnvironmentQuickPicks from './LightEnvironmentQuickPicks.svelte';
  import LightEnvironmentScreen from './LightEnvironmentScreen.svelte';
  import LightEnvironmentSummary from './LightEnvironmentSummary.svelte';
  import LightAuditBlock from './LightAuditBlock.svelte';
  let {view}:{view:EnvironmentSectionView}=$props();
</script>
<div data-light-environment-shell class={c(`light-env-section${view.embedded?' light-env-section-embedded':''}`)}>
  {#if !view.embedded}<div class={c('light-env-head')}><h3 class={c('light-section-title')}>Light environment</h3>{' '}<p class="light-section-hint">Map the light that reaches you indoors: daylight access, evening sources, screens, and optional room checks. The rest of Light uses this as context, not as a measured dose.</p></div>{/if}
  <LightEnvironmentSummary view={view.load}/>
  <div class={c('light-env-block')}>
    <div class={c('light-env-block-head')}><strong class={c('environment-block-title')}>Rooms you spend time in</strong><button type="button" class={c('import-btn import-btn-secondary')} data-light-env-action="add-room">+ Room</button></div>
    {#if !view.rooms.length}
      <div class={c('light-env-empty light-env-empty-cta')}><p class={c('environment-empty-copy')}><strong class={c('environment-empty-strong')}>Map your bedroom first.</strong> Record the light used after sunset, screens near bed, and any visible light during sleep. Ordinary lux and phone-camera readings are kept separate from melanopic EDI, so the assessment can guide a better setup without pretending to measure a biological dose.</p><LightEnvironmentQuickPicks view={view.roomQuickPicks}/></div>
    {:else}
      <div class={c('light-env-room-list')}>{#each view.rooms as room}<LightEnvironmentRoom view={room}/>{/each}</div>
      <div class={c('light-env-room-quickpicks')}><LightEnvironmentQuickPicks view={view.roomQuickPicks}/></div>
    {/if}
  </div>
  <div class={c('light-env-block')}>
    <div class={c('light-env-block-head')}><strong class={c('environment-block-title')}>Portable screens</strong><button type="button" class={c('import-btn import-btn-secondary')} data-light-env-action="add-screen">+ Screen</button></div>
    {#if !view.portable.length}
      <div class={c('light-env-empty light-env-empty-cta')}>
        <p class={c('environment-empty-copy')}>{#if view.empty}<strong class={c('environment-empty-strong')}>Track your phone, TV, or any screen that moves between rooms.</strong> Screens you use in a specific room (laptop in the Office, TV in the Living Room) live inside that room's card — add them from there.{:else}No portable screens yet. Devices that stay in one place are listed inside their room card above.{/if}</p>
        <LightEnvironmentQuickPicks view={view.portableQuickPicks}/>
      </div>
    {:else}<div class={c('light-env-screen-cards')}>{#each view.portable as screen}<LightEnvironmentScreen view={screen}/>{/each}</div>{/if}
  </div>
  {#if view.audits}<LightAuditBlock view={view.audits}/>{/if}
</div>
