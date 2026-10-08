<script lang="ts">
  import { deviceTypeOptions, type DeviceCustomView } from '../light-device-setup-presentation.js';
  import { deviceSetupClasses as c } from '../light-device-setup-classes.js';
  let { view }: { view: DeviceCustomView } = $props();
</script>

<div class={c('custom-device-form')}>
  <label class={c('ctx-label')}>Brand
    <input type="text" id="custom-dev-brand" class={c('ctx-input')} placeholder="e.g. Mitochondriak" />
  </label>
  <label class={c('ctx-label')}>Model
    <input type="text" id="custom-dev-model" class={c('ctx-input')} placeholder="e.g. Maxi UVB" />
  </label>
  <label class={c('ctx-label')}>Type
    <select id="custom-dev-type" class={c('ctx-select')}>
      {#each deviceTypeOptions as option}<option value={option.value}>{option.label}</option>{/each}
    </select>
  </label>
  <label class={c('ctx-label')}>Peak wavelengths (nm, comma-separated)
    <input type="text" id="custom-dev-peaks" class={c('ctx-input')} placeholder="e.g. 660, 850" />
  </label>
  <label class={c('ctx-label')}>Irradiance (mW/cm² at vendor's reference distance)
    <input type="number" id="custom-dev-irradiance" class={c('ctx-input')} min="0" step="any" placeholder="e.g. 100 (leave blank for SAD lamps)" />
  </label>
  <label class={c('ctx-label')}>Vendor reference distance — distance the irradiance was measured at
    <div class={c('dev-distance-row')}>
      <input type="number" id="custom-dev-distance" class={c('ctx-input')} min="1" max="200" step="any" placeholder={view.distancePlaceholder} data-unit={view.unit} />
      <div class={c('dev-unit-toggle')} role="tablist" aria-label="Distance unit">
        {#each ['cm','in'] as unit}
          <button type="button" class={c(`dev-unit-btn${view.unit === unit ? ' active' : ''}`)} data-target="custom-dev-distance" data-unit={unit} role="tab" aria-selected={view.unit === unit}>{unit}</button>
        {/each}
      </div>
    </div>
  </label>
  <label class={c('ctx-label')}>Lux at the eye (for SAD / dawn lamps)
    <input type="number" id="custom-dev-lux" class={c('ctx-input')} min="0" step="any" placeholder="e.g. 10000" />
  </label>
  <label class={c('ctx-label')}>Melanopic EDI at the eye (lx, if the source states it)
    <input type="number" id="custom-dev-medi" class={c('ctx-input')} min="0" step="any" placeholder="Leave blank unless explicitly measured or stated" />
  </label>
  <input type="hidden" id="custom-dev-advanced" value="" />
</div>
