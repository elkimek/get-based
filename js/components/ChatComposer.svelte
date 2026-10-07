<script lang="ts">
  import ChatModelPicker from './ChatModelPicker.svelte';
  import { notifyChatComposerInput, registerChatComposerInput } from '../chat-composer-input-port.js';
  import { COMPOSER_AREA, COMPOSER_ROW, COMPOSER_INPUT, COMPOSER_TOOLBAR,
    COMPOSER_GROUP, COMPOSER_TOOL_BUTTON, COMPOSER_SEND_BUTTON } from '../chat-composer-classes.js';
</script>
<div data-chat-composer-view class={COMPOSER_AREA}>
        <div class="chat-attach-preview" id="chat-attach-preview"></div>
        <div class={COMPOSER_ROW}>
          <textarea class={COMPOSER_INPUT} id="chat-input" placeholder="Ask about your lab results..." aria-label="Chat message" rows="1" enterkeyhint="send" autocapitalize="sentences" data-chat-key-action="message-input" use:registerChatComposerInput oninput={event => notifyChatComposerInput(event.currentTarget)}></textarea>
          <div class={COMPOSER_TOOLBAR}>
            <div class={"chat-composer-tools " + COMPOSER_GROUP} aria-label="Message tools">
              <details class="chat-context-menu" id="chat-context-menu">
                <summary class={"chat-context-menu-toggle " + COMPOSER_TOOL_BUTTON} id="chat-attach-btn" aria-label="Add to message" title="Add to message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></summary>
                <div class="chat-context-menu-popover" role="menu" aria-label="Add to message">
                  <button type="button" id="chat-add-photo-action" data-chat-action="attach-image" role="menuitem">
                    <span class="chat-context-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg></span>
                    <span><strong>Add photos</strong></span>
                  </button>
                  <button type="button" data-chat-action="import-health-file" role="menuitem">
                    <span class="chat-context-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg></span>
                    <span><strong>Import health file</strong><small>PDF, spreadsheet, JSON, or export</small></span>
                  </button>
                  <button type="button" data-chat-action="open-chat-context" role="menuitem">
                    <span class="chat-context-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/><circle cx="8" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></span>
                    <span><strong>Manage AI context</strong><small>Choose which profile data can be used</small></span>
                  </button>
                </div>
              </details>
            </div>
            <div class={"chat-composer-actions gb:composer:flex-1 gb:composer:min-w-0 gb:composer:justify-end gb:composer:shrink " + COMPOSER_GROUP}>
              <button type="button" class={"chat-discuss-btn " + COMPOSER_TOOL_BUTTON} id="chat-discuss-btn" data-chat-action="start-discussion" style="display:none" aria-label="Start discussion" title="Personas discuss your results">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
              </button>
              <ChatModelPicker />
              <button type="button" class={"chat-voice-btn " + COMPOSER_TOOL_BUTTON} id="chat-voice-btn" data-chat-action="toggle-voice-recording" aria-label="Speak message" aria-pressed="false" title="Speak message">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/></svg>
              </button>
              <button type="button" class={COMPOSER_SEND_BUTTON + " gb:composer:[&_svg]:size-[18px]"} id="chat-send-btn" data-chat-action="send-message" aria-label="Send message" title="Send message" disabled>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="chat-voice-status" id="chat-voice-status" role="status" aria-live="polite" hidden></div>
      </div>
      <div class="chat-drop-overlay" id="chat-drop-overlay" aria-hidden="true" hidden>
        <strong>Drop files here</strong>
        <span>Images attach to your message. Reports and health-data files open import review.</span>
      </div>
      <input type="file" id="chat-image-input" aria-label="Attach photos" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display:none">
      <input type="file" id="chat-file-input" aria-label="Choose a chat attachment or health file" accept=".pdf,.json,.cluedata,.txt,.csv,.xlsx,.xml,.zip,.jpg,.jpeg,.png,.gif,.webp,application/xml,text/xml,application/zip,image/jpeg,image/png,image/gif,image/webp" multiple style="display:none">
