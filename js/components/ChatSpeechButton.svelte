<script lang="ts">
  import { flushSync } from 'svelte';
  import { ownChatSpeech, runOwnedChatSpeech } from '../chat-speech-view.js';
  import { speechControl, type ChatSpeechMode } from '../chat-voice-contract.js';
  let { index, mode = 'idle', act }: { index: number; mode?: ChatSpeechMode; act?: () => void; } = $props();
  let control = $derived(speechControl(mode));
  export function setMode(next: ChatSpeechMode): void { mode = next; }
  function own(button: HTMLButtonElement) { return ownChatSpeech(button, index, next => flushSync(() => { mode = next; }), act); }
</script>
<button type="button" id={`chat-listen-btn-${index}`} data-chat-speech-view data-chat-message-action="toggle-message-speech" data-chat-message-index={index} use:own
  class="chat-action-btn chat-listen-btn gb:speech:inline-flex gb:speech:items-center gb:speech:gap-[5px] gb:speech:border-0 gb:speech:bg-transparent gb:speech:text-secondary gb:speech:font-body gb:speech:text-[11px] gb:speech:cursor-pointer gb:speech:py-[3px] gb:speech:px-2 gb:speech:rounded-[var(--radius-sm)] gb:speech:transition-colors gb:speech:hover:text-ink gb:speech:hover:bg-hover gb:speech:focus-visible:outline-2 gb:speech:focus-visible:outline-accent gb:speech:focus-visible:outline-offset-2 gb:speech:pointer-coarse:min-h-11 gb:speech:pointer-coarse:py-2 gb:speech:pointer-coarse:px-2.5 gb:speech:[&.speaking]:text-ink gb:speech:[&.speaking]:bg-[var(--accent-fill)] gb:speech:[&.busy]:opacity-[.72] gb:speech:[&.busy]:text-ink gb:speech:[&_svg]:size-[13px] gb:speech:[&_svg]:fill-none gb:speech:[&_svg]:stroke-current gb:speech:[&_svg]:stroke-2 gb:speech:[&_svg]:[stroke-linecap:round] gb:speech:[&_svg]:[stroke-linejoin:round] gb:speech:[&_svg]:shrink-0 gb:speech:[&.busy>svg]:motion-safe:animate-spin"
  class:speaking={mode==='speaking'} class:busy={control.busy} aria-label={control.label} aria-pressed={control.pressed} title={control.title} onclick={event=>{event.stopPropagation();runOwnedChatSpeech(event.currentTarget,index);}}>
  {#if mode==='speaking'}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
  {:else if control.busy}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
  {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>{/if}<span>{control.text}</span>
</button>
