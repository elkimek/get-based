<script lang="ts">
  import type {BiologyContributorsView} from '../biology-overview-presentation.js';
  import {biologyOverviewClasses as c} from '../biology-overview-classes.js';
  let {view}: {view: BiologyContributorsView} = $props();
</script>
{#if view.rows.length}
  <details id="biology-score-membership" class={c('biology-overview-membership biology-reading-panel')}>
    <summary class={c('biology-overview-membership-heading')}>Overview contributors <span class={c('biology-membership-count')}>{view.included}/{view.rows.length} included</span></summary>
    <div class={c('biology-reading-body')}><p class={c('biology-overview-membership-lead')}>13 baseline scores form 12 domains. Iron Handling and Blood Flow Context share the blood domain.</p><div class={c('biology-membership-list')}>{#each view.rows as row}<button type="button" class={c('biology-contributor-button')} data-biology-score-action="jump-to-domain" data-biology-score-id={row.id}><span>{row.title}{#if row.sharedBloodDomain}<small class={c('biology-contributor-shared')}>Shared blood domain</small>{/if}</span><span class={c('biology-membership-badge')} data-overview-membership={row.included ? 'included' : 'excluded'}>{row.label}</span></button>{/each}</div></div>
  </details>
{/if}
