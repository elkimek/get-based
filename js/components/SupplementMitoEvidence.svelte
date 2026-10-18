<script lang="ts">
 import type {SupplementEvidence} from '../supplement-dashboard-presentation.js';
 let {view}:{view:SupplementEvidence}=$props();
 type Group=SupplementEvidence['groups'][number];
 type Study=Extract<Group,{kind:'single'}>['study'];
</script><svelte:options preserveWhitespace/>{#snippet badges(study:Study)}<span class="supp-mito-badge">{study.badges.study}</span><span class={'supp-mito-direction supp-mito-direction-'+study.badges.directionClass}>{study.badges.direction}</span>{#if study.badges.scope!==null}<span class="supp-mito-scope">{study.badges.scope}</span>{/if}{/snippet}{#snippet detail(study:Study)}<div><strong>Study model:</strong> {study.detail.model}</div><div><strong>Exposure:</strong> {study.detail.exposure}</div><div><strong>What it cannot tell us:</strong> {study.detail.limitations}</div><div><strong>Source:</strong> {study.detail.title}</div><div><a href={study.detail.links.study} target="_blank" rel="noopener" class="supp-mitotox-link">Primary study · PMID {study.detail.links.pmid}</a><a href={study.detail.links.search} target="_blank" rel="noopener" class="supp-mitotox-link">Related PubMed research</a><a href={study.detail.links.report} target="_blank" rel="noopener" class="supp-mitotox-link supp-mito-report-link" title="Opens a public GitHub issue without your tracked product or dose">Report evidence issue</a></div>{/snippet}<div class="supp-mitotox">
    <div class="supp-mitotox-header"><span><strong>Primary mitochondrial evidence</strong> · {view.compoundCount} · {view.studyCount}</span><span class="supp-mitotox-ask" data-supp-action="ask-mito">ask AI for context</span></div>
    <div class="supp-mitotox-note">Matched to current active ingredients. The catalog is deliberately incomplete, so no match does not mean no effect. The study badge matters: laboratory and animal findings do not prove benefit or harm at your dose.</div>{#each view.groups as group}{#if group.kind==='single'}<details class="supp-mitotox-item" data-mito-compound={group.compoundAttribute}>
        <summary><strong>{group.compoundText}</strong>{@render badges(group.study)}<span class="supp-mito-summary">{group.study.summary}</span></summary>
        <div class="supp-mito-detail"><div><strong>Matched in:</strong> {group.products}</div>{@render detail(group.study)}</div>
      </details>{:else}<details class="supp-mitotox-item supp-mito-compound-group" data-mito-compound={group.compoundAttribute}>
      <summary><strong>{group.compoundText}</strong><span class="supp-mito-badge">{group.count} studies</span><span class="supp-mito-direction supp-mito-direction-mixed">Evidence differs by context</span><span class="supp-mito-summary">Expand to compare each study population and finding.</span></summary>
      <div class="supp-mito-detail supp-mito-study-list"><div class="supp-mito-group-match"><strong>Matched in:</strong> {group.products}</div>{#each group.studies as study}<section class="supp-mito-study">
        <div class="supp-mito-study-head">{@render badges(study)}</div>
        <div class="supp-mito-study-summary">{study.summary}</div>
        {@render detail(study)}
      </section>{/each}</div></details>{/if}{/each}</div>
