<script lang="ts">
  import type {CycleEditorPresentationView} from '../cycle-editor-presentation.js';
  import {cycleEditorClasses as c} from '../cycle-editor-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  let {view}: {view: CycleEditorPresentationView} = $props();
</script>
<div class={c('cycle-period-add')}>
  <div class={c('cycle-form-grid cycle-form-grid-three')}>
    <label class={c('cycle-field')}><span>Start Date</span><input type="date" id="mc-period-start" value={view.today}></label>
    <label class={c('cycle-field')}><span>End Date</span><input type="date" id="mc-period-end" value={view.defaultEnd}></label>
    <label class={c('cycle-field')}><span>Flow</span><select id="mc-period-flow"><option value="light">Light</option><option value="moderate" selected>Moderate</option><option value="heavy">Heavy</option></select></label>
  </div>
  <label class={c('cycle-field cycle-field-wide')}><span>Symptoms</span>
    <div class={c('ctx-tags cycle-symptom-grid')} id="mc-period-symptoms">{#each view.symptoms as symptom}<button type="button" class={c('ctx-tag cycle-symptom-chip')} data-value={symptom} aria-pressed="false" data-cycle-action="toggle-symptom">{symptom}</button>{/each}</div>
  </label>
  <div class={c('cycle-add-row')}>
    <label class={c('cycle-field')}><span>Notes (optional)</span><input type="text" id="mc-period-notes" placeholder="e.g. spotting, unusual pain"></label>
    <button type="button" class={c('dashboard-action-btn dashboard-action-btn-primary cycle-add-btn')} data-cycle-action="add-period"><CycleIcon name="plus"/><span>Add period</span></button>
  </div>
</div>
