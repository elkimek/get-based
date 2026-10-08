<script lang="ts">
  import type { SavedSummaryView } from '../chat-summary-presentation.js';
  let { rows }: { rows: SavedSummaryView[] } = $props();
</script>
{#if rows.length}
  <div data-chat-saved-summaries-view>
    <div class="chat-saved-summaries-title gb:summary:border-t gb:summary:border-line gb:summary:px-2.5 gb:summary:pt-3 gb:summary:pb-1.5 gb:summary:text-[10px] gb:summary:text-secondary gb:summary:uppercase gb:summary:tracking-[.5px]">Summaries</div>
    {#each rows as row}
      <button type="button" class="chat-saved-summary-item gb:summary:block gb:summary:w-full gb:summary:min-h-11 gb:summary:min-w-11 gb:summary:cursor-pointer gb:summary:rounded-md gb:summary:border-0 gb:summary:bg-transparent gb:summary:px-2.5 gb:summary:py-2 gb:summary:text-left gb:summary:font-body gb:summary:hover:bg-hover gb:summary:focus-visible:outline-2 gb:summary:focus-visible:outline-accent gb:summary:focus-visible:outline-offset-[-2px]"
        data-chat-message-action="view-summary" data-chat-message-summary-id={row.id}>
        <div class="chat-saved-summary-name gb:summary:truncate gb:summary:text-xs gb:summary:text-ink">{row.name}</div>
        <div class="chat-saved-summary-meta gb:summary:text-[10px] gb:summary:text-secondary">{row.meta}</div>
      </button>
    {/each}
  </div>
{/if}
