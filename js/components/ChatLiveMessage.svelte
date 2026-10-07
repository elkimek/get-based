<script lang="ts">
  import ChatMessage from './ChatMessage.svelte';
  import { PERSONA_LABEL } from '../chat-transcript-classes.js';
  import type { ChatTranscriptMessage } from '../chat-transcript-presentation.js';
  let { initial, label }: { initial: ChatTranscriptMessage; label: string | null } = $props();
  let view = $state.raw<ChatTranscriptMessage | null>(null);
  let text = $state<string | null>('');
  let pending = $state(true);
  export function setText(next: string): void { text = next; pending = false; }
  export function complete(next: ChatTranscriptMessage): void { view = next; text = null; pending = false; }
</script>
<div data-chat-live-view class="gb:transcript:contents">
  {#if label}<div class={PERSONA_LABEL}>{label}</div>{/if}
  <ChatMessage view={view || initial} liveText={text} thinking={pending}/>
</div>
