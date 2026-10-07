<script lang="ts">
  import { flushSync } from 'svelte';
  import ChatVoiceButton from './ChatVoiceButton.svelte';
  import ChatVoiceStatus from './ChatVoiceStatus.svelte';
  import { INITIAL_CHAT_CAPTURE, type ChatCaptureView } from '../chat-voice-contract.js';
  import { ownChatCapture } from '../chat-voice-view.js';
  let voice = $state<ChatCaptureView>({ ...INITIAL_CHAT_CAPTURE });
  function registerVoice(element: HTMLElement) { return ownChatCapture(element, next => flushSync(() => { voice = next; })); }
  import ChatAttachmentPreview from './ChatAttachmentPreview.svelte';
  import ChatAttachmentMenu from './ChatAttachmentMenu.svelte';
  import { INITIAL_CHAT_ATTACHMENTS, ownChatAttachments, pasteChatAttachments, type ChatAttachmentView } from '../chat-attachment-view.js';
  let attachments = $state.raw<ChatAttachmentView>({ ...INITIAL_CHAT_ATTACHMENTS });
  let root = $state<HTMLElement>(undefined!);
  function registerAttachments(element: HTMLElement) { return ownChatAttachments(element, next => flushSync(() => { attachments = next; })); }
  import ChatModelPicker from './ChatModelPicker.svelte';
  import { notifyChatComposerInput, registerChatComposerInput } from '../chat-composer-input-port.js';
  import {
    COMPOSER_AREA, COMPOSER_ROW, COMPOSER_INPUT, COMPOSER_TOOLBAR,
    COMPOSER_GROUP, COMPOSER_TOOL_BUTTON, COMPOSER_SEND_BUTTON
  } from '../chat-composer-classes.js';
</script>
<div data-chat-composer-view data-chat-attachment-view data-chat-voice-view bind:this={root} use:registerAttachments use:registerVoice class={COMPOSER_AREA}>
        <ChatAttachmentPreview view={attachments} {root}/>
        <div class={COMPOSER_ROW}>
          <textarea class={COMPOSER_INPUT} id="chat-input" placeholder="Ask about your lab results..." aria-label="Chat message" rows="1" enterkeyhint="send" autocapitalize="sentences" data-chat-key-action="message-input" use:registerChatComposerInput onpaste={event=>pasteChatAttachments(event.currentTarget,event)} oninput={event => notifyChatComposerInput(event.currentTarget)}></textarea>
          <div class={COMPOSER_TOOLBAR}>
            <div class={"chat-composer-tools " + COMPOSER_GROUP} aria-label="Message tools">
              <ChatAttachmentMenu {root} canAttach={attachments.canAttach}/>
            </div>
            <div class={"chat-composer-actions gb:composer:flex-1 gb:composer:min-w-0 gb:composer:justify-end gb:composer:shrink " + COMPOSER_GROUP}>
              <button type="button" class={"chat-discuss-btn " + COMPOSER_TOOL_BUTTON} id="chat-discuss-btn" data-chat-action="start-discussion" style="display:none" aria-label="Start discussion" title="Personas discuss your results">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
              </button>
              <ChatModelPicker />
              <ChatVoiceButton view={voice} {root}/>
              <button type="button" class={COMPOSER_SEND_BUTTON + " gb:composer:[&_svg]:size-[18px]"} id="chat-send-btn" data-chat-action="send-message" aria-label="Send message" title="Send message" disabled>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </button>
            </div>
          </div>
        </div>
        <ChatVoiceStatus view={voice}/>
      </div>
