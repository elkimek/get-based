<script lang="ts">
  import type { SyncRotationView } from '../sync-diagnose-presentation.js';
  let { view }: { view: SyncRotationView } = $props();
</script><svelte:options preserveWhitespace={true} /><div
        class="modal gb:sync-rotation-modal"
        role="dialog"
        aria-label="Rotate sync identity">
    <div
        class="modal-header"><h3>Rotate sync identity — save your new mnemonic</h3><button
        class="modal-close"
        aria-label="Close">×</button></div>
    <div
        class="modal-body gb:sync-rotation-body">
      <div
        class="gb:sync-rotation-warning">
        <div
        class="gb:sync-rotation-warning-title">⚠ Save this BEFORE you click Apply</div>
        <div
        class="gb:sync-rotation-warning-copy">Losing this 24-word mnemonic means losing your new cross-device sync identity — there is no recovery path. Save it in a password manager AND enter it on every device that should keep syncing.</div>
      </div>
      <div
        class="gb:sync-rotation-layout">
        {#if view.qr}<div
        class="gb:sync-rotation-qr">{@html view.qr}</div>{/if}
        <div
        class="gb:sync-rotation-words-column">
          <div
        class="gb:sync-rotation-instructions">{view.qr ? 'Scan from another device, or copy the words below.' : 'Copy the words below — QR code unavailable on this build.'}</div>
          <div id="rotate-words"
        class="gb:sync-rotation-words">{#each view.words as word, index}{index > 0 ? ' ' : ''}<span
        class="gb:sync-rotation-word"><span
        class="gb:sync-rotation-word-number">{word.number}.</span>{word.word}</span>{/each}</div>
          <button
        class="import-btn import-btn-secondary gb:sync-rotation-copy" id="rotate-copy-btn">Copy mnemonic</button>
        </div>
      </div>
      <label
        class="gb:sync-rotation-saved">
        <input type="checkbox" id="rotate-saved-check"/>
        <span>I've saved this mnemonic in a safe place (password manager or written down).</span>
      </label>
      <div
        class="gb:sync-rotation-actions">
        <button
        class="import-btn import-btn-secondary" id="rotate-cancel-btn">Cancel</button>
        <button
        class="import-btn import-btn-primary" id="rotate-apply-btn" disabled>Apply on this device</button>
      </div>
    </div>
  </div>