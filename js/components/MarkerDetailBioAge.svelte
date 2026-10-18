<svelte:options preserveWhitespace={true}/><script lang="ts">
import type {MarkerDetailBioAgeView} from '../marker-detail-view.js';
let {view}:{view:MarkerDetailBioAgeView}=$props();
</script>{#snippet bio(node:MarkerDetailBioAgeView)}{#if node.kind === "input"}<span class="bio-age-input {node.state}" title="{node.title}">{node.glyph} {node.label}</span>{:else if node.kind === "delta"} <span class="bio-age-delta">({node.sign}{node.years}y)</span>{:else if node.kind === "present-heading"}<span class="bio-age-glyph">✓</span> <strong>{node.name}:</strong> {node.value}{#if node.delta}{@render bio(node.delta)}{/if}{:else if node.kind === "missing-heading"}<span class="bio-age-glyph">⚠</span> <strong>{node.name}:</strong> missing {node.missing} of {node.total} {node.noun}{:else if node.kind === "component"}<div class="bio-age-component {node.state}">
          <div class="bio-age-component-header">{#if node.heading}{@render bio(node.heading)}{/if}</div>
          <div class="bio-age-input-grid">{#each node.inputs as input}{@render bio(input)}{/each}</div>
        </div>{:else if node.kind === "panel-date"}<div class="bio-age-breakdown-sub">Based on your panel from {node.date}</div>{:else if node.kind === "warning"}<div class="bio-age-breakdown-warning">{node.issues}</div>{:else if node.kind === "breakdown"}<div class="bio-age-breakdown">
        <div class="bio-age-breakdown-head">Component breakdown</div>
        {#if node.date}{@render bio(node.date)}{/if}
        {#if node.warning}{@render bio(node.warning)}{/if}
        {#if node.pheno}{@render bio(node.pheno)}{/if}
        {#if node.bortz}{@render bio(node.bortz)}{/if}
      </div>{:else if node.kind === "missing"}<div class="calc-missing-inputs">Not calculated — {node.issues}</div>{/if}{/snippet}{@render bio(view)}