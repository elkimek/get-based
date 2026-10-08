<script lang="ts">
  import type { SessionAIView } from '../light-session-ai-presentation.js';
  import { sessionAIClasses as classes, sessionAIIdleDetailButton } from '../light-session-ai-classes.js';
  let { view, label = '↻', cta = false }: { view: SessionAIView; label?: string; cta?: boolean } = $props();
  const icon = $derived(label === '↻');
</script>
<button type="button" class={`${classes(cta ? 'sun-session-ai-cta' : 'sun-session-ai-refresh')}${view.mode === 'detail' && view.status === 'idle' ? ` ${sessionAIIdleDetailButton}` : ''}`} data-ai-action={view.action} data-ai-target={view.targetId} data-ai-owner={view.actionOwner} data-ai-stop-propagation={view.mode === 'inline' ? 'true' : undefined} title={icon ? 'Re-run analysis' : undefined} aria-label={icon ? 'Re-run AI analysis' : undefined}>{label}</button>
