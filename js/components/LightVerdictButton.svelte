<script lang="ts">
  import type { VerdictControlView } from '../light-verdict-control.js';
  import { sessionAIClasses as classes, sessionAIIdleDetailButton } from '../light-session-ai-classes.js';
  let { view, label = '↻', cta = false, className = '', title, ariaLabel, idleDetail, stopPropagation }: {
    view: VerdictControlView;
    label?: string;
    cta?: boolean;
    className?: string;
    title?: string | undefined;
    ariaLabel?: string | undefined;
    idleDetail?: boolean;
    stopPropagation?: boolean;
  } = $props();
  const icon = $derived(label === '↻');
  const idle = $derived(idleDetail ?? (view.mode === 'detail' && view.status === 'idle'));
  const stops = $derived(stopPropagation ?? view.mode === 'inline');
  const buttonClass = $derived(`${classes(cta ? 'sun-session-ai-cta' : 'sun-session-ai-refresh')} ${idle ? sessionAIIdleDetailButton : ''} ${className}`);
</script>

<button type="button" class={buttonClass}
  data-ai-action={view.action} data-ai-target={view.targetIdPresent === true ? view.targetId : view.targetIdPresent === false ? undefined : view.targetId || undefined} data-ai-owner={view.actionOwner}
  data-ai-stop-propagation={stops ? 'true' : undefined}
  title={title ?? (icon ? 'Re-run analysis' : undefined)}
  aria-label={ariaLabel ?? (icon ? 'Re-run AI analysis' : undefined)}>{label}</button>
