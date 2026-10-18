<script lang="ts">
 import {emfStaticStyles} from '../emf-inline-style-map.generated.js';
 import type {EMFEditorView} from '../emf-editor-presentation.js';
 import EMFAssessmentDetail from './EMFAssessmentDetail.svelte';
 import EMFComparison from './EMFComparison.svelte';
 let {view}:{view:EMFEditorView}=$props();
</script><svelte:options preserveWhitespace={true}/>{#if view.returnLabel!==null}<button type="button" class="context-back-btn" aria-label={view.returnLabel} title={view.returnLabel} data-emf-action="return-to-origin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button>{/if}<button type="button" class="modal-close" aria-label="Close" data-emf-action="close-editor">&times;</button>
    <h3>Baubiologie EMF Assessment</h3>
    <div class="modal-unit">Room-by-room electromagnetic field measurements rated against SBM-2015 sleeping area standards.</div>
    <div class="emf-editor-actions">
      <button type="button" class="import-btn import-btn-primary" data-emf-action="add-assessment">+ New Assessment</button>
      {#if view.ai}<button type="button" class="import-btn import-btn-secondary" data-emf-action="trigger-pdf-import">Import PDF</button>
      <input type="file" id="emf-pdf-input" accept=".pdf" style={emfStaticStyles.filePickerHidden} data-emf-change-action="pdf-input">{/if}
      <a href="data/emf-assessment-template.html" target="_blank" class="import-btn import-btn-secondary">Printable Template</a>
      {#if view.compareLabel!==null}<button type="button" class="import-btn import-btn-secondary" data-emf-action="toggle-compare">{view.compareLabel}</button>{/if}
    </div>{#if view.body.kind==='empty'}<div class="emf-empty">No assessments yet. Add one manually or import a consultant's PDF report.</div>{:else if view.body.kind==='compare'}<EMFComparison view={view.body.view}/>{:else}{#each view.body.cards as card}<div class="emf-assessment-card{card.expanded?' expanded':''}">
        <div class="emf-assessment-header" role="button" tabindex="0" data-emf-action="toggle-assessment" data-emf-assessment-id={card.toggleId}>
          <div class="emf-assessment-info">
            <span class="emf-assessment-date">{card.date}</span>
            {#if card.label!==null}<span class="emf-assessment-label">{card.label}</span>{/if}
            {#if card.consultant!==null}<span class="emf-assessment-consultant">by {card.consultant}</span>{/if}
          </div>
          {#if card.severity!==null}<span class="emf-badge emf-badge-{card.severity.color}">{card.severity.label}</span>{:else}<span class="emf-badge emf-badge-none">No data</span>{/if}
        </div>{#if card.detail!==null}<EMFAssessmentDetail view={card.detail}/>{/if}</div>{/each}{/if}<div id="emf-meter-recs-slot"></div>