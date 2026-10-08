<script lang="ts">
  import { sessionAIClasses as classes } from '../light-session-ai-classes.js';
  let { dot, className = '' }: { dot: string; className?: string } = $props();
</script>
<span class={`${classes(`sun-session-ai-dot sun-session-ai-dot-${dot}`)} ${className}`} aria-hidden="true"></span>
