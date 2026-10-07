<script lang="ts">
  import type { ChatCitations } from '../chat-message-content-contract.js';
  import { CITATION_SUMMARY } from '../chat-message-content-classes.js';
  let { view }: { view: ChatCitations } = $props();
  function containClicks(root: HTMLDetailsElement) {
    const contain = (event: Event) => event.stopPropagation();
    root.addEventListener('click', contain);
    return { destroy() { root.removeEventListener('click', contain); } };
  }
</script>
<details class="chat-lens-sources gb:message-content:mt-2 gb:message-content:border-t gb:message-content:border-line gb:message-content:pt-2" data-chat-message-content data-chat-message-action="contain-click" use:containClicks>
  <summary class="chat-lens-sources-summary {CITATION_SUMMARY} gb:message-content:py-0.5 gb:message-content:text-[11px] gb:message-content:text-secondary gb:message-content:hover:text-ink gb:message-content:gap-1.5">📎 {view.chunks.length} excerpt{view.chunks.length !== 1 ? 's' : ''} from {view.label}</summary>
  <div class="chat-lens-sources-body gb:message-content:mt-1.5 gb:message-content:pt-1.5 gb:message-content:flex gb:message-content:flex-col gb:message-content:gap-1">
    {#each view.chunks as chunk}
      <details class="chat-lens-source gb:message-content:border gb:message-content:border-line gb:message-content:rounded-sm gb:message-content:bg-secondary-surface gb:message-content:text-[11px] gb:message-content:min-w-0" data-chat-message-action="contain-click">
        <summary class="chat-lens-source-summary {CITATION_SUMMARY} gb:message-content:gap-2 gb:message-content:px-2.5 gb:message-content:py-1.5">
          <span class="chat-lens-source-name gb:message-content:flex-1 gb:message-content:min-w-0 gb:message-content:truncate gb:message-content:font-mono gb:message-content:text-ink">{chunk.source}</span>
          {#if chunk.score !== null}<span class="chat-lens-source-score gb:message-content:shrink-0 gb:message-content:px-1.5 gb:message-content:py-px gb:message-content:rounded-[3px] gb:message-content:bg-[color-mix(in_srgb,var(--accent)_15%,var(--bg-card))] gb:message-content:text-ink gb:message-content:font-mono gb:message-content:text-[10px]" title="Cosine similarity">{chunk.score}</span>{/if}
        </summary>
        <div class="chat-lens-source-text gb:message-content:px-2.5 gb:message-content:pt-2 gb:message-content:pb-2.5 gb:message-content:border-t gb:message-content:border-line gb:message-content:text-secondary gb:message-content:leading-normal gb:message-content:whitespace-pre-wrap gb:message-content:[overflow-wrap:anywhere]">{#each chunk.lines as line, index}{line}{#if index < chunk.lines.length - 1}<br>{/if}{/each}</div>
      </details>
    {/each}
  </div>
</details>
