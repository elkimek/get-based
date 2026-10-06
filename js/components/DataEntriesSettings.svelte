<script lang="ts">
  import { untrack } from 'svelte';
  import type { DataEntriesSnapshot } from '../settings-records-contract.js';
  import { RECORD_CARD, RECORD_META, RECORD_ACTIONS, RECORD_HEADING, RECORD_EDIT, RECORD_REMOVE, RECORD_PRIMARY, RECORD_SECONDARY, RECORD_DANGER } from '../settings-records-classes.js';
  let { initial }: { initial: DataEntriesSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  export function refresh(next: DataEntriesSnapshot): void { snapshot = next; }
</script>

{#if snapshot.empty}
  <div class="gb:records:text-secondary gb:records:text-[13px] gb:records:py-2">No data yet. Drop a PDF or JSON file on the dashboard, or add values manually.</div>
{:else}
  {#if snapshot.imports.length}
    <div class="{RECORD_HEADING} gb:records:mt-2">Imports</div>
    {#each snapshot.imports as report}
      <div class="{RECORD_CARD} imported-entry-snapshot">
        <div class="ie-info gb:records:min-w-0 gb:records:text-secondary">
          <div class="ie-mainline gb:records:flex gb:records:items-baseline gb:records:gap-2 gb:records:min-w-0">
            <span class="ie-date gb:records:text-ink gb:records:font-medium">{report.date}</span>
            <span class="ie-count gb:records:shrink-0 gb:records:text-secondary">{report.count}</span>
          </div>
          <div class={RECORD_META}>
            <span class="ie-file gb:records:min-w-0 gb:records:max-w-[min(320px,45vw)] gb:records:truncate gb:records:max-[641px]:max-w-full" title={report.fileName}>{report.fileName}</span>
            {#if report.model}<span class="ie-model gb:records:min-w-0 gb:records:max-w-[min(260px,35vw)] gb:records:truncate gb:records:max-[641px]:max-w-full" title={report.model}>{report.model}</span>{/if}
            <span class="ie-type gb:records:shrink-0 gb:records:text-[10px] gb:records:tracking-[0.04em] gb:records:uppercase">{report.type}</span>
            {#if report.importedTime}<span class="ie-type gb:records:shrink-0 gb:records:text-[10px] gb:records:tracking-[0.04em] gb:records:uppercase" title="Imported time">{report.importedTime}</span>{/if}
          </div>
        </div>
        <div class={RECORD_ACTIONS}>
          <button type="button" class={RECORD_EDIT} data-settings-action="review-import" data-snap-id={report.id} title="Review, edit values/units, and re-import without AI cost">Review &amp; Edit</button>
          <button type="button" class={RECORD_REMOVE} data-settings-action="remove-import-snapshot" data-snap-id={report.id}>Delete</button>
        </div>
      </div>
    {/each}
  {/if}
  {#if snapshot.manual.length}
    <div class="{RECORD_HEADING} gb:records:mt-4">Manual / legacy markers</div>
    {#each snapshot.manual as entry}
      <div class={RECORD_CARD}>
        <div class="ie-info gb:records:min-w-0 gb:records:text-secondary">
          <div class="ie-mainline gb:records:flex gb:records:items-baseline gb:records:gap-2 gb:records:min-w-0">
            <span class="ie-date gb:records:text-ink gb:records:font-medium">{entry.dateLabel}</span>
            <span class="ie-count gb:records:shrink-0 gb:records:text-secondary">{entry.count}</span>
          </div>
          <div class={RECORD_META}><span class="gb:records:ml-2 gb:records:text-[11px] {entry.manual ? 'gb:records:text-ink' : 'gb:records:text-secondary'}">{entry.source}</span></div>
        </div>
        <div class={RECORD_ACTIONS}>
          {#if entry.dateLocked}<span class="ie-count gb:records:shrink-0 gb:records:text-secondary" title="Date is locked because this date also has AI-imported snapshots">Date locked</span>
          {:else}<button type="button" class={RECORD_EDIT} data-settings-action="rename-imported-entry" data-entry-date={entry.date}>Edit date</button>{/if}
          <button type="button" class={RECORD_REMOVE} data-settings-action="remove-imported-entry" data-entry-date={entry.date}>Remove</button>
        </div>
      </div>
    {/each}
  {/if}
  <div class="gb:records:flex gb:records:gap-2 gb:records:mt-3 gb:records:flex-wrap">
    <button type="button" class={RECORD_PRIMARY} data-settings-action="share-profile">Share Profile</button>
    <button type="button" class={RECORD_SECONDARY} data-settings-action="export-client" title="Portable JSON including locally stored meal records and resized meal photos">Export Client</button>
    <button type="button" class={RECORD_SECONDARY} data-settings-action="export-all-clients" title="Full portable backup — all profiles, meal records and resized photos, data, and chat history">Export All Clients</button>
    <button type="button" class={RECORD_DANGER} data-settings-action="clear-all-data">Clear All Data</button>
  </div>
{/if}
