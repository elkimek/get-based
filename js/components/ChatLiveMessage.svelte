<script lang="ts">
  import type { ChatToolActivity as Activity } from '../../shared/chat-tool-activity.js';
  import ChatMessage from './ChatMessage.svelte';
  import ChatPersonaLabel from './ChatPersonaLabel.svelte';
  import type { ChatTranscriptMessage } from '../chat-transcript-presentation.js';
  let { initial, label }: { initial: ChatTranscriptMessage; label: string | null } = $props();
  let view = $state.raw<ChatTranscriptMessage | null>(null);
  let text = $state<string | null>('');
  let activity = $state.raw<Activity[]>([]);
  export function setToolActivity(next: Activity[]): void { activity = next; }
  export function setText(next: string): void { text = next; }
  export function complete(next: ChatTranscriptMessage): void { view = next; text = null; }
</script>
<div data-chat-live-view class="gb:transcript:contents">
  {#if label}<ChatPersonaLabel text={label}/>{/if}
  <ChatMessage view={view || initial} liveText={text} activity={view ? [] : activity}/>
</div>
