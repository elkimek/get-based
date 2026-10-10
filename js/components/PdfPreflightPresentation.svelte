<script lang="ts">
  import type { PdfPreflightView } from '../pdf-preflight-presentation.js';
  import { pdfPreflightClasses as c } from '../pdf-preflight-classes.js';

  let { view }: { view: PdfPreflightView } = $props();
</script><svelte:options preserveWhitespace={true} />{#if view.kind === 'duplicate'}<div class="confirm-dialog" role="alertdialog" aria-modal="true">
      <p class="confirm-message">This file was already imported (<strong>{view.dateLabel}</strong>). Importing again will use tokens and may overwrite existing values.</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
        <button class="confirm-btn confirm-btn-danger" id="confirm-ok">{view.confirmLabel}</button>
      </div></div>{:else if view.kind === 'model'}<div class="confirm-dialog" role="alertdialog" aria-modal="true">
      <p class="confirm-message">Previous imports used <strong>{view.previousModel}</strong>. Using <strong>{view.currentModel}</strong> may cause marker key mismatches and break trend lines.</p>
      <div class={c.modelActions}>
        <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
        <button class={c.warningButton} id="confirm-continue">Continue Anyway</button>
        <button class="confirm-btn confirm-btn-danger" id="confirm-switch">Switch to {view.switchModel}</button>
      </div></div>{:else}<div class={c.unsupportedDialog} role="alertdialog" aria-modal="true">
      <p class={c.unsupportedMessage}>
        <strong>{view.displayType}</strong> reports like this one aren't fully supported yet. Importing will likely miss markers or map them incorrectly, and the AI costs may not be worth it.
      </p>
      <div class={c.unsupportedCopy}>
        In the meantime, you can add your markers manually using the <strong>+</strong> button in the sidebar.
        <p class={c.unsupportedHelp}>If you'd like this lab properly supported — <a href="https://github.com/elkimek/get-based/issues" target="_blank" rel="noopener" class={c.unsupportedLink}>file an issue on GitHub</a>, or ask your lab to reach out.</p>
      </div>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
        <button class={c.warningButton} id="confirm-ok">Import Anyway</button>
      </div></div>{/if}