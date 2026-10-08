<script lang="ts">
  import type {BiologyMarkerSection} from '../biology-reading-presentation.js';
  import BiologyReadingTable from './BiologyReadingTable.svelte';
  import {readingClasses as c} from '../biology-reading-classes.js';
  let {sections}: {sections: BiologyMarkerSection[]} = $props();
  const columns = ['Marker', 'Result', 'Scoring range', 'Collected', 'Range fit / contribution'];
</script>

{#each sections as section}
  <section data-biology-reading-view class={c('biology-score-marker-section')}>
    <header class={c('biology-marker-header')}>
      <h4 class={c('biology-marker-heading')}>{section.core ? 'Core markers' : 'Additional markers'} <span class={c('biology-section-count')}>{section.rows.length}</span></h4><p class={c('biology-marker-intro')}>{section.core ? 'These markers determine the headline score.' : 'Optional results add context and help interpret the core panel.'}</p>
    </header>{' '}
    {#if section.rows.length}
      <p class={c('biology-table-scroll-hint')}>Swipe or scroll sideways for dates and contributions ↔</p><BiologyReadingTable
        label={`${section.core ? 'Core' : 'Additional'} marker results`} {columns}
      >{#each section.rows as row}
          <tr><th scope="row" class={c('biology-reading-cell biology-reading-row-heading')}>
              {#if row.id}
                <button type="button" class={c('biology-score-marker-link biology-marker-name')}
                  title={row.title} data-biology-score-action="open-marker" data-biology-marker-id={row.id}
                >{row.label}</button>
              {:else}
                <span class={c('biology-score-marker-link-static biology-marker-name')} title={row.title}>{row.label}</span>
              {/if}{#if row.specimen}<small class={c('biology-reading-small')}>{row.specimen}</small>{/if}
            </th><td class={c('value-cell biology-reading-cell biology-reading-value')}>{row.result} <span class="unit-col">{row.unit}</span></td><td
              class={c('ref-col biology-reading-cell')}
            >{row.range}<small class={c('biology-reading-small')}>{row.rangeLabel}</small></td><td
              class={c('biology-reading-cell')}
            >{row.date}</td><td class={c('biology-reading-cell')}><span
                class={c('biology-fit-badge')} style:--score-color={row.color}
              >{row.fit}</span><small class={c('biology-reading-small')}>{row.contribution}</small></td></tr>
        {/each}</BiologyReadingTable>
    {:else}
      <p>No results yet.</p>
    {/if}{' '}
    {#if section.missing}
      <p class={c('biology-score-missing')}><strong>Missing:</strong> {section.missing}</p>
    {/if}
  </section>
{/each}
