<script lang="ts">
  import type {TipsTierView} from '../tips-presentation.js';
  import {tipsClasses as c} from '../tips-classes.js';
  import TipsProduct from './TipsProduct.svelte';
  let {view}: {view: TipsTierView} = $props();
</script>
<div class={c('rec-section-label')}>{view.label}{#if view.hint}{' '}<span class={c('rec-tier-hint')}>{view.hint}</span>{/if}</div>
{#each view.items as item}
  {#if item.kind === 'product'}<TipsProduct view={item.product}/>
  {:else if item.kind === 'forms'}<div class={c('rec-item-form')}>{#each item.forms as form, index}{#if index}{', '}{/if}{#if form}{form.text}{#if form.href}{' '}<a href={form.href} target="_blank" rel="noopener" class={c('rec-ref-link')}>(study)</a>{/if}{/if}{/each}</div>
  {:else if item.kind === 'drug-warning'}<div class={c('rec-drug-warning')}>Pharmaceutical-grade compounds may require medical supervision and can interact with medications. Consult your physician before use.</div>
  {:else}<div class={c(`rec-item-${item.kind}`)}>{item.text}</div>{/if}
{/each}
