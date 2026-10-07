<script lang="ts">
  import { THINKING_ROOT, THINKING_DOT } from '../chat-message-content-classes.js';
  let text = $state('');
  export function setPhrase(next: string): void { text = next; }
</script>
<div class={THINKING_ROOT} data-chat-message-content aria-hidden="true">
  <span class="chat-thinking-text gb:message-content:min-w-0 gb:message-content:[overflow-wrap:anywhere]">{text}</span>
  <span class="chat-thinking-dots gb:message-content:inline-flex gb:message-content:gap-[3px] gb:message-content:items-center gb:message-content:shrink-0" aria-hidden="true">
    <i class={THINKING_DOT}></i><i class="{THINKING_DOT} gb:message-content:[animation-delay:0.2s]"></i><i class="{THINKING_DOT} gb:message-content:[animation-delay:0.4s]"></i>
  </span>
</div>
