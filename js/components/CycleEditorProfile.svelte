<script lang="ts">
  import type {CycleEditorPresentationView} from '../cycle-editor-presentation.js';
  import {cycleEditorClasses as c} from '../cycle-editor-classes.js';
  // Automatic values describe derived facts; real editable fields retain their labels.
  let {view}: {view: CycleEditorPresentationView} = $props();
</script>
<section class={c('cycle-editor-section')}>
  <div class={c('cycle-editor-section-title')}>Cycle Profile</div>
  <div class={c('cycle-form-grid cycle-form-grid-single')}>
    <label class={c('cycle-field')}><span>Cycle Status</span>
      <select id="mc-cycle-status" data-cycle-action="toggle-fields">{#each view.statusOptions as option}<option value={option.value} selected={option.selected}>{option.label}</option>{/each}</select>
    </label>
  </div>
  <div id="mc-active-fields" class={c('cycle-active-fields')} hidden={!view.activeCycle}>
    <div class={c('cycle-form-grid')}>
      {#each view.autoFields as field}<div class={c('cycle-field')}><span>{field.title}</span>
        <div class={c(`mc-auto-value cycle-auto-value${field.hint !== null ? ' mc-auto-pending' : ''}`)} id={field.id ?? undefined} data-value={field.value ?? undefined}>{field.label}{#if field.hint !== null}{' '}<span class={c('mc-auto-hint')}>{field.hint}</span>{/if}</div>
      </div>{/each}
    </div>
  </div>
  <div class={c('cycle-form-grid')}>
    <label class={c('cycle-field')}><span>Contraceptive</span>
      <select id="mc-contraceptive">
        <option value={view.contraceptiveNone.value} selected={view.contraceptiveNone.selected}>{view.contraceptiveNone.label}</option>
        {#each view.contraceptiveGroups as group}<optgroup label={group.label}>{#each group.options as option}<option value={option.value} selected={option.selected}>{option.label}</option>{/each}</optgroup>{/each}
        <option value={view.contraceptiveOther.value} selected={view.contraceptiveOther.selected}>{view.contraceptiveOther.label}</option>
      </select>
    </label>
    <label class={c('cycle-field')}><span>Conditions</span><input type="text" id="mc-conditions" value={view.conditions} placeholder="e.g. PCOS, endometriosis, fibroids"></label>
  </div>
</section>
