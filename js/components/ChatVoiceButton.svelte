<script lang="ts">
  import { captureControl, type ChatCaptureView } from '../chat-voice-contract.js';
  import { toggleOwnedChatVoice } from '../chat-voice-view.js';
  import { COMPOSER_TOOL_BUTTON } from '../chat-composer-classes.js';
  let { view, root }: { view: ChatCaptureView; root: HTMLElement; } = $props();
  let control = $derived(captureControl(view));
</script>
<button type="button" id="chat-voice-btn" data-chat-action="toggle-voice-recording" data-chat-owned-voice
  class="chat-voice-btn {COMPOSER_TOOL_BUTTON} gb:composer:disabled:opacity-50 gb:composer:disabled:cursor-not-allowed gb:composer:[&.recording]:border-danger gb:composer:[&.recording]:text-danger-ink gb:composer:[&.recording]:bg-[color-mix(in_srgb,var(--red)_14%,var(--bg-card))] gb:composer:[&.recording]:motion-safe:animate-pulse gb:composer:[&.busy]:opacity-70"
  class:recording={control.recording} class:busy={control.busy} disabled={control.disabled}
  aria-label={control.label} aria-pressed={control.recording} title={control.title} onclick={()=>toggleOwnedChatVoice(root)}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/></svg>
</button>
