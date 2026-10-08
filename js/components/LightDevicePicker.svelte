<script lang="ts">
  import type { LightDevicePickerRow } from '../light-device-library-presentation.js';
  import { deviceLibraryClasses as c } from '../light-device-library-classes.js';
  let { rows }: { rows: readonly LightDevicePickerRow[] } = $props();
</script>
<div class="modal" role="dialog" aria-label="Pick a device to log a session" data-light-device-presentation>
  <div class="modal-header"><h3>Which device?</h3><button type="button" class={c('modal-close')} data-device-picker-close aria-label="Close">×</button></div>
  <div class="modal-body">
    <div class={c('light-device-picker-list')}>
      {#each rows as row}<button type="button" class={c('light-device-picker-row')} data-device-id={row.id}><span class={c('light-device-picker-name')}>{row.name}</span><span class={c('light-device-picker-meta')}>{row.specification}</span></button>{/each}
    </div>
    <div class="modal-actions gb:device-library:mt-[14px]"><button type="button" class={c('import-btn import-btn-secondary')} data-device-picker-close>Cancel</button></div>
  </div>
</div>
