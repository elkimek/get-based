<script lang="ts">
  import SunBodyPickerFrame from './SunBodyPickerFrame.svelte';
  import type {BodyPickerView} from '../sun-body-picker-presentation.js';
  import type { PastSessionFormView } from '../light-session-presentation.js';
  let { view, silhouetteView }: { view: PastSessionFormView; silhouetteView: BodyPickerView | null } = $props();
  const row = 'sun-detailed-row gb:light-session:grid gb:light-session:grid-cols-2 gb:light-session:gap-3 gb:light-session:mb-2 gb:light-session:max-[480px]:grid-cols-1';
  const input = 'gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:w-full gb:light-session:min-w-0 gb:light-session:box-border';
  const hint = 'sun-silhouette-hint gb:light-session:opacity-100 gb:light-session:text-xs gb:light-session:text-secondary gb:light-session:leading-normal';
</script>
<div class="modal sun-detailed-modal gb:light-session:w-full gb:light-session:max-w-[560px] gb:light-session:max-[480px]:p-4" role="dialog" aria-modal="true" aria-label="Past session log" data-light-session-presentation>
  <div class="modal-header"><h3>Log a past session</h3><button type="button" class="modal-close gb:light-session:[@media(pointer:coarse)]:min-h-11 gb:light-session:max-[480px]:min-h-11 gb:light-session:[@media(pointer:coarse)]:min-w-11 gb:light-session:max-[480px]:min-w-11" data-sun-session-action="close-modal" aria-label="Close">×</button></div>
  <div class="modal-body gb:light-session:min-w-0">
    <p class="modal-body-hint gb:light-session:text-secondary">For sessions that already happened. Tap each body region that was uncovered.{view.lastUsed ? ' Body regions, eyewear, and lens tint default to your last session.' : ''}</p>
    <div class="ctx-label gb:light-session:text-secondary">Body regions exposed</div>
    <SunBodyPickerFrame id="sun-silhouette-slot" {silhouetteView} />
    <div class={hint} id="sun-silhouette-hint">Tap any body region to toggle whether it was uncovered.</div>
    <div class={row}>
      <label class="ctx-label gb:light-session:text-secondary">Started at<input type="datetime-local" id="det-started-at" class={`ctx-input ${input}`} value={view.start} max={view.now}/></label>
      <label class="ctx-label gb:light-session:text-secondary">Ended at<input type="datetime-local" id="det-ended-at" class={`ctx-input ${input}`} value={view.now} max={view.now}/></label>
    </div>
    <p class="sun-detailed-glass-hint gb:light-session:mt-1 gb:light-session:mb-0 gb:light-session:ml-6 gb:light-session:text-[11px] gb:light-session:text-secondary gb:light-session:leading-[1.45]">Choose a protected-eye option only when the lenses are labeled UV-blocking. Dark tint alone does not prove UV protection.</p>
    <div class={`${hint} gb:light-session:-mt-1.5`} id="det-duration-hint">Duration: 15 min</div>
    <div class={row}>
      <label class="ctx-label gb:light-session:text-secondary">Sunscreen SPF<input type="number" id="det-spf" class={`ctx-input ${input}`} min="0" max="100" placeholder="none"/><span class={hint}>Modeled conservatively as variable typical-use protection, not the full laboratory SPF or permission to stay out longer.</span></label>
      <div class="ctx-label gb:light-session:text-secondary sun-detailed-glass gb:light-session:mt-6 gb:light-session:flex gb:light-session:items-center gb:light-session:justify-between gb:light-session:gap-3">
        <span id="det-glass-label" class="gb:light-session:flex-1 gb:light-session:min-w-0">Behind glass (window / car / sunroom)</span><label class="toggle-switch"><input type="checkbox" id="det-glass" aria-labelledby="det-glass-label"/><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div class={row}>
      <label class="ctx-label gb:light-session:text-secondary">Eyes<select id="det-eye-mode" class={`ctx-select ${input}`}>{#each view.eyeModes as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
      <label class="ctx-label gb:light-session:text-secondary">Lens tint<select id="det-lens-tint" class={`ctx-select ${input}`}>{#each view.lensTints as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
    </div>
    <div class={row}>
      <label class="ctx-label gb:light-session:text-secondary">Posture<select id="det-posture" class={`ctx-select ${input}`}>{#each view.postures as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
      <label class="ctx-label gb:light-session:text-secondary">Surface<select id="det-surface" class={`ctx-select ${input}`}>{#each view.surfaces as item}<option value={item.key} selected={item.selected}>{item.label}</option>{/each}</select></label>
    </div>
    <label class="ctx-label gb:light-session:text-secondary">Notes<textarea id="det-notes" class={`ctx-input ${input}`} rows="2" placeholder="Optional"></textarea></label>
    <div class="modal-actions gb:light-session:mt-[18px] gb:light-session:flex gb:light-session:flex-wrap gb:light-session:gap-2 gb:light-session:[@media(pointer:coarse)]:[&>button]:min-h-11 gb:light-session:max-[480px]:[&>button]:min-h-11">
      <button type="button" class="import-btn import-btn-secondary gb:light-session:text-ink" data-sun-session-action="close-modal">Cancel</button><button type="button" class="import-btn import-btn-primary gb:light-session:bg-accent gb:light-session:text-on-accent" id="det-save">Save session</button>
    </div>
  </div>
</div>
