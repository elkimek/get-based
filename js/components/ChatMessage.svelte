<script lang="ts">
  import { flushSync } from 'svelte';
  import ChatMessageActions from './ChatMessageActions.svelte';
  import ChatAttestationBadge from './ChatAttestationBadge.svelte';
  import ChatStoredImages from './ChatStoredImages.svelte';
  import ChatCitations from './ChatCitations.svelte';
  import ChatMessageEditor from './ChatMessageEditor.svelte';
  import ChatRecommendations from './ChatRecommendations.svelte';
  import { ownChatMessageEditorHost, type ChatMessageEditorView } from '../chat-message-editor-component.js';
  import { MESSAGE_BUBBLE, NORMAL_BUBBLE, AUTO_BUBBLE, USER_BUBBLE, ASSISTANT_BUBBLE } from '../chat-transcript-classes.js';
  import type { ChatTranscriptMessage } from '../chat-transcript-presentation.js';
  let { view, liveText = null, thinking = false }: { view: ChatTranscriptMessage; liveText?: string | null; thinking?: boolean } = $props();
  let editor = $state<ChatMessageEditorView | null>(null);
  let editorBusy = $state(false);
  function editHost(root: HTMLElement) {
    return ownChatMessageEditorHost(root, next => flushSync(() => { editor = next; editorBusy = false; }), value => flushSync(() => { editorBusy = value; }));
  }
</script>
<div class="chat-msg chat-{view.role === 'user' ? 'user' : 'ai'} chat-avatar-anchor {MESSAGE_BUBBLE} {view.auto ? AUTO_BUBBLE : NORMAL_BUBBLE + ' ' + (view.role === 'user' ? USER_BUBBLE : ASSISTANT_BUBBLE)}"
  class:chat-msg-auto={view.auto} class:chat-avatar-photo={view.avatar.photo} class:chat-avatar-branded={view.avatar.branded}
  id={view.index >= 0 ? `chat-msg-${view.index}` : undefined} role="article" aria-label={view.label}
  data-chat-transcript-message data-chat-avatar-role={view.role} data-chat-avatar-text={view.avatar.text}
  data-chat-streaming={liveText !== null ? 'true' : undefined} style:display={thinking ? 'none' : null}
  style:--chat-avatar-image={view.avatar.image ? `url("${view.avatar.image}")` : null} style:--chat-avatar-image-size={view.avatar.size}
  use:editHost>
  {#if editor}
    <ChatMessageEditor draft={editor.draft} current={editor.current} cancel={editor.cancel} submit={editor.submit} busy={editorBusy}/>
  {:else if liveText !== null}
    <div class="gb:transcript:whitespace-pre-wrap">{liveText}</div>
  {:else}
    {#if view.images}<ChatStoredImages view={view.images}/>{/if}
    {#if view.error !== null}<span class="gb:transcript:text-[var(--red)]">{view.error}</span>{:else}{@html view.body}{/if}
    {#if view.stopped}<div class="chat-stopped-note gb:transcript:mt-1.5 gb:transcript:italic gb:transcript:text-[11px] gb:transcript:text-secondary">[stopped]</div>{/if}
    {#if view.truncated}<div class="chat-stopped-note gb:transcript:mt-1.5 gb:transcript:italic gb:transcript:text-[11px] gb:transcript:text-secondary">[output limit reached - ask "continue" to finish]</div>{/if}
    {#if view.usage}<div class="chat-cost-footnote gb:transcript:mt-1.5 gb:transcript:text-[11px] gb:transcript:text-secondary">{view.usage.text}{#if view.usage.receipt}<ChatAttestationBadge view={view.usage.receipt.badge} footnote/>{/if}</div>{/if}
    {#if view.attribution}<div class="chat-provider-attribution gb:transcript:font-[650] gb:transcript:mt-1.5 gb:transcript:text-[11px] gb:transcript:text-secondary">{view.attribution}</div>{/if}
    {#if view.actions}<ChatMessageActions view={view.actions}/>{/if}
    {#if view.citations}<ChatCitations view={view.citations}/>{/if}
    {#if view.emfHint}<div class="chat-emf-hint gb:transcript:text-xs gb:transcript:text-secondary gb:transcript:mt-2.5 gb:transcript:py-1.5 gb:transcript:px-2.5 gb:transcript:bg-accent-fill gb:transcript:border-l-[3px] gb:transcript:border-accent gb:transcript:rounded-r gb:transcript:leading-normal"><span aria-hidden="true">💡</span> Curious about your EMF environment? <button type="button" class="gb:transcript:border-0 gb:transcript:bg-transparent gb:transcript:p-0 gb:transcript:text-accent gb:transcript:font-medium gb:transcript:cursor-pointer gb:transcript:underline gb:transcript:focus-visible:outline-2 gb:transcript:focus-visible:outline-accent" data-chat-message-action="open-emf-assessment" data-umami-event="emf-nudge-chat">Open the assessment →</button></div>{/if}
    {#if view.recommendations}<ChatRecommendations view={view.recommendations} index={view.index} attention={view.recommendationAttention}/>{/if}
  {/if}
</div>
