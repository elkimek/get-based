<script lang="ts">
  import { flushSync } from 'svelte';
  import { CHAT_COPY_LABELS, type ChatCopyMode, type ChatMessageActionsView } from '../chat-message-actions-contract.js';
  import { ownChatMessageActions } from '../chat-message-actions-view.js';
  import { MESSAGE_ACTION_BUTTON, MESSAGE_ACTION_FOCUS } from '../chat-message-actions-classes.js';
  import ChatMessageIcon from './ChatMessageIcon.svelte';
  import ChatAgentDraftCards from './ChatAgentDraftCards.svelte';
  import ChatSpeechButton from './ChatSpeechButton.svelte';
  let { view }: { view: ChatMessageActionsView } = $props();
  let copied = $state<ChatCopyMode>('idle');
  let contextOpen = $state(false);
  function own(root: HTMLElement) { return ownChatMessageActions(root, view.index, {
    copy: mode => flushSync(() => { copied = mode; }), toggle: () => flushSync(() => { contextOpen = !contextOpen; }),
  }); }
  function dismiss(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    const details = (event.currentTarget as HTMLElement).closest<HTMLDetailsElement>('.chat-action-more[open]');
    if (!details) return;
    event.preventDefault(); event.stopPropagation(); details.open = false; details.querySelector('summary')?.focus();
  }
</script>
<div data-chat-message-actions-view data-chat-message-index={view.index} class="gb:message-actions:contents" use:own>
  {#if view.kind === 'user'}
    <div class="chat-user-action-bar gb:message-actions:absolute gb:message-actions:right-[calc(100%+6px)] gb:message-actions:bottom-0 gb:message-actions:opacity-0 gb:message-actions:transition-opacity gb:message-actions:[.chat-user:hover_&]:opacity-100 gb:message-actions:[.chat-user:focus-within_&]:opacity-100 gb:message-actions:pointer-coarse:opacity-100 gb:message-actions:[@media(hover:none)]:opacity-100">
      <button class="chat-action-btn chat-edit-retry-action gb:message-actions:[font-family:inherit] gb:message-actions:text-[11px] gb:message-actions:gap-[5px] gb:message-actions:grid gb:message-actions:place-items-center gb:message-actions:size-7 gb:message-actions:p-0 gb:message-actions:border gb:message-actions:border-line gb:message-actions:rounded-lg gb:message-actions:bg-surface gb:message-actions:text-secondary gb:message-actions:shadow-sm gb:message-actions:cursor-pointer gb:message-actions:hover:bg-hover gb:message-actions:hover:text-ink gb:message-actions:pointer-coarse:size-11 {MESSAGE_ACTION_FOCUS}" type="button" data-chat-message-action="edit-user-message" data-chat-message-index={view.index} title="Edit and resend (replaces the current response)" aria-label="Edit and resend your latest message"><ChatMessageIcon name="edit"/></button>
    </div>
  {:else}
    <ChatAgentDraftCards cards={view.drafts} index={String(view.index)}/>
    <div class="chat-action-bar gb:message-actions:flex gb:message-actions:flex-wrap gb:message-actions:gap-1 gb:message-actions:mt-2 gb:message-actions:pt-2 gb:message-actions:border-t gb:message-actions:border-line">
      {#if view.retry}<button class={MESSAGE_ACTION_BUTTON} type="button" data-chat-message-action={view.retry.action} data-chat-message-persona-id={view.retry.personaId} title={view.retry.title}><ChatMessageIcon name="refresh"/><span>{view.retry.label}</span></button>{/if}
      {#if view.resume}<button class={MESSAGE_ACTION_BUTTON} type="button" data-chat-message-action="resume-discussion" title="Retry every remaining discussion response"><span>Resume round</span></button>{/if}
      <button class={MESSAGE_ACTION_BUTTON} type="button" data-chat-message-action="copy-message" data-chat-message-index={view.index} id={`chat-copy-btn-${view.index}`} title="Copy to clipboard"><ChatMessageIcon name={copied === 'idle' ? 'copy' : copied === 'copied' ? 'check' : 'x'}/><span>{CHAT_COPY_LABELS[copied]}</span></button>
      {#if view.speech}<ChatSpeechButton index={view.index}/>{/if}
      <button class="{MESSAGE_ACTION_BUTTON} chat-fork-action gb:message-actions:max-[768px]:hidden" type="button" data-chat-message-action="fork-message" data-chat-message-index={view.index} title="Continue from this message in a new chat"><ChatMessageIcon name="fork"/><span>Fork to new chat</span></button>
      <details class="chat-action-more gb:message-actions:hidden gb:message-actions:relative gb:message-actions:text-secondary gb:message-actions:max-[768px]:block">
        <summary onkeydown={dismiss} class="gb:message-actions:grid gb:message-actions:place-items-center gb:message-actions:min-w-8 gb:message-actions:min-h-7 gb:message-actions:px-[7px] gb:message-actions:rounded-sm gb:message-actions:cursor-pointer gb:message-actions:list-none gb:message-actions:[&::-webkit-details-marker]:hidden gb:message-actions:hover:bg-hover gb:message-actions:hover:text-ink gb:message-actions:pointer-coarse:min-h-11 {MESSAGE_ACTION_FOCUS}" title="More message actions" aria-label="More message actions"><span aria-hidden="true">•••</span></summary>
        <div class="chat-action-more-popover gb:message-actions:absolute gb:message-actions:z-20 gb:message-actions:right-0 gb:message-actions:bottom-[calc(100%+5px)] gb:message-actions:min-w-[174px] gb:message-actions:p-1 gb:message-actions:border gb:message-actions:border-line gb:message-actions:rounded-lg gb:message-actions:bg-surface gb:message-actions:shadow-lg gb:message-actions:text-ink"><button type="button" class="{MESSAGE_ACTION_BUTTON} gb:message-actions:w-full gb:message-actions:min-h-[38px] gb:message-actions:py-[7px] gb:message-actions:px-[9px] gb:message-actions:gap-[7px] gb:message-actions:text-xs gb:message-actions:whitespace-nowrap" data-chat-message-action="fork-message" data-chat-message-index={view.index} onkeydown={dismiss}><ChatMessageIcon name="fork"/><span>Fork to new chat</span></button></div>
      </details>
    </div>
    {#if view.context.length}
      <button type="button" class="chat-context-toggle gb:message-actions:block gb:message-actions:border-0 gb:message-actions:bg-transparent gb:message-actions:font-body gb:message-actions:text-left gb:message-actions:text-[11px] gb:message-actions:text-secondary gb:message-actions:cursor-pointer gb:message-actions:py-1 gb:message-actions:px-0 gb:message-actions:mt-1 gb:message-actions:select-none gb:message-actions:hover:text-ink gb:message-actions:pointer-coarse:min-h-11 {MESSAGE_ACTION_FOCUS}" aria-expanded={contextOpen} aria-controls={`chat-ctx-details-${view.index}`} data-chat-message-action="toggle-context-details" data-chat-message-index={view.index}>
        <span class="chat-toggle-arrow gb:message-actions:inline-block gb:message-actions:w-3 gb:message-actions:text-center gb:message-actions:text-[10px]" id={`chat-ctx-arrow-${view.index}`} aria-hidden="true">{contextOpen ? '▾' : '▸'}</span> Context provided ({view.context.length} area{view.context.length !== 1 ? 's' : ''})
      </button>
      <div class="chat-context-details gb:message-actions:flex-wrap gb:message-actions:gap-x-3 gb:message-actions:gap-y-1.5 gb:message-actions:pt-1.5 gb:message-actions:pb-0.5 gb:message-actions:pl-3.5" id={`chat-ctx-details-${view.index}`} style:display={contextOpen ? 'flex' : 'none'}>
        {#each view.context as area}<span class="chat-context-item gb:message-actions:text-[11px] gb:message-actions:text-secondary gb:message-actions:[overflow-wrap:anywhere]">✓ {area.label}{#if area.detail}{' '}({area.detail}){/if}</span>{/each}
      </div>
    {/if}
  {/if}
</div>
