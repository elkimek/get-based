<script lang="ts">
 import {emfStaticStyles} from '../emf-inline-style-map.generated.js';
 import type {EMFAssessmentDetailView} from '../emf-editor-presentation.js';
 import EMFRoomContent from './EMFRoomContent.svelte';
 let {view}:{view:EMFAssessmentDetailView}=$props();
</script><svelte:options preserveWhitespace={true}/><div class="emf-assessment-detail">
    <div class="emf-meta-row">
      {#each view.fields as field}{#if field.field==='date'}<label>Date <input type="date" class="emf-input" data-emf-field="date" value={field.value} data-emf-change-action="field" data-emf-assessment-id={field.assessmentId}></label>{:else if field.field==='label'}<label>Label <input type="text" class="emf-input" data-emf-field="label" value={field.value} placeholder="e.g. Pre-mitigation" data-emf-change-action="field" data-emf-assessment-id={field.assessmentId}></label>{:else}<label>Consultant <input type="text" class="emf-input" data-emf-field="consultant" value={field.value} placeholder="Optional" data-emf-change-action="field" data-emf-assessment-id={field.assessmentId}></label>{/if}{field!==view.fields.at(-1)?'\n      ':''}{/each}
    </div><div class="emf-room-tabs">{#each view.tabs as tab}<button type="button" class="emf-room-tab{tab.active?' active':''}" data-emf-action="select-room" data-emf-assessment-id={tab.assessmentId} data-emf-room-idx={tab.index}>{tab.name} {#if tab.severity!==null}<span class="emf-severity-dot" style="background:var(--{tab.severity.color})"></span>{/if}</button>{/each}<button type="button" class="emf-room-tab emf-room-tab-add" data-emf-action="add-room" data-emf-assessment-id={view.addRoomId} title="Add room">+</button></div><EMFRoomContent view={view.room}/><div class="emf-meta-row" style={emfStaticStyles.sectionSpacing}>
      <label style={emfStaticStyles.rowFill}>Notes <input type="text" class="emf-input" data-emf-field="note" value={view.note.value} placeholder="General assessment notes" data-emf-change-action="field" data-emf-assessment-id={view.note.assessmentId}></label>
    </div>
    <div class="emf-assessment-footer">
      <button type="button" class="import-btn import-btn-primary" data-emf-action="save">Save</button>
      {#if view.interpret}<button type="button" class="import-btn import-btn-secondary" data-emf-action="interpret-assessment" data-emf-assessment-id={view.interpretId}>Interpret</button>{/if}
      <span style={emfStaticStyles.rowFill}></span>
      <button type="button" class="import-btn import-btn-secondary" style={emfStaticStyles.deleteAction} data-emf-action="delete-assessment" data-emf-assessment-id={view.deleteId}>Delete Assessment</button>
    </div>
  </div>