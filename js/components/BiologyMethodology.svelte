<script lang="ts">
  import type {BiologyMethodologyView} from '../biology-reading-presentation.js';
  import BiologyReadingTable from './BiologyReadingTable.svelte';
  import BiologyReadingFacts from './BiologyReadingFacts.svelte';
  import {readingClasses as c} from '../biology-reading-classes.js';
  let {view}: {view: BiologyMethodologyView} = $props();
  const columns = ['Marker', 'Related group', 'Assigned weight', 'Core share', 'Role'];
</script>

<details data-biology-reading-view class={c('biology-score-methodology biology-reading-panel')}>
  <summary class={c('biology-methodology-summary')}>How this score works</summary>{' '}<div class={c('biology-reading-body')}>
    <p class={c('biology-reading-lead biology-reading-paragraph')}>{view.lead}</p><p class={c('biology-reading-paragraph')}>{view.description}</p>{' '}
    <BiologyReadingFacts facts={view.facts}/>{' '}
    <div class={c('biology-reading-source')}><span>{view.evidence}</span>{#if view.sourceUrl}<a
          class={c('biology-reading-link')} href={view.sourceUrl} target="_blank" rel="noopener noreferrer"
        >Biological background ↗</a>{/if}</div>{' '}
    <details class={c('biology-reading-notes')}>
      <summary class={c('biology-reading-notes-summary')}>Calculation details &amp; weights</summary><p class={c('biology-reading-note-copy')}>Two-sided ranges reach 0 one range-width beyond the boundary. One-sided ranges use half the boundary magnitude. Core share is the weight used after grouping related markers. Family budgets stay fixed when an accepted alternative is used. These curves are design choices; core completeness describes inputs, not scientific certainty. Model {view.algorithm}. The expanded-panel fit ({view.expandedFit}/100) is a diagnostic calculation over this exact panel, not a confidence measure or a stable trend.</p>{' '}
      <BiologyReadingTable label="Marker weights" {columns}>
        {#each view.weights as row}
          <tr><th scope="row" class={c('biology-reading-cell biology-reading-row-heading')}>{row.label}</th><td
              class={c('biology-reading-cell')}
            >{row.family}</td><td class={c('value-cell biology-reading-cell biology-reading-value')}>{row.assigned}</td><td
              class={c('value-cell biology-reading-cell biology-reading-value')}
            >{row.share}</td><td class={c('biology-reading-cell')}>{row.role}</td></tr>
        {/each}
      </BiologyReadingTable>{' '}
    </details>
  </div>
</details>
