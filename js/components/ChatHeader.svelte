<script lang="ts">
  import { flushSync } from 'svelte';
  import ChatAttestationBadge from './ChatAttestationBadge.svelte';
  import { INITIAL_CHAT_HEADER, type ChatHeaderState } from '../chat-header-contract.js';
  import { ownChatHeader, chatHeaderActions } from '../chat-header-view.js';
  import type { ChatLayoutView } from '../chat-layout-view.js';
  import { HEADER, HEADER_BUTTON, HEADER_ICON, CONTEXT, CONTEXT_ACTIVE, CONTEXT_PENDING, CONTEXT_ERROR } from '../chat-header-classes.js';
  let { layout }: { layout: ChatLayoutView; } = $props();
  let view = $state<ChatHeaderState>({ ...INITIAL_CHAT_HEADER }), open = $state(false);
  let root: HTMLDivElement, menu: HTMLDetailsElement, trigger: HTMLElement;
  function closeMenu(focus = false) { open = false; if (menu) menu.open = false; if (focus) trigger.focus(); }
  function register(element: HTMLElement) { return ownChatHeader(element, next => flushSync(() => { view = { ...view, ...next }; }), () => closeMenu()); }
  function outside(event: MouseEvent) { if (open && event.target instanceof Node && !menu.contains(event.target)) closeMenu(); }
  function key(event: KeyboardEvent) { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); closeMenu(true); } }
  function toggleMenu(event: MouseEvent) { event.preventDefault(); open = !open; menu.open = open; }
</script>
<svelte:document onclick={outside} onkeydowncapture={key}/>
<div bind:this={root} use:register data-chat-header-view class={HEADER}>
  <div class="chat-header-left gb:header:flex gb:header:items-center gb:header:gap-2.5 gb:header:min-w-0 gb:header:flex-1">
    <button type="button" class="chat-rail-toggle {HEADER_BUTTON}" data-chat-action="toggle-thread-rail" title="Conversations" aria-label="Toggle conversations" aria-expanded={layout.railOpen} aria-controls="chat-thread-rail" onclick={()=>chatHeaderActions(root)?.act('rail')}>
      <svg class={HEADER_ICON} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>
    <div class="chat-header-info gb:header:flex gb:header:flex-col gb:header:min-w-0">
      <span class="chat-header-title gb:header:font-display gb:header:text-sm gb:header:font-semibold gb:header:truncate gb:header:theme-neuro:[font-family:var(--font-neuromancer-display)] gb:header:theme-neuro:[font-size-adjust:0.62] gb:header:theme-neuro:font-normal" title={view.titleDescription}>{view.title}</span>
      <span class="chat-header-model gb:header:font-mono gb:header:text-[11px] gb:header:text-secondary gb:header:truncate gb:header:[&[hidden]]:hidden" hidden={!view.model}>{view.model}{#if view.privateMode}<ChatAttestationBadge attestation={view.attestation}/>{/if}</span>
    </div>
  </div>
  <div class="chat-header-actions gb:header:flex gb:header:shrink-0 gb:header:items-center gb:header:gap-1.5 gb:header:max-[768px]:gap-1">
    <label class="chat-websearch-toggle-label gb:header:relative gb:header:flex gb:header:gap-1.5 gb:header:items-center gb:header:min-h-[30px] gb:header:pointer-coarse:min-h-11 gb:header:text-[11px] gb:header:text-secondary gb:header:cursor-pointer gb:header:select-none gb:header:[&[hidden]]:hidden" hidden={!view.webSearchVisible} title="Let AI search the web for current information (Venice &amp; OpenRouter)">
      <span class="chat-toggle-icon gb:header:hidden gb:header:max-[768px]:inline-flex" aria-hidden="true">
        <svg class={HEADER_ICON} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/>
        </svg>
      </span>
      <span class="chat-toggle-text gb:header:max-[768px]:hidden">Web</span>
      <input type="checkbox" class="gb:peer gb:header:sr-only" id="chat-websearch-checkbox" aria-label="Toggle web search" data-chat-change-action="set-websearch" checked={view.webSearchEnabled} onchange={event=>chatHeaderActions(root)?.webSearch(event.currentTarget.checked)}/>
      <span class="chat-toggle-slider gb:header:relative gb:header:w-7 gb:header:h-4 gb:header:rounded-full gb:header:bg-line gb:header:peer-checked:bg-accent gb:header:peer-focus-visible:outline-2 gb:header:peer-focus-visible:outline-accent gb:header:peer-focus-visible:outline-offset-2 gb:header:before:content-[''] gb:header:before:absolute gb:header:before:left-0.5 gb:header:before:top-0.5 gb:header:before:size-3 gb:header:before:rounded-full gb:header:before:bg-secondary-surface gb:header:before:transition-transform gb:header:peer-checked:before:translate-x-3" aria-hidden="true">
      </span>
    </label>
    <span class="sr-only" aria-live="polite" id="chat-context-live-status">{view.context.announcement}</span>
    <button type="button" class="chat-summary-btn {HEADER_BUTTON} gb:header:border gb:header:border-line {view.hasSummary?'has-summary gb:header:text-accent gb:header:border-accent':''}" disabled={!view.canSummarize} data-chat-action="summarize-thread" title={view.summaryLabel} aria-label={view.summaryLabel} onclick={()=>chatHeaderActions(root)?.act('summary')}>
      <svg class={HEADER_ICON} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16M4 9h10M4 14h16M4 19h10"/>
      </svg>
    </button>
    <details class="chat-more-menu gb:header:relative" bind:this={menu} ontoggle={()=>{open=menu.open;}}>
      <summary bind:this={trigger} class="{HEADER_BUTTON} gb:header:list-none gb:header:[&::-webkit-details-marker]:hidden" aria-label="More chat actions" title="More chat actions" aria-expanded={open} onclick={toggleMenu}>
        <span aria-hidden="true">•••</span>
      </summary>
      <div class="chat-more-menu-popover gb:header:absolute gb:header:top-[calc(100%+6px)] gb:header:right-0 gb:header:z-20 gb:header:min-w-[170px] gb:header:p-1.5 gb:header:border gb:header:border-line gb:header:rounded-lg gb:header:bg-select-popup gb:header:shadow-dialog">
        <button type="button" class="chat-clear-btn gb:header:w-full gb:header:rounded-control gb:header:border-0 gb:header:bg-transparent gb:header:text-left gb:header:px-2.5 gb:header:py-[9px] gb:header:font-body gb:header:text-xs gb:header:text-danger-ink gb:header:cursor-pointer gb:header:hover:bg-hover gb:header:focus-visible:outline-2 gb:header:focus-visible:outline-accent gb:header:pointer-coarse:min-h-11" data-chat-action="clear-history" onclick={()=>{closeMenu(true);chatHeaderActions(root)?.act('clear');}}>Clear conversation</button>
      </div>
    </details>
    <button type="button" class="chat-fullscreen-btn {HEADER_BUTTON} gb:header:max-[768px]:hidden" data-chat-action="toggle-fullscreen" aria-label={layout.fullscreen?'Exit fullscreen chat':'Enter fullscreen chat'} title={layout.fullscreen?'Exit fullscreen':'Enter fullscreen'} aria-pressed={layout.fullscreen} onclick={()=>chatHeaderActions(root)?.act('fullscreen')}>
      <svg class={HEADER_ICON} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
    </button>
    <button type="button" class="chat-close-btn {HEADER_BUTTON}" data-chat-action="close-panel" aria-label="Close chat" onclick={()=>chatHeaderActions(root)?.act('close')}>
      <svg class={HEADER_ICON} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18m0-12 12 12"/>
      </svg>
    </button>
  </div>
  <div class="gb:header:basis-full gb:header:min-w-0 gb:header:pl-10 gb:header:pointer-coarse:pl-[54px] gb:header:[&[hidden]]:hidden" hidden={!view.context.label}>
    <button type="button" class="{CONTEXT} {view.context.error?CONTEXT_ERROR:view.context.pending?CONTEXT_PENDING:CONTEXT_ACTIVE}" hidden={!view.context.label} aria-label={view.context.label?`${view.context.label}. ${view.context.description}`:undefined} title={view.context.label?view.context.description:undefined} data-chat-action="open-chat-context" onclick={()=>chatHeaderActions(root)?.act('context')}>
      <span class="chat-context-dot gb:header:size-[7px] gb:header:rounded-full gb:header:shrink-0 {view.context.error?'gb:header:bg-danger':view.context.pending?'gb:header:bg-warning':'gb:header:bg-success'}" aria-hidden="true">
      </span>
      <span class="gb:header:truncate">{view.context.label}</span>
    </button>
  </div>
</div>
