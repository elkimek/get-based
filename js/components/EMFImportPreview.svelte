<script lang="ts">
 import {emfStaticStyles} from '../emf-inline-style-map.generated.js';
 import type {EMFImportPreviewView} from '../emf-editor-presentation.js';
 let {view}:{view:EMFImportPreviewView}=$props();
</script><svelte:options preserveWhitespace={true}/><button type="button" class="context-back-btn" aria-label="Back to EMF assessments" title="Back to EMF assessments" data-emf-action="close-preview"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button><button type="button" class="modal-close" aria-label="Back to EMF assessments" data-emf-action="close-preview">&times;</button>
    <h3>EMF Report Preview</h3>
    <div class="modal-unit">{view.date}{#if view.consultant!==null} — by {view.consultant}{/if}</div>{#each view.rooms as room}<div class="emf-room-card">
      <div class="emf-room-header"><strong>{room.name}</strong>
        {#if room.location!==null}<span style={emfStaticStyles.roomLocation}>{room.location}</span>{/if}
      </div>
      <div class="emf-measurements">{#each room.measurements as measurement}<div class="emf-measurement-row">
        <span class="emf-measurement-label">{measurement.label}</span>
        <span style={emfStaticStyles.valueEmphasis}>{measurement.value}</span>
        <span class="emf-measurement-unit">{measurement.unit}</span>
        {#if measurement.severity!==null}<span class="emf-severity-dot" style="background:var(--{measurement.severity.color})" title={measurement.severity.label}></span>
        <span style="{emfStaticStyles.severityLabelFont}color:var(--{measurement.severity.color})">{measurement.severity.label}</span>{/if}
      </div>{/each}</div>{#if room.sources!==null}<div style={emfStaticStyles.roomSources}>Sources: {room.sources}</div>{/if}{#if room.mitigations!==null}<div style={emfStaticStyles.roomMitigations}>Mitigations: {room.mitigations}</div>{/if}</div>{/each}<div class="ctx-editor-actions">
    <button type="button" class="import-btn import-btn-primary" id="emf-confirm-btn">Confirm Import</button>
    <button type="button" class="import-btn import-btn-secondary" data-emf-action="close-preview">Cancel</button>
  </div>