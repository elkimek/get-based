<script lang="ts">
  import type { LightDeviceCardView } from '../light-device-library-presentation.js';
  import LightDeviceAffiliate from './LightDeviceAffiliate.svelte';
  import LightDeviceChannelChips from './LightDeviceChannelChips.svelte';
  import { deviceLibraryClasses as c } from '../light-device-library-classes.js';
  let { cards }: { cards: readonly LightDeviceCardView[] } = $props();
</script>
<div class={c('light-devices-section')} data-light-device-presentation>
  <div class={c('light-devices-head')}>
    <h3 class={c('light-section-title')}>Light devices</h3>
    <button type="button" class={c('import-btn import-btn-secondary')} data-light-devices-action="add-device">+ Add device</button>
  </div>
  {#if cards.length === 0}<p class="light-section-hint">Add therapy panels, SAD lamps, or dawn simulators to see the light signals their measured or stated output can support. Device light stays distinct from full-spectrum sunlight.</p>
  {:else}<div class={c('light-devices-grid')}>
    {#each cards as card}
      <div class={c(`light-device-card light-device-card-type-${card.type}`)} data-id={card.id}>
        <div class={c('light-device-head')}>
          <span class={c('light-device-icon')} aria-hidden="true">{card.icon}</span>
          <div class={c('light-device-titleblock')}>
            <span class={c('light-device-name')}>{card.name}</span>
            <span class={c('light-device-typeline')}>{card.specification}</span>
          </div>
          <button type="button" class={c('light-device-delete')} data-light-devices-action="delete-device" data-light-device-id={card.id} title="Remove device" aria-label="Remove device">×</button>
        </div>
        {#if card.chips.length}<div class={c('light-device-feeds')}><span class={c('light-device-feeds-label')}>Signals</span><LightDeviceChannelChips chips={card.chips}/></div>{/if}
        <div class={c('light-device-stats')}>{card.stats}</div>
        <div class={c('light-device-actions')}>
          <button type="button" class={`import-btn import-btn-secondary ${c('light-device-log')}`} data-light-devices-action="log-device-session" data-light-device-id={card.id}>▶ Log session</button>
          {#if card.affiliate}<LightDeviceAffiliate view={card.affiliate}/>{/if}
        </div>
      </div>
    {/each}
  </div>{/if}
</div>
