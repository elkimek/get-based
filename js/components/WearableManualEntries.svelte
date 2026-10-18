<script lang="ts">
 import type {WearableManualEntriesView} from '../wearable-detail-presentation.js';
 
 let {view}:{view:WearableManualEntriesView}=$props();
 
</script><svelte:options preserveWhitespace={true}/>{#if view.kind==='compact-empty'}<section class="wearable-manual-entries wearable-manual-entries-compact">
        <button type="button" class="wearable-manual-add-btn" data-wearable-action="open-detail-manual-add" data-wearable-metric={view.metric}>+ Add a manual reading</button>
        <div id="wearable-manual-add-slot"></div>
      </section>{:else if view.kind==='empty'}<section class="wearable-manual-entries">
      <div class="wearable-manual-entries-head">
        <span class="wearable-manual-entries-title">Manual entries</span>
        <button type="button" class="wearable-manual-add-btn" data-wearable-action="open-detail-manual-add" data-wearable-metric={view.metric}>+ Add reading</button>
      </div>
      <div class="wearable-manual-entries-empty">No manual entries for this metric yet.</div>
      <div id="wearable-manual-add-slot"></div>
    </section>{:else if view.kind==='list'}<section class="wearable-manual-entries">
    <div class="wearable-manual-entries-head">
      <span class="wearable-manual-entries-title">Manual entries <span class="wearable-manual-entries-count">{view.count}</span></span>
      <button type="button" class="wearable-manual-add-btn" data-wearable-action="open-detail-manual-add" data-wearable-metric={view.metric}>+ Add reading</button>
    </div>
    <div id="wearable-manual-add-slot"></div>
    <ul class="wearable-manual-entries-list">{#each view.rows as entry}<li class="wearable-manual-entry{entry.note!==null?' has-note':''}" data-entry-date="{entry.date}">
      <span class="wearable-manual-entry-date">{entry.shortDate}</span>
      <span class="wearable-manual-entry-val">{entry.value}{#if entry.unit!==null} <span class="wearable-manual-entry-unit">{entry.unit}</span>{/if}</span>
      {#if entry.tags!==null}<span class="wearable-manual-entry-tags">{#each entry.tags as tag}<span class="wearable-manual-entry-tag">{tag}</span>{/each}</span>{/if}
      <button type="button" class="wearable-manual-entry-del" title="Delete this reading" aria-label="{entry.deleteLabel}" data-wearable-action="delete-detail-manual-entry" data-wearable-metric={entry.metric} data-wearable-date={entry.deleteDate}>×</button>
      {#if entry.note!==null}<div class="wearable-manual-entry-note">{entry.note}</div>{/if}
    </li>{/each}</ul>
  </section>{/if}