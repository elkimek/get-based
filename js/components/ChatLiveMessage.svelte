<script lang="ts">
  import ChatMessage from './ChatMessage.svelte';
  import ChatPersonaLabel from './ChatPersonaLabel.svelte';
  import type { ChatTranscriptMessage } from '../chat-transcript-presentation.js';
  let { initial, label }: { initial: ChatTranscriptMessage; label: string | null } = $props();
  let view = $state.raw<ChatTranscriptMessage | null>(null);
  let text = $state<string | null>('');
  let pending = $state(true);
  export function setText(next: string): void { text = next; pending = false; }
  export function complete(next: ChatTranscriptMessage): void { view = next; text = null; pending = false; }
</script>
<div data-chat-live-view class="gb:transcript:contents">
  {#if label}<ChatPersonaLabel text={label}/>{/if}
  <ChatMessage view={view || initial} liveText={text} thinking={pending}/>
</div>
