<script lang="ts">
  import type {TipsGeneticsView} from '../tips-presentation.js';
  import {tipsClasses as c} from '../tips-classes.js';
  let {rows}: {rows: TipsGeneticsView[]} = $props();
</script>
<div class={c('rec-dna-hints')}>
  <div class={c('rec-section-label')}>🧬 YOUR GENETICS</div>
  {#each rows as row}
    {#if row.kind === 'finding'}
      <div class={c('rec-dna-row')}>{row.icon}{' '}<strong>{row.gene}{' '}{row.variant}</strong>: {row.genotype} — {row.note}{' '}<span class={c('rec-dna-evidence')}>Evidence · {row.evidence} · {row.relevance}</span>{#if row.study}{' '}<a href={row.study} target="_blank" rel="noopener" class={c('rec-dna-ref')}>study</a>{/if}{#if row.snpedia}{' '}<a href={row.snpedia} target="_blank" rel="noopener" class={c('rec-dna-ref')}>SNPedia</a>{/if}</div>
    {:else}
      <div class={c(`rec-dna-row${row.avoid ? ' rec-dna-avoid' : ''}`)}>{row.icon}{' '}{row.text}{' '}<span class={c('rec-dna-evidence')}>Evidence · {row.evidence} · {row.relevance}</span>{#if row.study}{' '}<a href={row.study} target="_blank" rel="noopener" class={c('rec-dna-ref')}>study</a>{/if}</div>
    {/if}
  {/each}
</div>
