<script lang="ts">
  import { pdfPreflightClasses as c } from '../pdf-preflight-classes.js';
</script><svelte:options preserveWhitespace={true} />
      <div class={c.imageHeading}>Limited text extracted</div>
      <div class={c.imageCopy}>
        This PDF appears to be scanned or image-heavy. Text extraction found very little content.<br><br>
        <strong>Image mode</strong> sends page screenshots to the AI instead. This skips PII obfuscation — the AI will see the full page images including any personal information.
      </div>
      <div class={c.imageActions}>
        <button class={c.imageNeutralButton}>Cancel</button>
        <button class={c.imageNeutralButton}>Try text anyway</button>
        <button class={c.imagePrimaryButton}>Use image mode</button>
      </div>