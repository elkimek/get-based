<script lang="ts">
  import type { DevicePresetView } from '../light-device-setup-presentation.js';
  import { deviceSetupClasses as c } from '../light-device-setup-classes.js';
  let { view }: { view: DevicePresetView } = $props();
</script>

<div class={c('modal light-device-add-modal')} role="dialog" aria-label="Add light device" data-light-device-setup>
  <div class="modal-header">
    <h3>Add a light device</h3>
    <button type="button" class={c('modal-close')} data-light-device-setup-close aria-label="Close">×</button>
  </div>
  <div class={c('modal-body')}>
    <p class={c('modal-body-hint')}>Pick from the curated brand presets — Mitochondriak, Chroma, EMR-Tek. Anything else uses the custom-add flow below.</p>
    <div class={c('light-device-preset-groups')}>
      {#each view.groups as group}
        <section class={c('light-device-preset-group')} aria-labelledby={group.id}>
          <h4 class={c('light-device-preset-heading')} id={group.id}>{group.label}</h4>
          <div class={c('light-device-preset-list')}>
            {#each group.rows as row}
              <button type="button" class={c('light-device-preset-row')} data-preset-id={row.id} aria-pressed="false">
                <span class={c('light-device-preset-name')}>{row.name}</span>
                {#if row.specification}<span class={c('light-device-preset-meta')}>{row.specification}</span>{/if}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
    <div class="modal-actions gb:device-setup:mt-[18px]">
      <button type="button" class={c('import-btn import-btn-secondary')} data-light-device-setup-close>Cancel</button>
      <button type="button" class={c('import-btn import-btn-primary')} id="add-device-confirm" disabled>Add device</button>
    </div>
    <hr class="gb:device-setup:my-[20px] gb:device-setup:mx-0 gb:device-setup:border-0 gb:device-setup:[border-top:1px_solid_var(--border)]">
    <p class={c('modal-body-hint')}>{view.hint}</p>
    <button type="button" class={`${c('import-btn import-btn-secondary')} gb:device-setup:w-full gb:device-setup:mt-2`} id="add-device-custom">+ Custom device (paste link or scan photo)</button>
  </div>
</div>
