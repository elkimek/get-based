<script lang="ts">
 import {emfStaticStyles} from '../emf-inline-style-map.generated.js';
 import type {EMFComparisonView} from '../emf-comparison-presentation.js';
 let {view}:{view:EMFComparisonView}=$props();
</script><svelte:options preserveWhitespace={true}/><div class="emf-compare-header">
    <span class="emf-compare-label">Before: {view.before}</span>
    <span class="emf-compare-arrow">→</span>
    <span class="emf-compare-label">After: {view.after}</span>
  </div>{#if view.earlier!==null}<div class="emf-compare-note">Comparing the two most recent assessments. {view.earlier.count} earlier assessment{view.earlier.suffix} not shown.</div>{/if}<div class="emf-compare-table"><table>
    <thead><tr><th>Room</th>{#each view.columns as column}<th>{column}</th>{/each}</tr></thead><tbody>{#each view.rows as row}<tr><td class="emf-compare-room">{row.label}</td>{#each row.cells as cell}<td class="emf-compare-cell">{#if cell.kind==='empty'}—{:else if cell.kind==='paired'}<span style="color:var(--{cell.beforeColor})">{cell.beforeText}</span>
          <span style="color:{cell.arrowColor};{emfStaticStyles.valueEmphasis}">{cell.arrow}</span>
          <span style="color:var(--{cell.afterColor})">{cell.afterText}</span>{:else if cell.kind==='added'}<span style={emfStaticStyles.mutedValue}>—</span> → <span style="color:var(--{cell.afterColor})">{cell.afterText}</span>{:else}<span style="color:var(--{cell.beforeColor})">{cell.beforeText}</span> → <span style={emfStaticStyles.mutedValue}>—</span>{/if}</td>{/each}</tr>{/each}</tbody></table></div>{#if view.interpret}<div style={emfStaticStyles.sectionSpacing}>
      <button type="button" class="import-btn import-btn-secondary" data-emf-action="interpret-comparison">Interpret Changes</button>
    </div>{/if}