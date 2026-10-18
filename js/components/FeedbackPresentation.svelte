<script lang="ts">
  import { feedbackClasses as c } from '../feedback-classes.js';
</script><svelte:options preserveWhitespace={true} />
    <div class={c('gb-modal-head feedback-modal-head', 'head')}>
      <div><div class="gb-modal-kicker">GitHub issue</div><div class="gb-modal-title">Send Feedback</div></div>
      <button type="button" class="modal-close" aria-label="Close" data-feedback-action="close">&times;</button>
    </div>
    <div class={c('gb-form-body feedback-form-body', 'body')}>
      <form class={c('feedback-form', 'form')} data-feedback-action="submit">
        <div class={c('feedback-field', 'field')}>
          <label class={c('feedback-label', 'label')} for="feedback-type">Type</label>
          <select class="kb-field-control" id="feedback-type" data-feedback-action="placeholder">
            <option value="bug">Bug Report</option>
            <option value="feature">Feature Request</option>
            <option value="idea">Idea / Suggestion</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class={c('feedback-field', 'field')}>
          <label class={c('feedback-label', 'label')} for="feedback-title">Title</label>
          <input class="kb-field-control" id="feedback-title" maxlength="160" required>
        </div>
        <div class={c('feedback-field', 'field')}>
          <label class={c('feedback-label', 'label')} for="feedback-desc">Description</label>
          <textarea class={c('kb-field-control feedback-textarea', 'textarea')} id="feedback-desc" maxlength="10000" required></textarea>
        </div>
        <p class={c('feedback-notice', 'notice')}>Public GitHub issue; account required. Keep health data and secrets out of text and screenshots. Includes app/browser settings, never automatic profile or lab attachments.</p>
        <div id="feedback-result" class={c('feedback-field', 'field')} hidden>
          <p class={c('feedback-notice', 'notice')} role="status"><span id="feedback-status"></span> <!-- svelte-ignore a11y_missing_attribute (The unchanged controller sets href only after preparing a report.) --><a target="_blank" rel="noopener noreferrer">Continue on GitHub ↗</a>. Submit there to send it.</p>
          <details>
            <summary class={c('', 'summary')}>View or copy full report</summary>
            <label class={c('feedback-label', 'label')} for="feedback-draft">Report preview</label>
            <textarea id="feedback-draft" class={c('kb-field-control feedback-textarea', 'preview')} readonly></textarea>
            <button type="button" class={c('import-btn import-btn-secondary', 'button')} data-feedback-action="copy">Copy report</button>
          </details>
        </div>
        <div class={c('feedback-actions', 'actions')}>
          <button type="button" class={c('import-btn import-btn-secondary', 'button')} data-feedback-action="close">Close</button>
          <button type="submit" class={c('import-btn import-btn-primary', 'button')}>Open GitHub draft</button>
        </div>
      </form>
    </div>
  <!-- Source terminator preserves native terminal indentation. -->