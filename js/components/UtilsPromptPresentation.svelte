<script lang="ts">
  import type { UtilsPromptView } from '../utils-dialog-presentation.js';
  import { utilsDialogClasses as c } from '../utils-dialog-classes.js';
  let { view }: { view: UtilsPromptView } = $props();
</script><svelte:options preserveWhitespace={true} /><div class={c('confirm-dialog', 'panel')} role="dialog" aria-modal="true" aria-label="Prompt">
      <p class={c('confirm-message', 'message')}>{view.message}</p>
      <input type={view.inputType} id="prompt-dialog-input" class={c('confirm-input', 'input')}
             value={view.defaultValue}
             placeholder={view.placeholder}
             aria-label={view.inputAriaLabel}>
      <div class={c('confirm-actions', 'actions')}>
        <button class={c('confirm-btn confirm-btn-cancel', 'cancel')} id="prompt-cancel">{view.cancelLabel}</button>
        <button class={c('confirm-btn confirm-btn-primary', 'primary')} id="prompt-ok">{view.okLabel}</button>
      </div></div>