<script lang="ts">
  import type {PIIDiffView} from '../pii-review-presentation.js';
  import PIIDiffFragment from './PIIDiffFragment.svelte';
  let {view}: {view: PIIDiffView} = $props();
</script><svelte:options preserveWhitespace={true} />
    <div class="pii-diff-modal" role="dialog" aria-modal="true" aria-label="Privacy Diff">
      <button type="button" class="modal-close" aria-label="Close privacy diff">&times;</button>
      <h3>&#128269; Privacy Diff — Before / After</h3>
      <div class="pii-diff-viewer">
        <div class="pii-diff-left"><div class="pii-diff-header">Original</div><PIIDiffFragment view={{kind: 'panel', panel: view.left, header: false}} /></div>
        <div class="pii-diff-right"><div class="pii-diff-header">Obfuscated</div><PIIDiffFragment view={{kind: 'panel', panel: view.right, header: false}} /></div>
      </div>
      <div class="pii-review-actions pii-review-actions-simple">
        <button type="button" class="import-btn import-btn-secondary" data-pii-diff-close>Close</button>
      </div>
    </div>