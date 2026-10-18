<script lang="ts">
  import type {SupplementEditorView} from '../supplement-editor-presentation.js';
  import SupplementEditorRow from './SupplementEditorRow.svelte';
  import SupplementQualityOverview from './SupplementQualityOverview.svelte';
  let {view}:{view:SupplementEditorView}=$props();
</script><svelte:options preserveWhitespace/><button
  class="modal-close" aria-label="Close supplements and medications"
  data-supp-action="close-modal">×</button><h3>Supplements &amp; Medications</h3><div
  class="modal-unit">Track what you're taking and when. Click an item to edit it. This history supports context and research warnings; it is not a comprehensive interaction or prescribing checker.</div><SupplementQualityOverview rows={view.quality}/>{#if
  view.hasRows}<div
  class="supp-list">{#each
  view.rows as row}<SupplementEditorRow {row}/>{/each}</div>{/if}<div
  class="supp-add-section"><button
  class="supp-add-btn"
  data-supp-action="toggle-add-form">+ Add New</button><div id="supp-add-form-area"></div></div>