<script lang="ts">
  import type {BiologyDashboardCoherenceView, BiologyDashboardDomain} from '../biology-overview-presentation.js';
  import {biologyOverviewClasses as c} from '../biology-overview-classes.js';
  import BiologyDashboardScore from './BiologyDashboardScore.svelte';
  let {view}: {view: BiologyDashboardCoherenceView} = $props();
</script>
{#snippet content(domain: BiologyDashboardDomain)}
  <span class={c('bc-micro-domain-label')}>{domain.label}</span><div class={c('bc-micro-domain-bar')} aria-hidden="true"><div class={c(`bc-micro-domain-fill bc-micro-domain-fill-${domain.tone}`)} style:width={`${domain.width}%`} style:background={domain.color}></div></div><span class={c('bc-micro-domain-score')}>{domain.value}</span>
{/snippet}
<section data-biology-overview-view class={c('db-bio-coherence-hero')}>
  <BiologyDashboardScore view={view.headline}/>
  {#if view.domains.length}
    <div class={c('db-bio-coherence-domains')}>
      {#each view.domains as domain}
        {#if domain.id}
          <button type="button" class={c('bc-micro-domain bc-micro-domain-action')} data-biology-score-action="jump-to-domain" data-biology-score-id={domain.id} title={domain.title}>{@render content(domain)}</button>
        {:else}
          <div class={c('bc-micro-domain bc-micro-domain-no-jump')} title={domain.title}>{@render content(domain)}</div>
        {/if}
      {/each}
    </div>
  {/if}
</section>
