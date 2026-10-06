<script lang="ts">
  import type { AiDialogContent, AiDialogActions } from '../ai-action-dialog-contract.js';
  import { AI_DIALOG_PANEL, AI_DIALOG_BUTTON, AI_DIALOG_CHOICE, AI_DIALOG_COPY } from '../ai-action-dialog-classes.js';
  let { content, actions }: { content: AiDialogContent; actions: AiDialogActions } = $props();
  let styleError = $state(false);
  export function setStyleError(failed: boolean): void { styleError = failed; }
</script>
<div class={AI_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={content.ariaLabel} data-ai-action-dialog-view>
  <p class="confirm-message gb:ai-dialog:mt-0 gb:ai-dialog:mb-6 gb:ai-dialog:text-[15px] gb:ai-dialog:leading-relaxed gb:ai-dialog:break-words"><strong>{content.title}</strong></p>
  <p class="{AI_DIALOG_COPY} gb:ai-dialog:mt-0 gb:ai-dialog:mb-3.5">{content.description}</p>
  <div class="gb:ai-dialog:flex gb:ai-dialog:flex-col gb:ai-dialog:gap-2">
    {#each content.options as option (option.id)}
      <button type="button" id={option.id} class="{AI_DIALOG_CHOICE} {option.recommended ? 'gb:ai-dialog:border-accent' : ''}" onclick={() => actions.choose(option.id)}>
        <span class="gb:ai-dialog:w-7 gb:ai-dialog:shrink-0 gb:ai-dialog:text-center gb:ai-dialog:text-[22px]" aria-hidden="true">{option.icon}</span>
        <span class="gb:ai-dialog:flex gb:ai-dialog:min-w-0 gb:ai-dialog:flex-1 gb:ai-dialog:flex-col gb:ai-dialog:gap-0.5 gb:ai-dialog:break-words">
          <strong class="gb:ai-dialog:text-[13.5px] gb:ai-dialog:font-semibold">{option.label}</strong>
          <span class="gb:ai-dialog:text-xs gb:ai-dialog:leading-relaxed gb:ai-dialog:text-secondary">{option.description}{#if option.recommendation}{' '}<em class="gb:ai-dialog:font-medium gb:ai-dialog:not-italic gb:ai-dialog:text-ink">{option.recommendation}</em>{/if}</span>
        </span>
        <span class="gb:ai-dialog:shrink-0 gb:ai-dialog:text-base gb:ai-dialog:text-secondary" aria-hidden="true">→</span>
      </button>
    {/each}
  </div>
  {#if styleError}
    <p role="status" class="{AI_DIALOG_COPY} gb:ai-dialog:my-3">The dialog styles could not load. Your choices still work.</p>
    <button type="button" class={AI_DIALOG_BUTTON} data-ai-dialog-retry-styles onclick={() => actions.retryStyles()}>Retry styles</button>
  {/if}
  <div class="gb:ai-dialog:mt-3.5 gb:ai-dialog:flex gb:ai-dialog:justify-end">
    <button type="button" class="confirm-btn confirm-btn-cancel {AI_DIALOG_BUTTON}" id={content.cancelId} onclick={() => actions.close()}>Not now</button>
  </div>
</div>
