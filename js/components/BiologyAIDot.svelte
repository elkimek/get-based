<script lang="ts">
  import {biologyAIClasses as classes} from '../biology-ai-classes.js';
  let {processing = false, color = 'var(--text-muted)'}: {processing?: boolean; color?: string} = $props();
</script>
<span class={classes(`biology-score-ai-dot${processing ? ' ctx-health-dot-shimmer' : ''}`)} style:background={processing ? undefined : color} aria-hidden="true"></span>
