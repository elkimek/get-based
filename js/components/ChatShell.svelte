<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import { dropChatAttachments } from '../chat-attachment-view.js';
  import { ATTACHMENT_DROP } from '../chat-attachment-classes.js';
  let dropActive = $state(false);
  function dragOver(event: DragEvent) { if (Array.from(event.dataTransfer?.types || []).includes('Files')) { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; flushSync(() => { dropActive = true; }); } }
  function drop(event: DragEvent) { if (event.defaultPrevented) return; event.preventDefault(); event.stopPropagation(); flushSync(() => { dropActive = false; }); if (event.dataTransfer) dropChatAttachments(event.currentTarget as HTMLElement, event.dataTransfer); }
  import ChatHeader from './ChatHeader.svelte';
  import { flushSync } from 'svelte';
  import ChatPersonalityPicker from './ChatPersonalityPicker.svelte';
  import ChatComposer from './ChatComposer.svelte';
  import ChatResizeHandle from './ChatResizeHandle.svelte';
  import { INITIAL_CHAT_LAYOUT, ownChatLayout, requestChatLayoutSync, type ChatLayoutView } from '../chat-layout-view.js';
  let layout = $state<ChatLayoutView>({ ...INITIAL_CHAT_LAYOUT });
  function registerLayout(root: HTMLElement) { return ownChatLayout(root, next => {
    const rail = root.querySelector('#chat-thread-rail');
    const returnFocus = layout.open && layout.railOpen && !next.railOpen && next.open && rail?.contains(document.activeElement);
    flushSync(() => { layout = next; });
    if (returnFocus) root.querySelector<HTMLButtonElement>('.chat-rail-toggle')?.focus();
  }); }
</script>
<!-- Stable service-owned hosts retain their children while the remaining Chat
     features migrate. This component owns the shell's initial structure. -->
<svelte:window onresize={requestChatLayoutSync} />
<div id="chat-shell" data-chat-layout-view style={componentStaticStyles.contents} use:registerLayout>
<div class="chat-backdrop" id="chat-backdrop"></div>
  <button class="chat-fab" id="chat-fab" data-chat-action="toggle-panel" aria-label="Ask AI" title="Ask AI">
    <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  </button>
  <div class="chat-panel" id="chat-panel" role="complementary" aria-label="AI Lab Analyst" aria-hidden="true" inert style:--chat-panel-width={layout.desktop ? `${layout.panelWidth}px` : null}>
    <ChatResizeHandle kind="panel" {layout} />
    <div class="chat-thread-rail" id="chat-thread-rail" inert={!layout.open || !layout.railOpen} style:--chat-rail-width={layout.desktop ? `${layout.railWidth}px` : null}>
      <div class="chat-thread-rail-header">
        <button class="chat-rail-back" data-chat-action="toggle-thread-rail" aria-label="Close conversations">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <span class="chat-thread-rail-title">Conversations</span>
        <button class="chat-thread-new-btn" data-chat-action="create-thread" title="New conversation" aria-label="New conversation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        </button>
      </div>
      <input type="search" class="chat-thread-search" id="chat-thread-search" placeholder="Search conversations..." aria-label="Search conversations and messages" data-chat-input-action="filter-thread-list">
      <div class="chat-thread-toolbar">
        <label class="chat-thread-sort-label" for="chat-thread-sort">Sort</label>
        <select class="chat-thread-sort" id="chat-thread-sort" aria-label="Sort conversations" data-chat-change-action="sort-thread-list">
          <option value="recent">Recent</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </select>
        <button type="button" class="chat-project-new-btn" data-chat-action="create-project" title="Create project" aria-label="Create project">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3z"/><path d="M15 11v5M12.5 13.5h5"/></svg>
        </button>
      </div>
      <!-- The overflowing region remains keyboard-scrollable even when it has
           no conversation buttons. Its accessible region name is preserved. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="chat-thread-list" id="chat-thread-list" role="region" tabindex="0" aria-label="Conversation list"></div>
      <div id="chat-saved-summaries"></div>
    </div>
    <ChatResizeHandle kind="rail" {layout} />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="chat-panel-conversation gb:attachment:[&.chat-drop-active]:outline-2 gb:attachment:[&.chat-drop-active]:outline-dashed gb:attachment:[&.chat-drop-active]:outline-accent gb:attachment:[&.chat-drop-active]:-outline-offset-[5px]" data-chat-attachment-drop class:chat-drop-active={dropActive} ondragover={dragOver} ondragleave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))flushSync(()=>{dropActive=false;});}} ondrop={drop}>
      <ChatHeader {layout} />
      <ChatPersonalityPicker />
      <div class="chat-messages" id="chat-messages" role="log" aria-live="off" aria-busy="false" aria-label="Conversation"></div>
      <span class="sr-only" id="chat-stream-status" role="status" aria-live="polite" aria-atomic="true"></span>
      <div class="chat-scroll-control">
        <button type="button" class="chat-jump-latest" id="chat-jump-latest" aria-label="Jump to latest message" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          <span class="chat-jump-latest-label">Jump to latest</span>
        </button>
      </div>
      <ChatComposer />
      <div class={ATTACHMENT_DROP} id="chat-drop-overlay" aria-hidden="true" hidden={!dropActive}>
        <strong class="gb:attachment:text-base">Drop files here</strong>
        <span class="gb:attachment:max-w-[340px] gb:attachment:text-secondary gb:attachment:text-[13px] gb:attachment:leading-[1.45]">Images attach to your message. Reports and health-data files open import review.</span>
      </div>
    </div>
  </div>
</div>
