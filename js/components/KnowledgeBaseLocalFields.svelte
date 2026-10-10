<script lang="ts">
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
</script>
<section class={c('kb-section')} id="lens-library-picker" aria-labelledby="kb-library-heading">
  <div class={c('kb-section-head')}>
    <div>
      <h3 class={u('section-title')} id="kb-library-heading">Active library</h3>
      <p class={u('section-description')}>Keep research, clinical guides, and personal notes in separate collections.</p>
    </div>
    <button class={c('import-btn import-btn-primary kb-new-library-btn')} data-lens-action="new-library" title="Create a library">+ New library</button>
  </div>
  <div class={c('kb-library-row')}>
    <select id="lens-library-select" class={c('kb-field-control kb-library-select')} aria-label="Active library" data-lens-action="activate-library">
      <option value="">Loading…</option>
    </select>
    <div class={c('kb-library-actions')}>
      <button class={c('import-btn import-btn-secondary kb-small-btn')} data-lens-action="rename-library" title="Rename active library">Rename</button>
      <button class={c('kb-text-btn kb-text-btn-danger')} data-lens-action="delete-library" title="Delete active library">Delete</button>
    </div>
  </div>
  <p class={c('kb-field-help')}>Chat searches only the active library.</p>
</section>

<section class={c('kb-section')} id="lens-local-fields" aria-labelledby="kb-documents-heading">
  <div class={c('kb-section-head')}>
    <div>
      <h3 class={u('section-title')} id="kb-documents-heading">Documents</h3>
      <p class={u('section-description')}>Add files and keep working while indexing runs in the background.</p>
    </div>
  </div>
  <div id="lens-local-stats" class={c('kb-stats')} role="status">Loading your library…</div>
  <div id="lens-local-drop" class={c('kb-drop-zone')}
       role="button" tabindex="0"
       aria-label="Add documents — drop files here or press Enter to open the file picker"
       data-lens-action="open-local-filepick">
    <span class={c('kb-drop-icon')} aria-hidden="true">📁</span>
    <strong class={u('drop-title')}>Drop documents here or choose files</strong>
    <span>PDF · Markdown · Text · Word · JSON · ZIP</span>
  </div>
  <input type="file" id="lens-local-filepick" multiple hidden accept=".txt,.md,.markdown,.rst,.json,.csv,.log,.pdf,.docx,.zip">
  <div id="lens-local-progress-wrap" class={c('kb-inline-progress')} hidden>
    <progress class={u('inline-progress-bar')} id="lens-local-progress" value="0" max="100" aria-label="Indexing progress"></progress>
    <div class={u('inline-progress-message')} id="lens-local-progress-text" role="status" aria-live="polite"></div>
  </div>
  <div id="lens-local-doc-list" class={c('kb-document-list')}></div>
</section>
