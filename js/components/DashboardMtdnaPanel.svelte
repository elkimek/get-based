<svelte:options preserveWhitespace={true}/><script lang="ts">
  import DashboardMtdnaStudy from './DashboardMtdnaStudy.svelte';
  import type {DashboardMtdnaPanelView} from '../dashboard-mtdna-panel-presentation.js';
  let {view}:{view:DashboardMtdnaPanelView}=$props();
</script><section class="db-mtdna-panel" data-mtdna-haplogroup={view.haplogroup}>
      <div class="db-mtdna-head">
        <span><small>Maternal lineage</small><strong>mtDNA {view.lineage}</strong></span>
        <em>{view.lens}</em>
      </div>
      {#if view.coupling!==null}<div class="db-mtdna-coupling"><strong>{view.coupling.label}</strong><span>{view.coupling.climate}</span></div>{/if}
      {#if view.origin!==null||view.source!==null||view.match!==null}<div class="db-mtdna-facts">{#if view.origin!==null}<span><small>Origin</small><strong>{view.origin}</strong></span>{/if}{#if view.source!==null}<span><small>Source</small><strong>{view.source}</strong></span>{/if}{#if view.match!==null}<span><small>Marker match</small><strong>{view.match}</strong></span>{/if}</div>{/if}
      {#if view.copy.length}<div class="db-mtdna-copy">{#if view.copy[0]!==undefined}<p>{view.copy[0]}</p>{/if}{#if view.copy[1]!==undefined}<p>{view.copy[1]}</p>{/if}{#if view.copy[2]!==undefined}<p>{view.copy[2]}</p>{/if}</div>{/if}
      {#if view.environment!==null}<div class="db-mtdna-environment{view.environment.mismatch?' is-mismatch':' is-match'}">{view.environment.text}</div>{/if}
      {#if view.evidence!==null}<details class="db-mtdna-evidence" data-mtdna-evidence>
        <summary>Wallace framework &amp; evidence <span>{view.evidence.count} sources</span></summary>
        <div class="db-mtdna-evidence-body">
          {#if view.evidence.caveat!==null}<p class="db-mtdna-caveat">{view.evidence.caveat}</p>{/if}
          <div class="db-mtdna-study-grid">{#each view.evidence.studies as study}<DashboardMtdnaStudy view={study} />{/each}</div>
          {#if view.evidence.issueURL!==null}<a href={view.evidence.issueURL} target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest an mtDNA study or correction</a>{/if}
        </div>
      </details>{/if}
    </section>