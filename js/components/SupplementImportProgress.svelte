<script lang="ts">
  import type { SupplementImportProgressView } from '../supplement-import-progress-presentation.js';
  let { view }: { view: SupplementImportProgressView } = $props();
</script><svelte:options preserveWhitespace /><div class="supp-import-progress-head"><strong>{view.label}</strong><span>{view.detail}</span></div><div class="supp-import-progress-track" role="progressbar" aria-label="Supplement import progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={view.percent}><span style={`width:${view.percent}%`}></span></div>