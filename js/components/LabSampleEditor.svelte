<script lang="ts">
  import type { LabSampleRecord } from '../lab-sample-proposals.js';
  import { LAB_SAMPLE_CYCLE_PHASES, LAB_SAMPLE_CYCLE_DETAILS } from '../lab-sample-cycle.js';
  let { view }: { view: LabSampleRecord } = $props();
  const phase = $derived(view.cycle?.cyclePhase || ''), detail = $derived(view.cycle?.cyclePhaseDetail || '');
</script>
<svelte:options preserveWhitespace={true}/>
<div class="gb-modal-head"><div><div class="gb-modal-kicker">Lab collection</div><h2 class="gb-modal-title">Edit sample</h2></div><button type="button" class="modal-close" aria-label="Back to marker details" data-lab-sample-back>&times;</button></div>
<form id="lab-sample-form">
  <div class="gb-form-body manual-entry-form">
    <p>These collection details apply to all {view.results.length} results on this sample. Other samples keep their own collection details.</p>
    <div class="me-field"><label for="lab-sample-date">Collection date</label><input id="lab-sample-date" name="date" type="date" value={view.date} required/></div>
    <div class="me-field"><label for="lab-sample-specimen">Specimen</label><input id="lab-sample-specimen" name="specimen" value={view.specimen || ''} maxlength="100" placeholder="Unknown"/></div>
    <div class="me-context-grid">
      <div class="me-field"><label for="lab-sample-time">Collection time</label><input id="lab-sample-time" name="sampleTime" type="time" value={view.sampleTime || ''}/></div>
      <div class="me-field"><label for="lab-sample-fasting">Fasting</label><select id="lab-sample-fasting" name="fasting"><option value="unknown" selected={view.fasting === null}>Unknown</option><option value="yes" selected={view.fasting === true}>Fasting</option><option value="no" selected={view.fasting === false}>Not fasting</option></select></div>
    </div>
    <details open={!!(view.cycle?.cycleDay || phase || detail)}>
      <summary>Cycle context for this sample</summary>
      <p>Enter only reported facts. These fields do not change observed periods. An explicit phase is saved as recorded. Clearing the phase also clears its detail and allows profile-based predictions again.</p>
      <div class="me-field"><label for="lab-sample-cycle-day">Cycle day</label><input id="lab-sample-cycle-day" name="cycleDay" type="text" inputmode="numeric" value={view.cycle?.cycleDay ?? ''} placeholder="Unknown"/></div>
      <p>Use a positive whole number, or leave blank to clear it. Existing values stay unchanged until you edit their field.</p>
      <div class="me-context-grid">
        <div class="me-field"><label for="lab-sample-cycle-phase">Cycle phase</label><select id="lab-sample-cycle-phase" name="cyclePhase">
          <option value="" selected={!phase}>Unknown / clear override</option>
          {#if phase && !Object.hasOwn(LAB_SAMPLE_CYCLE_PHASES, phase)}<option value={phase} selected>Current: {phase}</option>{/if}
          {#each Object.entries(LAB_SAMPLE_CYCLE_PHASES) as [key, label]}<option value={key} selected={phase === key}>{label}</option>{/each}
        </select></div>
        <div class="me-field"><label for="lab-sample-cycle-detail">Cycle phase detail</label><select id="lab-sample-cycle-detail" name="cyclePhaseDetail">
          <option value="" selected={!detail}>Unknown / clear detail</option>
          {#if detail && !Object.hasOwn(LAB_SAMPLE_CYCLE_DETAILS, detail)}<option value={detail} selected>Current: {detail}</option>{/if}
          {#each Object.entries(LAB_SAMPLE_CYCLE_DETAILS) as [key, value]}<option value={key} selected={detail === key}>{value.label}</option>{/each}
        </select></div>
      </div>
      <p>Phase detail must match its phase. Changing the phase clears an incompatible previous detail. Current phase source: {view.cycle?.cyclePhaseSource || 'Unspecified'}.</p>
    </details>
    <p>A date correction moves unshared result notes with this sample. Notes still used by another sample stay on the original date. Conflicting destination notes need review first.</p>
    <details><summary>Results on this sample ({view.results.length})</summary><ul>{#each view.results as result}<li>{result[3]}: {result[1] ?? 'Not recorded'} {result[2]}</li>{/each}</ul></details>
    <p id="lab-sample-status" role="status" aria-live="polite"></p>
    <div class="gb-form-actions"><button type="button" class="import-btn import-btn-secondary" data-lab-sample-back>Cancel</button><button type="submit" class="import-btn import-btn-primary">Save sample</button></div>
  </div>
</form>
