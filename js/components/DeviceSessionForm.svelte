<script lang="ts">
  import SunBodyPickerFrame from './SunBodyPickerFrame.svelte';
  import type {BodyPickerView} from '../sun-body-picker-presentation.js';
  import type { DeviceSessionFormView } from '../light-session-presentation.js';
  let { view, silhouetteView }: { view: DeviceSessionFormView; silhouetteView: BodyPickerView | null } = $props();
  const input = 'gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:min-w-0 gb:light-session:box-border';
  const hint = 'dev-session-hint gb:light-session:block gb:light-session:mt-1 gb:light-session:text-xs gb:light-session:text-secondary gb:light-session:leading-normal';
  const modePickerClass = [
    'dev-mode-picker gb:light-session:grid gb:light-session:grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gb:light-session:gap-2',
    'gb:light-session:mt-1.5',
  ].join(' ');
  const distanceClass = [
    'dev-distance-row gb:light-session:flex gb:light-session:items-stretch gb:light-session:gap-2',
    'gb:light-session:mt-1 gb:light-session:max-[600px]:flex-wrap',
  ].join(' ');
  const unitGroupClass = [
    'dev-unit-toggle gb:light-session:inline-flex gb:light-session:items-stretch gb:light-session:border',
    'gb:light-session:border-line gb:light-session:rounded-control gb:light-session:overflow-hidden gb:light-session:bg-secondary-surface',
  ].join(' ');
  const modeClass = [
    'gb:light-session:min-w-0 gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:cursor-pointer gb:light-session:border',
    'gb:light-session:border-line gb:light-session:rounded-control gb:light-session:bg-secondary-surface gb:light-session:text-secondary',
    'gb:light-session:px-3 gb:light-session:py-[9px] gb:light-session:font-body gb:light-session:text-xs',
    'gb:light-session:font-semibold gb:light-session:text-left gb:light-session:focus-visible:outline-2 gb:light-session:focus-visible:outline-accent',
    'gb:light-session:[&.active]:border-accent gb:light-session:[&.active]:bg-hover gb:light-session:[&.active]:text-ink gb:light-session:[&.active]:shadow-[inset_3px_0_0_var(--accent)]',
  ].join(' ');
  const unitClass = [
    'gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11 gb:light-session:px-3 gb:light-session:text-xs',
    'gb:light-session:font-semibold gb:light-session:bg-transparent gb:light-session:border-0 gb:light-session:text-secondary',
    'gb:light-session:font-body gb:light-session:cursor-pointer gb:light-session:[&.active]:bg-accent gb:light-session:[&.active]:text-on-accent',
    'gb:light-session:focus-visible:outline-2 gb:light-session:focus-visible:outline-accent',
  ].join(' ');
</script>
<div class="modal dev-session-modal gb:light-session:w-full gb:light-session:max-[480px]:p-4" role="dialog" aria-modal="true" aria-label="Log device session" data-light-session-presentation>
  <div class="modal-header"><h3>Log session — {view.name}</h3><button type="button" class="modal-close gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11" data-device-session-close aria-label="Close">×</button></div>
  <div class="modal-body">
    {#if view.modes.length}
      <div class="ctx-label gb:light-session:text-secondary dev-mode-field"><span class="gb:light-session:block">Mode</span><input type="hidden" id="dev-session-mode" value={view.defaultMode || ''}/>
        <div class={modePickerClass} role="radiogroup" aria-label="Device mode">
          {#each view.modes as mode}<button type="button" class={`dev-mode-btn${mode.id === view.defaultMode ? ' active' : ''} ${modeClass}`} data-mode={mode.id} tabindex={mode.id === view.defaultMode ? 0 : -1} role="radio" aria-checked={mode.id === view.defaultMode} title="Which LED groups were firing for this session — picked from the device's vendor-defined modes. Affects channel-dose math.">{mode.label}</button>{/each}
        </div>
      </div>
    {/if}
    <label class="ctx-label gb:light-session:text-secondary">Duration (minutes)<input type="number" id="dev-session-duration" class={`ctx-input ${input}`} min="0.1" max="600" step="0.1" value={view.duration}/><span class={hint}>Record the time actually used. This is not a suggested exposure time; follow the device timer and instructions.</span></label>
    <div class="ctx-label gb:light-session:text-secondary"><label for="dev-session-distance">Distance from device</label>
      <div class={distanceClass}>
        <input type="number" id="dev-session-distance" class={`ctx-input ${input} gb:light-session:flex-1`} min="2" max="200" step="0.5" value={view.distance} data-unit={view.unit} data-base-cm={view.referenceCm}/>
        <div class={unitGroupClass} role="group" aria-label="Distance unit">
          {#each ['cm', 'in'] as unit}<button type="button" class={`dev-unit-btn${unit === view.unit ? ' active' : ''} ${unitClass}`} data-unit={unit} aria-pressed={unit === view.unit}>{unit}</button>{/each}
        </div>
      </div><span class={hint}>{view.distanceHint}</span>
    </div>
    <div class="ctx-label gb:light-session:text-secondary gb:light-session:block"><span>Body area treated</span><SunBodyPickerFrame id="dev-session-silhouette-slot" {silhouetteView} />
      <div class="sun-silhouette-hint-row gb:light-session:flex gb:light-session:items-center gb:light-session:justify-between gb:light-session:gap-2"><div class="sun-silhouette-hint gb:light-session:opacity-100 gb:light-session:text-secondary" id="dev-session-area-hint">Tap regions the panel reaches.</div><button type="button" class="ctx-btn-option gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11 gb:light-session:px-2.5 gb:light-session:py-0.5 gb:light-session:text-xs" id="dev-session-clear">Clear</button></div>
    </div>
    <div class="ctx-label gb:light-session:text-secondary gb:light-session:flex gb:light-session:items-center gb:light-session:justify-between gb:light-session:gap-3"><span class="gb:light-session:flex-1 gb:light-session:min-w-0" id="dev-session-eye-label">{view.eyeLabel}</span><label class="toggle-switch"><input type="checkbox" id="dev-session-eyes" checked={view.eyesChecked} aria-labelledby="dev-session-eye-label"/><span class="toggle-slider"></span></label></div>
    <p class="modal-body-hint gb:light-session:mt-2 gb:light-session:text-secondary">Save now to log a finished session, or Start to run a live timer (matches the sun-session pattern — handy when you want to walk away and come back).</p>
    <div class="modal-actions gb:light-session:mt-[18px] gb:light-session:flex gb:light-session:flex-wrap gb:light-session:gap-2 gb:light-session:[@media(pointer:coarse)]:[&>button]:min-h-11 gb:light-session:max-[480px]:[&>button]:min-h-11"><button type="button" class="import-btn import-btn-secondary gb:light-session:text-ink" data-device-session-close>Cancel</button><button type="button" class="import-btn import-btn-secondary gb:light-session:text-ink" id="dev-session-start">Start timer</button><button type="button" class="import-btn import-btn-primary gb:light-session:bg-accent gb:light-session:text-on-accent" id="dev-session-save">Save session</button></div>
  </div>
</div>
