<script lang="ts">
  import SunBodyPickerFrame from './SunBodyPickerFrame.svelte';
  import type {BodyPickerView} from '../sun-body-picker-presentation.js';
  import type { StartSunSessionFormView } from '../light-session-presentation.js';
  let { view, silhouetteView }: { view: StartSunSessionFormView | null; silhouetteView: BodyPickerView | null } = $props();
  const coverage = $derived(view === null);
  const row = 'sun-detailed-row gb:light-session:grid gb:light-session:grid-cols-2 gb:light-session:gap-3 gb:light-session:mb-2 gb:light-session:mt-2.5 gb:light-session:max-[480px]:grid-cols-1';
  const input = 'gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:w-full gb:light-session:min-w-0 gb:light-session:box-border';
  const hint = 'gb:light-session:text-xs gb:light-session:text-secondary gb:light-session:leading-normal gb:light-session:wrap-anywhere';
  const explanation = `sun-detailed-glass-hint gb:light-session:text-[11px] gb:light-session:text-secondary gb:light-session:leading-[1.45] gb:light-session:mt-1 gb:light-session:mb-0 gb:light-session:ml-6`;
</script>
<div class="modal sun-start-modal gb:light-session:w-full gb:light-session:max-w-[560px] gb:light-session:max-[480px]:p-4" role="dialog" aria-modal="true" aria-label={coverage ? 'Change coverage' : 'Start sun session'} data-light-session-presentation>
  <div class="modal-header"><h3>{coverage ? 'Update coverage mid-session' : 'Start a sun session'}</h3><button type="button" class="modal-close gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11" data-sun-start-close={coverage ? undefined : ''} data-sun-coverage-close={coverage ? '' : undefined} aria-label="Close">×</button></div>
  <div class="modal-body gb:light-session:min-w-0">
    {#if !coverage}<div id="sun-start-uvi-banner" class="sun-start-uvi-banner gb:light-session:mb-3" hidden></div>{/if}
    <p class="modal-body-hint gb:light-session:text-secondary">{#if coverage}Tap each body region that's uncovered <strong>now</strong>. The dose accrued under the previous coverage stays — the change applies from this moment forward.{:else}Tap each body region that's uncovered right now. The session begins as soon as you hit Start.{/if}</p>
    <SunBodyPickerFrame id={coverage ? 'sun-coverage-silhouette-slot' : 'sun-start-silhouette-slot'} {silhouetteView} />
    <div class="sun-silhouette-hint-row gb:light-session:flex gb:light-session:items-center gb:light-session:justify-between gb:light-session:gap-2">
      <div class={`sun-silhouette-hint ${hint} gb:light-session:opacity-100 gb:light-session:[&.sun-silhouette-hint-error]:text-danger-ink`} id={coverage ? 'sun-coverage-hint' : 'sun-start-hint'} aria-live="polite">{coverage ? '' : "Tap any body region to toggle whether it's uncovered."}</div>
      {#if !coverage}<button type="button" class="ctx-btn-option gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11 gb:light-session:px-2.5 gb:light-session:py-1 gb:light-session:text-xs gb:light-session:text-ink" id="sun-start-clear">Clear</button>{/if}
    </div>
    {#if view}
      <details class="sun-start-details gb:light-session:mt-2 gb:light-session:pt-2 gb:light-session:border-t gb:light-session:border-line">
        <summary class="gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:py-2 gb:light-session:text-xs gb:light-session:text-secondary gb:light-session:leading-normal gb:light-session:cursor-pointer gb:light-session:list-inside gb:light-session:focus-visible:outline-2 gb:light-session:focus-visible:outline-accent">Posture, surface, eyewear, sunscreen, glass — change defaults</summary>
        <div class={row}>
          <label class="ctx-label gb:light-session:text-secondary">Posture<select id="start-posture" class={`ctx-select ${input}`}>{#each view.postures as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
          <label class="ctx-label gb:light-session:text-secondary">Surface<select id="start-surface" class={`ctx-select ${input}`}>{#each view.surfaces as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
        </div>
        <p class={explanation}>Choose a protected-eye option only when the lenses are labeled UV-blocking. Dark tint alone does not prove UV protection.</p>
        <p class={explanation}>Lying flat catches more sun than standing (~40%). Reflective surfaces (sand, water, snow) bounce UV onto your skin from below.</p>
        <div class={row}>
          <label class="ctx-label gb:light-session:text-secondary">Eyes<select id="start-eye-mode" class={`ctx-select ${input}`}>{#each view.eyeModes as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
          <label class="ctx-label gb:light-session:text-secondary">Lens tint<select id="start-lens-tint" class={`ctx-select ${input}`}>{#each view.lensTints as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
        </div>
        <div class="ctx-label sun-detailed-glass gb:light-session:mt-2 gb:light-session:flex gb:light-session:items-center gb:light-session:justify-between gb:light-session:gap-3 gb:light-session:text-secondary">
          <span id="start-glass-label" class="gb:light-session:flex-1 gb:light-session:min-w-0">Behind glass (window / car / sunroom)</span><label class="toggle-switch gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11"><input type="checkbox" id="start-glass" checked={view.glass} aria-labelledby="start-glass-label"/><span class="toggle-slider gb:light-session:w-[42px] gb:light-session:h-6 gb:light-session:left-0 gb:light-session:right-auto gb:light-session:top-1/2 gb:light-session:bottom-auto gb:light-session:-translate-y-1/2"></span></label>
        </div>
        <p class={explanation}>Ordinary window glass usually blocks most vitamin-D-effective UVB but can pass some UVA, visible light, and near-infrared. Glass types vary, so the model uses a generic wavelength-by-wavelength estimate and never treats glass as guaranteed UV protection. Light tools → Window check compares camera-visible light only; it cannot measure your glass's UV protection.</p>
        <p class={explanation}>If you turn over later, use <strong>Side change</strong> at that moment. It records the timing boundary without multiplying the dose; use <strong>Coverage</strong> too if different skin becomes exposed.</p>
      </details>
    {/if}
    <div class="modal-actions gb:light-session:mt-[18px] gb:light-session:flex gb:light-session:flex-wrap gb:light-session:gap-2 gb:light-session:[@media(pointer:coarse)]:[&>button]:min-h-11 gb:light-session:max-[480px]:[&>button]:min-h-11">
      <button type="button" class="import-btn import-btn-secondary gb:light-session:text-ink" data-sun-start-close={coverage ? undefined : ''} data-sun-coverage-close={coverage ? '' : undefined}>Cancel</button><button type="button" class="import-btn import-btn-primary gb:light-session:bg-accent gb:light-session:text-on-accent" id={coverage ? 'coverage-confirm' : 'start-confirm'}>{coverage ? 'Apply coverage' : '☀ Start session'}</button>
    </div>
  </div>
</div>
