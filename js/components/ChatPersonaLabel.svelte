<script lang="ts">
  import { PERSONA_LABEL } from '../chat-transcript-classes.js';
  let { text }: { text: string } = $props();
</script>
<div class={PERSONA_LABEL} data-chat-persona-label>{text}</div>
