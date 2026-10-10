<script lang="ts">
  import type {CycleEditorPresentationView} from '../cycle-editor-presentation.js';
  import {cycleEditorClasses as c} from '../cycle-editor-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  import CycleEditorProfile from './CycleEditorProfile.svelte';
  import CycleEditorHistory from './CycleEditorHistory.svelte';
  import CycleEditorPeriodForm from './CycleEditorPeriodForm.svelte';
  import CycleImportCoverage from './CycleImportCoverage.svelte';
  let {view}: {view: CycleEditorPresentationView} = $props();
</script>
<div class={c('gb-modal-head cycle-modal-head')} data-cycle-editor-view>
  <div><div class="gb-modal-kicker">Body context</div><div class="gb-modal-title">Menstrual Cycle</div></div>
  <button type="button" class={c('modal-close cycle-icon-btn')} data-cycle-action="close" aria-label="Close cycle editor"><CycleIcon name="x"/></button>
</div>
<div class={c('cycle-modal-body')} data-cycle-editor-view>
  <p class={c('cycle-modal-intro')}>Track cycle status, period history, and symptoms so hormone, iron, and inflammation markers can be interpreted against cycle phase.</p>
  <CycleEditorProfile {view}/>
  {#if view.coverage}<CycleImportCoverage view={view.coverage}/>{/if}
  <section id="mc-period-log-section" class={c('cycle-editor-section cycle-period-editor')} hidden={!view.activeCycle}>
    <div class={c('cycle-editor-section-title')}>Period Log</div><CycleEditorHistory periods={view.periods}/><CycleEditorPeriodForm {view}/>
  </section>
</div>
<div class={c('cycle-modal-footer')} data-cycle-editor-view>
  {#if view.showClear}<button type="button" class={c('dashboard-action-btn cycle-danger-btn')} data-cycle-action="clear">Clear All</button>{/if}
  <button type="button" class="dashboard-action-btn" data-cycle-action="close">Cancel</button>
  <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-cycle-action="save">Save</button>
</div>
