<script lang="ts">
  import type {PIIReviewView} from '../pii-review-presentation.js';
  import PIIDiffFragment from './PIIDiffFragment.svelte';
  let {view}: {view: PIIReviewView} = $props();
</script><svelte:options preserveWhitespace={true} />
      <div class="pii-diff-modal pii-review-modal" role="dialog" aria-modal="true" aria-label="PII Review">
        <div class="gb-modal-head pii-review-head">
          <div>
            <div class="gb-modal-kicker">Privacy review</div>
            <div class="gb-modal-title">Review &amp; Edit</div>
          </div>
        </div>
        <p class="pii-review-intro">Personal information has been replaced with fake data before the analysis model sees the report. Review the text that will be sent and edit anything that still looks identifying.</p>
        <div class="pii-search-bar">
          <input type="text" class="pii-search-input" id="pii-search-input" placeholder="Search for your name, address, phone…" autocomplete="off">
          <span class="pii-search-count" id="pii-search-count"></span>
        </div>
        <details class="pii-mobile-original">
          <summary>Original report (comparison only)</summary>
          <div class="pii-mobile-original-body"><PIIDiffFragment view={{kind: 'panel', panel: view.left, header: false}} /></div>
        </details>
        <div class="pii-diff-viewer pii-review-viewer">
          <div class="pii-diff-left"><div class="pii-diff-header">Original report (comparison only)</div><PIIDiffFragment view={{kind: 'panel', panel: view.left, header: false}} /></div>
          <div class="pii-diff-right">
            <div class="pii-diff-header">Sent to analysis AI <button class="pii-edit-btn" id="pii-edit-btn" type="button">&#9998; Edit</button></div>
            {#if view.streaming}<details class="pii-thinking-section" id="pii-thinking-section" hidden><summary>Thinking…</summary><pre class="pii-thinking-content" id="pii-thinking-content"></pre></details>{/if}
            <textarea class="pii-edit-textarea" id="pii-edit-textarea" spellcheck="false" readonly={view.streaming} value={view.initial}></textarea>
            {#if view.streaming}<div class="pii-stream-status pii-stream-waiting" id="pii-stream-status">Waiting for model response…</div>{/if}
          </div>
        </div>
        <div class="pii-review-actions">
          <button type="button" class="import-btn import-btn-secondary" id="pii-review-regex" title="Run regex-based obfuscation instead">Use regex instead</button>
          {#if view.streaming}<button type="button" class="import-btn import-btn-secondary" id="pii-stream-stop">Stop</button>{/if}
          {#if view.streaming}<button type="button" class="import-btn import-btn-secondary" id="pii-stream-retry" hidden>Retry</button>{/if}
          <span class="pii-action-spacer"></span>
          <button type="button" class="import-btn import-btn-secondary" id="pii-review-cancel">Cancel Import</button>
          <button type="button" class="import-btn import-btn-primary" id="pii-review-send" disabled={view.streaming}>Send to AI</button>
        </div>
      </div>