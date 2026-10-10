<script lang="ts">
  import type { UtilsConfirmView } from '../utils-dialog-presentation.js';
  import { utilsDialogClasses as c } from '../utils-dialog-classes.js';
  let { view }: { view: UtilsConfirmView } = $props();
</script><svelte:options preserveWhitespace={true} /><div class={c('confirm-dialog', 'panel')} role="alertdialog" aria-modal="true" aria-label={view.ariaLabel}>
    <p class={c('confirm-message', 'message')}>{view.message}</p>
    <div class={c('confirm-actions', 'actions')}>
      <button class={c('confirm-btn confirm-btn-cancel', 'cancel')} id="confirm-cancel">{view.cancelLabel}</button>
      <button class={c('confirm-btn confirm-btn-' + view.tone, view.tone)} id="confirm-ok">{view.confirmLabel}</button>
    </div></div>