<script lang="ts">
  import type {EnvironmentSectionView} from '../light-environment-room-presentation.js';
  import {environmentRoomClasses as c} from '../light-environment-room-classes.js';
  import LightEnvironmentSection from './LightEnvironmentSection.svelte';
  let {kind,view}:{kind:'section'|'modal';view:EnvironmentSectionView}=$props();
</script>
{#if kind==='modal'}
  <div data-light-environment-shell class={c('modal light-env-assessment-modal')} role="dialog" aria-modal="true" aria-labelledby="light-env-assessment-title">
    <button type="button" class={c('modal-close environment-modal-close')} data-light-env-action="close-assessment" aria-label="Close">×</button>
    <div class={c('modal-header environment-modal-header')}><h3 id="light-env-assessment-title">Indoor Light Assessment</h3></div>
    <p class={c('light-env-assessment-modal-copy')}>Map daylight, artificial light, screens, and optional room checks. This is a practical screening picture—not a measured biological dose. Save snapshots before and after changes to compare what moved.</p>
    <LightEnvironmentSection {view}/>
  </div>
{:else}<LightEnvironmentSection {view}/>{/if}
