<script lang="ts">
  import ChatComposer from './ChatComposer.svelte';
</script>
<!-- Stable service-owned hosts retain their children while the remaining Chat
     features migrate. This component owns the shell's initial structure. -->
<div id="chat-shell" style="display:contents">
<div class="chat-backdrop" id="chat-backdrop"></div>
  <button class="chat-fab" id="chat-fab" data-chat-action="toggle-panel" aria-label="Ask AI" title="Ask AI">
    <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  </button>
  <div class="chat-panel" id="chat-panel" role="complementary" aria-label="AI Lab Analyst" aria-hidden="true" inert>
    <!-- A focusable separator is the keyboard-operated window splitter;
         Svelte classifies all separators as noninteractive. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="chat-panel-resize-handle" id="chat-panel-resize-handle" role="separator" aria-label="Resize chat" aria-orientation="vertical" aria-valuemin="420" aria-valuemax="1100" tabindex="0"></div>
    <div class="chat-thread-rail" id="chat-thread-rail">
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
    <!-- Keyboard-operated window splitter, as above. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="chat-rail-resize-handle" id="chat-rail-resize-handle" role="separator" aria-label="Resize conversation sidebar" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="360" tabindex="0"></div>
    <div class="chat-panel-conversation">
      <div class="chat-header">
        <div class="chat-header-left">
          <button class="chat-rail-toggle" data-chat-action="toggle-thread-rail" title="Conversations" aria-label="Toggle conversations" aria-expanded="false" aria-controls="chat-thread-rail">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
          </button>
          <div class="chat-header-info">
            <span class="chat-header-title">AI Lab Analyst</span>
            <span class="chat-header-model"></span>
          </div>
        </div>
        <div class="chat-header-actions">
          <label class="chat-websearch-toggle-label" title="Let AI search the web for current information (Venice &amp; OpenRouter)" style="display:none">
            <span class="chat-toggle-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/></svg></span>
            <span class="chat-toggle-text">Web</span>
            <input type="checkbox" id="chat-websearch-checkbox" aria-label="Toggle web search" data-chat-change-action="set-websearch">
            <span class="chat-toggle-slider"></span>
          </label>
          <span class="sr-only" aria-live="polite" id="chat-context-live-status"></span>
          <button class="chat-summary-btn" data-chat-action="summarize-thread" title="Summarize this conversation" aria-label="Summarize this conversation"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16"/><path d="M4 9h10"/><path d="M4 14h16"/><path d="M4 19h10"/></svg></button>
          <details class="chat-more-menu">
            <summary aria-label="More chat actions" title="More chat actions"><span aria-hidden="true">•••</span></summary>
            <div class="chat-more-menu-popover">
              <button class="chat-clear-btn" data-chat-action="clear-history">Clear conversation</button>
            </div>
          </details>
          <button class="chat-fullscreen-btn" data-chat-action="toggle-fullscreen" aria-label="Enter fullscreen chat" title="Enter fullscreen" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
          </button>
          <button class="chat-close-btn" data-chat-action="close-panel" aria-label="Close chat">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="chat-personality-bar">
        <button type="button" class="chat-personality-current" aria-expanded="false" aria-controls="chat-personality-options" data-chat-action="toggle-personality">
          <span class="chat-personality-current-icon">&#128300;</span>
          <span class="chat-personality-current-name">AI Lab Analyst</span>
          <span class="chat-personality-current-arrow">&#9662;</span>
        </button>
        <div class="chat-personality-options" id="chat-personality-options" role="group" aria-label="Chat personality">
          <button class="chat-personality-opt active" data-personality="default" data-chat-action="set-personality">
            <span class="chat-personality-opt-icon">&#128300;</span>
            <div class="chat-personality-opt-info">
              <span class="chat-personality-opt-name">AI Lab Analyst</span>
              <span class="chat-personality-opt-desc">Neutral, professional analysis</span>
            </div>
            <span class="chat-personality-opt-check">&#10003;</span>
          </button>
          <div class="chat-personality-divider">Fictional Characters</div>
          <button class="chat-personality-opt" data-personality="house" data-chat-action="set-personality">
            <span class="chat-personality-opt-icon">&#129455;</span>
            <div class="chat-personality-opt-info">
              <span class="chat-personality-opt-name">Dr. Gregory House</span>
              <span class="chat-personality-opt-desc">Sarcastic, brilliant, blunt</span>
            </div>
            <span class="chat-personality-opt-check">&#10003;</span>
          </button>
          <div id="chat-personality-custom-section"></div>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages" role="log" aria-live="off" aria-busy="false" aria-label="Conversation"></div>
      <span class="sr-only" id="chat-stream-status" role="status" aria-live="polite" aria-atomic="true"></span>
      <div class="chat-scroll-control">
        <button type="button" class="chat-jump-latest" id="chat-jump-latest" aria-label="Jump to latest message" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          <span class="chat-jump-latest-label">Jump to latest</span>
        </button>
      </div>
      <ChatComposer />
    </div>
  </div>
</div>
