<script lang="ts">
  import type { SessionOption } from '../light-session-presentation.js';
  let { name, modes }: { name: string; modes: SessionOption[] } = $props();
</script>
<div class="modal gb:light-detail:w-full gb:light-detail:max-[480px]:p-4" role="dialog" aria-modal="true" aria-label="Edit session mode" data-light-detail-presentation>
  <div class="modal-header"><h3>Edit mode — {name}</h3><button type="button" class="modal-close gb:light-detail:min-h-[45px] gb:light-detail:min-w-[45px]" data-device-mode-close aria-label="Close">×</button></div>
  <div class="modal-body">
    <p class="modal-body-hint gb:light-detail:text-secondary">Pick the LED-group mode that actually fired during this session. Doses will be recomputed on save.</p>
    <label class="ctx-label gb:light-detail:text-secondary">Mode
      <select id="dev-edit-mode" class="ctx-select gb:light-detail:min-h-[45px]">{#each modes as mode}<option value={mode.key} selected={mode.selected}>{mode.label}</option>{/each}</select>
    </label>
    <div class="modal-actions gb:light-detail:mt-[18px] gb:light-detail:flex gb:light-detail:flex-wrap gb:light-detail:gap-2">
      <button type="button" class="import-btn import-btn-secondary gb:light-detail:min-h-[45px] gb:light-detail:text-ink" data-device-mode-close>Cancel</button>
      <button type="button" class="import-btn import-btn-primary gb:light-detail:min-h-[45px] gb:light-detail:bg-accent gb:light-detail:text-on-accent" id="dev-edit-mode-save">Save</button>
    </div>
  </div>
</div>
