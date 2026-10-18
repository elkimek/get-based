<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {WearableStripHeaderView} from '../wearable-strip-presentation.js';
 
 let {view}:{view:WearableStripHeaderView}=$props();
 
</script><svelte:options preserveWhitespace={true}/><div class="wearable-strip-header" data-wearable-action="toggle-strip" style={componentStaticStyles.pointer}>
      <div class="wearable-strip-title">
        <span class="wearable-strip-icon" aria-hidden="true">⌬</span>
        {#if view.manualOnly}<span>Biometrics</span>{:else}<span>Wearables: <span class="wearable-source-label">{view.sourceNames}{view.coverage}</span></span>{/if}
        {#if view.showDemo}<button type="button" class="wearable-strip-demo-pill" data-wearable-action="open-settings-wearables" title="This is a sample. Connect your own wearable to see real data here.">demo data — connect yours</button>{/if}
        {#if view.reorderMode}<span class="wearable-strip-reorder-pill">⇄ Reorder mode — use ◀ ▶ on each card</span>{/if}
      </div>
      <div class="wearable-strip-meta">
        {#if view.lastSync!==null}<span class="wearable-strip-lastsync">last synced {view.lastSync}</span>{/if}
        {#if view.sync}<button type="button" class="wearable-strip-sync" aria-label="Sync stale wearables now" data-wearable-action="sync-now">
    <svg class="wearable-strip-sync-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
    <span>Sync stale data</span>
  </button>{/if}
        <button type="button" class="wearable-strip-reorder{view.reorderMode?' active':''}" aria-label="{view.reorderMode?'Done reordering':'Reorder cards'}" title="{view.reorderMode?'Done reordering':'Reorder cards'}" data-wearable-action="toggle-reorder">
          {view.reorderMode?'Done':'⇄ Reorder'}
        </button>
        <button type="button" class="wearable-collapse-arrow{view.collapsed?' collapsed':''}" aria-expanded="{!view.collapsed}" aria-label="{view.collapseLabel}" data-wearable-action="toggle-strip">▾</button>
      </div>
    </div>