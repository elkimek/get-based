<svelte:options preserveWhitespace={true}/><script lang="ts">
  import type {DashboardMtdnaStudyView} from '../dashboard-mtdna-study-presentation.js';
  let {view}: {view: DashboardMtdnaStudyView} = $props();
</script><article class="db-mtdna-study db-mtdna-study-{view.directionClass}">
      <div class="db-mtdna-study-head">
        <span>{view.label}</span>
        <em>{view.direction}</em>
      </div>
      <strong>{view.title}</strong>
      {#if view.scope !== null}<small>{view.scope}</small>{/if}
      {#if view.summary !== null}<p>{view.summary}</p>{/if}
      {#if view.model !== null}<dl><dt>Model</dt><dd>{view.model}</dd></dl>{/if}
      {#if view.limitations !== null}<dl><dt>Limits</dt><dd>{view.limitations}</dd></dl>{/if}
      {#if view.pmid}<a href="https://pubmed.ncbi.nlm.nih.gov/{view.pmid}/" target="_blank" rel="noopener">PubMed · PMID {view.pmid}</a>{/if}
    </article>