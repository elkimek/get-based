<script lang="ts">
  import type { ChatCaptureView } from '../chat-voice-contract.js';
  let { view }: { view: ChatCaptureView; } = $props();
</script>
<div id="chat-voice-status" class="chat-voice-status gb:composer:min-h-3.5 gb:composer:font-mono gb:composer:text-[9.5px] gb:composer:leading-[1.4] gb:composer:text-secondary gb:composer:[&.error]:text-danger-ink gb:composer:[&[hidden]]:hidden" class:error={view.mode==='error'} role="status" aria-live="polite" hidden={!view.text}>{view.text}</div>
