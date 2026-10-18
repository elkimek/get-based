<script lang="ts">
  import type {SupplementExpandedView} from '../supplement-editor-presentation.js';
  import SupplementImpact from './SupplementImpact.svelte';
  import SupplementForm from './SupplementForm.svelte';
  let {view}:{view:SupplementExpandedView}=$props();
</script><svelte:options preserveWhitespace/><div class="supp-list-expanded" data-expanded-idx={view.index}><SupplementImpact view={view.impact}/><SupplementForm kind="form" view={view.form}/></div>