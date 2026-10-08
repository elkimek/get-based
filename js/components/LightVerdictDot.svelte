<script lang="ts">
  import { sessionAIClasses as classes } from '../light-session-ai-classes.js';
  let { dot }: { dot: string } = $props();
</script>
<span class={classes(`sun-session-ai-dot sun-session-ai-dot-${dot}`)} aria-hidden="true"></span>
