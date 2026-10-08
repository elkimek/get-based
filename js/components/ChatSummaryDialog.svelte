<script lang="ts">
  import type { SummaryDialogView } from '../chat-summary-presentation.js';
  import { renderMarkdown } from '../markdown.js';
  import { THINKING_DOT } from '../chat-message-content-classes.js';
  let { view }: { view: SummaryDialogView } = $props();
  const action = 'summary-action-btn gb:summary:min-h-11 gb:summary:min-w-11 gb:summary:cursor-pointer gb:summary:rounded gb:summary:border gb:summary:border-line gb:summary:bg-transparent gb:summary:px-3.5 gb:summary:py-1.5 gb:summary:font-body gb:summary:text-xs gb:summary:text-secondary gb:summary:hover:text-accent gb:summary:hover:border-accent gb:summary:focus-visible:outline-2 gb:summary:focus-visible:outline-accent gb:summary:focus-visible:outline-offset-2';
</script>
<div class="modal gb-form-modal gb:summary:w-[min(94vw,640px)] gb:summary:max-w-[640px] gb:summary:max-h-[85dvh] gb:summary:p-0" data-chat-summary-dialog role="dialog" aria-modal="true" aria-labelledby="chat-summary-title">
  <header class="gb:summary:flex gb:summary:items-center gb:summary:justify-between gb:summary:gap-4 gb:summary:border-b gb:summary:border-line gb:summary:bg-dialog-head gb:summary:px-6 gb:summary:py-4 gb:summary:max-[600px]:px-4">
    <h3 id="chat-summary-title" class="gb:summary:m-0 gb:summary:font-display gb:summary:text-[22px] gb:summary:font-bold gb:summary:text-ink">Summary</h3>
    <button class="modal-close gb:summary:static gb:summary:min-h-11 gb:summary:min-w-11 gb:summary:cursor-pointer gb:summary:rounded gb:summary:border-0 gb:summary:bg-transparent gb:summary:p-1 gb:summary:text-2xl gb:summary:text-secondary gb:summary:hover:text-ink gb:summary:focus-visible:outline-2 gb:summary:focus-visible:outline-accent" type="button" data-chat-message-action="close-summary" aria-label="Close">×</button>
  </header>
  <div class="gb:summary:p-6 gb:summary:max-[600px]:p-4 gb:summary:[overflow-wrap:anywhere]">
    <div class="summary-modal-meta gb:summary:mb-4 gb:summary:text-xs gb:summary:text-secondary">{view.name}{view.meta}</div>
    <div id="summary-modal-body" class="summary-modal-body gb:summary:text-sm gb:summary:leading-[1.7] gb:summary:text-ink">
      {#if view.loading}
        <div class="typing-indicator gb:summary:my-5 gb:summary:mx-auto gb:summary:flex gb:summary:w-fit gb:summary:gap-1.5" data-chat-message-content role="status" aria-label="Generating summary">
          <span aria-hidden="true" class={THINKING_DOT}></span><span aria-hidden="true" class={`${THINKING_DOT} gb:message-content:[animation-delay:.2s]`}></span><span aria-hidden="true" class={`${THINKING_DOT} gb:message-content:[animation-delay:.4s]`}></span>
        </div>
      {:else}
        {@html renderMarkdown(view.content)}
      {/if}
    </div>
    {#if !view.loading && view.attribution}<div class="chat-provider-attribution gb:summary:mt-1.5 gb:summary:text-[11px] gb:summary:font-semibold gb:summary:text-secondary">{view.attribution}</div>{/if}
    <div class={`summary-modal-actions gb:summary:mt-4 gb:summary:flex-wrap gb:summary:gap-2 gb:summary:border-t gb:summary:border-line gb:summary:pt-3 ${view.loading ? 'gb:summary:hidden' : 'gb:summary:flex'}`} hidden={view.loading}>
      <button class={action} type="button" data-chat-message-action="copy-summary" title="Copy as markdown">Copy</button>
      <button class={action} type="button" data-chat-message-action="download-summary" title="Download as .md file">Download</button>
      <button class={action} type="button" data-chat-message-action="print-summary" title="Print">Print</button>
      {#if view.savedId}<button class={`${action} secondary delete gb:summary:ml-auto gb:summary:hover:text-danger gb:summary:hover:border-danger`} type="button" data-chat-message-action="delete-summary" data-chat-message-summary-id={view.savedId} title="Delete summary">Delete</button>{/if}
    </div>
  </div>
</div>
