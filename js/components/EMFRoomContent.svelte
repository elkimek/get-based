<script lang="ts">
 import {emfStaticStyles} from '../emf-inline-style-map.generated.js';
 import type {EMFRoomView} from '../emf-editor-presentation.js';
 let {view}:{view:EMFRoomView}=$props();
</script><svelte:options preserveWhitespace={true}/><div class="emf-room-content">
    <div class="emf-room-header">
      <select class="emf-input emf-room-select" data-emf-change-action="room-dropdown" data-emf-assessment-id={view.dropdownId} data-emf-room-idx={view.index}>
        {#each view.options as option}<option value={option.value} selected={option.selected} disabled={option.disabled}>{option.label}</option>{/each}
      </select>
      <input type="text" class="emf-input emf-location" data-emf-room-field="location" value={view.location} placeholder="Location (e.g. bed pillow area)" data-emf-change-action="room-field" data-emf-assessment-id={view.locationId} data-emf-room-idx={view.index}>
      <label class="emf-sleeping-toggle" title="Sleeping areas use stricter SBM-2015 thresholds">
        <input type="checkbox" data-emf-room-field="sleeping" checked={view.sleeping} data-emf-change-action="room-field" data-emf-assessment-id={view.sleepingId} data-emf-room-idx={view.index}>
        Sleeping area
      </label>
      {#if view.removable}<button type="button" class="emf-remove-room" data-emf-action="remove-room" data-emf-assessment-id={view.removeId} data-emf-room-idx={view.index} title="Remove room">&times;</button>{/if}
    </div>
    <div class="emf-measurements">{#each view.measurements as measurement}<div class="emf-measurement-row">
      <span class="emf-measurement-label">{measurement.label}</span>
      <input type="number" class="emf-input emf-value-input" value={measurement.value} step="any" placeholder="—"
        data-emf-measurement-type={measurement.key}
        data-emf-change-action="measurement" data-emf-assessment-id={measurement.measurementId} data-emf-room-idx={view.index}>
      <span class="emf-measurement-unit">{measurement.unit}</span>
      {#if measurement.placeholder}<span class="emf-severity-dot-placeholder"></span>{:else if measurement.dot!==null}<span class="emf-severity-dot" style="background:var(--{measurement.dot.color})" title={measurement.dot.label}></span>{/if}
      <input type="text" class="emf-input emf-meter-input" value={measurement.meter} placeholder="Meter"
        list="emf-meters-{measurement.key}"
        data-emf-meter-type={measurement.key}
        data-emf-change-action="meter" data-emf-assessment-id={measurement.meterId} data-emf-room-idx={view.index}>
    </div>{/each}</div>{#each view.meters as meter}<datalist id="emf-meters-{meter.key}">{#each meter.names as name}<option value={name}></option>{/each}</datalist>{/each}<div class="emf-tags-section">
    <div class="emf-tags-label">Sources identified</div>
    <div class="ctx-tags" id={view.sourcesId}>
      {#each view.sources as source}<button type="button" class="ctx-tag{source.active?' active':''}" data-emf-action="toggle-tag">{source.label}</button>{/each}
    </div></div><div class="emf-tags-section">
    <div class="emf-tags-label">Mitigations applied</div>
    <div class="ctx-tags" id={view.mitigationsId}>
      {#each view.mitigations as mitigation}<button type="button" class="ctx-tag{mitigation.active?' active':''}" data-emf-action="toggle-tag">{mitigation.label}</button>{/each}
    </div></div><input type="text" class="emf-input emf-room-note" data-emf-room-field="note" value={view.note} placeholder="Room notes" data-emf-change-action="room-field" data-emf-assessment-id={view.noteId} data-emf-room-idx={view.index}><div class="emf-photos-section">
    <div class="emf-tags-label">Photos</div>
    <div class="emf-photos-grid">
      {#each view.photos as photo}<div class="emf-photo-thumb">
        <button type="button" class="emf-photo-open" style={emfStaticStyles.photoButton} data-emf-action="view-photo" data-emf-assessment-id={photo.viewId} data-emf-room-idx={view.index} data-emf-photo-idx={photo.index}><img src={photo.src} alt={photo.name}></button>
        <button type="button" class="emf-photo-remove" data-emf-action="remove-photo" data-emf-assessment-id={photo.removeId} data-emf-room-idx={view.index} data-emf-photo-idx={photo.index} title="Remove">&times;</button>
      </div>{/each}
      <label class="emf-photo-add" title="Add photo">
        <input type="file" accept="image/*" multiple style={emfStaticStyles.filePickerHidden} data-emf-change-action="photos" data-emf-assessment-id={view.photosId} data-emf-room-idx={view.index}>
        +
      </label>
    </div>
  </div></div>