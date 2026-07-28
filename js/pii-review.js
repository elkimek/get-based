// @ts-check
// pii-review.js — PII diff rendering and review-modal interaction.

import { escapeHTML, showNotification } from './utils.js';
import {
  isDataProtectionStylesheetLoaded,
  loadDataProtectionStylesheetForAction,
  openModalOverlay,
  removeModalOverlay,
  trapModalFocus,
} from './modal-lifecycle.js';

/**
 * @typedef {{
 *   obfuscatePDFText: (text: string) => { obfuscated: string, original: string, replacements: number },
 *   unloadOllamaPIIModel: () => void,
 * }} PIIReviewDeps
 */

/** @typedef {(onChunk: (chunk: string) => void, signal: AbortSignal, onThinking: (chunk: string) => void) => Promise<any>} PIIStreamFunction */

function wordDiff(originalLine, replacementLine) {
  const tokenize = value => value.match(/\S+|\s+/g) || [];
  const originalTokens = tokenize(originalLine);
  const replacementTokens = tokenize(replacementLine);
  const originalLength = originalTokens.length;
  const replacementLength = replacementTokens.length;
  if (originalLength === 0 && replacementLength === 0) {
    return { left: '&nbsp;', right: '&nbsp;' };
  }
  if (originalLength > 200 || replacementLength > 200) {
    return {
      left: `<span class="pii-word-removed">${escapeHTML(originalLine)}</span>`,
      right: `<span class="pii-word-added">${escapeHTML(replacementLine)}</span>`,
    };
  }

  const matches = Array.from(
    { length: originalLength + 1 },
    () => new Uint16Array(replacementLength + 1),
  );
  for (let originalIndex = 1; originalIndex <= originalLength; originalIndex++) {
    for (let replacementIndex = 1; replacementIndex <= replacementLength; replacementIndex++) {
      matches[originalIndex][replacementIndex] = originalTokens[originalIndex - 1]
        === replacementTokens[replacementIndex - 1]
        ? matches[originalIndex - 1][replacementIndex - 1] + 1
        : Math.max(
          matches[originalIndex - 1][replacementIndex],
          matches[originalIndex][replacementIndex - 1],
        );
    }
  }

  const operations = [];
  let originalIndex = originalLength;
  let replacementIndex = replacementLength;
  while (originalIndex > 0 || replacementIndex > 0) {
    if (originalIndex > 0 && replacementIndex > 0
        && originalTokens[originalIndex - 1] === replacementTokens[replacementIndex - 1]) {
      operations.push({
        type: 'equal',
        original: originalTokens[--originalIndex],
        replacement: replacementTokens[--replacementIndex],
      });
    } else if (replacementIndex > 0
        && (originalIndex === 0
          || matches[originalIndex][replacementIndex - 1]
            >= matches[originalIndex - 1][replacementIndex])) {
      operations.push({ type: 'add', replacement: replacementTokens[--replacementIndex] });
    } else {
      operations.push({ type: 'delete', original: originalTokens[--originalIndex] });
    }
  }
  operations.reverse();

  let left = '';
  let right = '';
  for (const operation of operations) {
    if (operation.type === 'equal') {
      left += escapeHTML(operation.original);
      right += escapeHTML(operation.replacement);
    } else if (operation.type === 'delete') {
      left += `<span class="pii-word-removed">${escapeHTML(operation.original)}</span>`;
    } else {
      right += `<span class="pii-word-added">${escapeHTML(operation.replacement)}</span>`;
    }
  }
  return { left: left || '&nbsp;', right: right || '&nbsp;' };
}

export function buildPIIDiffHTML(originalText, obfuscatedText) {
  const trimBlankLines = value => value.replace(/^\n+/, '').replace(/\n+$/, '');
  const originalLines = trimBlankLines(originalText).split('\n');
  const obfuscatedLines = trimBlankLines(obfuscatedText).split('\n');
  const maxLines = Math.max(originalLines.length, obfuscatedLines.length);
  let leftHtml = '';
  let rightHtml = '';
  for (let index = 0; index < maxLines; index++) {
    const originalLine = originalLines[index] || '';
    const obfuscatedLine = obfuscatedLines[index] || '';
    if (originalLine === obfuscatedLine) {
      leftHtml += `<div>${escapeHTML(originalLine) || '&nbsp;'}</div>`;
      rightHtml += `<div>${escapeHTML(obfuscatedLine) || '&nbsp;'}</div>`;
    } else {
      const { left, right } = wordDiff(originalLine, obfuscatedLine);
      leftHtml += `<div class="pii-diff-highlight-removed">${left}</div>`;
      rightHtml += `<div class="pii-diff-highlight-added">${right}</div>`;
    }
  }
  return { leftHtml, rightHtml };
}

function openPIIOverlay(overlay, options = {}) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    openModalOverlay(overlay, options);
    try {
      trapModalFocus(overlay, { closeOnEscape: false });
    } catch (_) {}
  });
}

function closePIIOverlay(overlay) {
  removeModalOverlay(overlay);
}

export function showPIIDiffViewer(originalText, obfuscatedText) {
  if (!isDataProtectionStylesheetLoaded()) {
    return loadDataProtectionStylesheetForAction().then(loaded => {
      if (loaded) return showPIIDiffViewer(originalText, obfuscatedText);
      showNotification('Privacy review could not be loaded. Try again.', 'error');
      return false;
    });
  }
  const overlay = document.createElement('div');
  overlay.className = 'pii-warning-overlay';
  const { leftHtml, rightHtml } = buildPIIDiffHTML(originalText, obfuscatedText);
  overlay.innerHTML = `
    <div class="pii-diff-modal" role="dialog" aria-modal="true" aria-label="Privacy Diff">
      <button type="button" class="modal-close" aria-label="Close privacy diff">&times;</button>
      <h3>&#128269; Privacy Diff — Before / After</h3>
      <div class="pii-diff-viewer">
        <div class="pii-diff-left"><div class="pii-diff-header">Original</div>${leftHtml}</div>
        <div class="pii-diff-right"><div class="pii-diff-header">Obfuscated</div>${rightHtml}</div>
      </div>
      <div class="pii-review-actions pii-review-actions-simple">
        <button type="button" class="import-btn import-btn-secondary" data-pii-diff-close>Close</button>
      </div>
    </div>`;
  const close = () => closePIIOverlay(overlay);
  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('[data-pii-diff-close]')?.addEventListener('click', close);
  openPIIOverlay(overlay);
}

function nudgePIIOverlay(overlay) {
  const modal = overlay?.querySelector?.('.pii-diff-modal');
  if (!modal) return;
  modal.classList.add('modal-nudge');
  modal.addEventListener('animationend', () => modal.classList.remove('modal-nudge'), { once: true });
}

function wirePIIOverlayNudge(overlay) {
  overlay.addEventListener('click', event => {
    if (event.target === overlay) nudgePIIOverlay(overlay);
  });
}

export function reviewPIIBeforeSend(
  originalText,
  {
    obfuscatedText = '',
    streamFn = /** @type {PIIStreamFunction | null} */ (null),
  } = {},
  /** @type {PIIReviewDeps} */ deps,
) {
  if (!isDataProtectionStylesheetLoaded()) {
    return loadDataProtectionStylesheetForAction().then(loaded => {
      if (loaded) {
        return reviewPIIBeforeSend(originalText, { obfuscatedText, streamFn }, deps);
      }
      showNotification('Privacy review could not be loaded. Try again.', 'error');
      return 'cancel';
    });
  }
  return new Promise(resolve => {
    const isStreaming = typeof streamFn === 'function';
    const overlay = document.createElement('div');
    overlay.className = 'pii-warning-overlay';
    const { leftHtml } = buildPIIDiffHTML(originalText, obfuscatedText || originalText);
    const initialText = obfuscatedText ? escapeHTML(obfuscatedText) : '';
    overlay.innerHTML = `
      <div class="pii-diff-modal pii-review-modal" role="dialog" aria-modal="true" aria-label="PII Review">
        <div class="gb-modal-head pii-review-head">
          <div>
            <div class="gb-modal-kicker">Privacy review</div>
            <div class="gb-modal-title">Review &amp; Edit</div>
          </div>
        </div>
        <p class="pii-review-intro">Personal information has been replaced with fake data before the analysis model sees the report. Review the text that will be sent and edit anything that still looks identifying.</p>
        <div class="pii-search-bar">
          <input type="text" class="pii-search-input" id="pii-search-input" placeholder="Search for your name, address, phone\u2026" autocomplete="off">
          <span class="pii-search-count" id="pii-search-count"></span>
        </div>
        <details class="pii-mobile-original">
          <summary>Original report (comparison only)</summary>
          <div class="pii-mobile-original-body">${leftHtml}</div>
        </details>
        <div class="pii-diff-viewer pii-review-viewer">
          <div class="pii-diff-left"><div class="pii-diff-header">Original report (comparison only)</div>${leftHtml}</div>
          <div class="pii-diff-right">
            <div class="pii-diff-header">Sent to analysis AI <button class="pii-edit-btn" id="pii-edit-btn" type="button">&#9998; Edit</button></div>
            ${isStreaming ? '<details class="pii-thinking-section" id="pii-thinking-section" hidden><summary>Thinking\u2026</summary><pre class="pii-thinking-content" id="pii-thinking-content"></pre></details>' : ''}
            <textarea class="pii-edit-textarea" id="pii-edit-textarea" spellcheck="false"${isStreaming ? ' readonly' : ''}>${initialText}</textarea>
            ${isStreaming ? '<div class="pii-stream-status pii-stream-waiting" id="pii-stream-status">Waiting for model response\u2026</div>' : ''}
          </div>
        </div>
        <div class="pii-review-actions">
          <button type="button" class="import-btn import-btn-secondary" id="pii-review-regex" title="Run regex-based obfuscation instead">Use regex instead</button>
          ${isStreaming ? '<button type="button" class="import-btn import-btn-secondary" id="pii-stream-stop">Stop</button>' : ''}
          ${isStreaming ? '<button type="button" class="import-btn import-btn-secondary" id="pii-stream-retry" hidden>Retry</button>' : ''}
          <span class="pii-action-spacer"></span>
          <button type="button" class="import-btn import-btn-secondary" id="pii-review-cancel">Cancel Import</button>
          <button type="button" class="import-btn import-btn-primary" id="pii-review-send"${isStreaming ? ' disabled' : ''}>Send to AI</button>
        </div>
      </div>`;
    wirePIIOverlayNudge(overlay);
    openPIIOverlay(overlay);

    const searchInput = /** @type {HTMLInputElement} */ (overlay.querySelector('#pii-search-input'));
    const searchCount = /** @type {HTMLElement} */ (overlay.querySelector('#pii-search-count'));
    const textarea = /** @type {HTMLTextAreaElement} */ (overlay.querySelector('#pii-edit-textarea'));
    const sendButton = /** @type {HTMLButtonElement} */ (overlay.querySelector('#pii-review-send'));
    const statusElement = /** @type {HTMLElement | null} */ (overlay.querySelector('#pii-stream-status'));
    const stopButton = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#pii-stream-stop'));
    const leftPanel = /** @type {HTMLElement | null} */ (
      overlay.querySelector('.pii-review-viewer > .pii-diff-left')
    );
    const mobileOriginal = /** @type {HTMLElement | null} */ (
      overlay.querySelector('.pii-mobile-original-body')
    );
    let dirty = false;

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      if (!query || query.length < 2) {
        searchCount.textContent = '';
        searchCount.className = 'pii-search-count';
        return;
      }
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = textarea.value.match(regex);
      const total = matches ? matches.length : 0;
      if (total > 0) {
        searchCount.textContent = `${total} found \u2014 PII may still be present`;
        searchCount.className = 'pii-search-count pii-search-warn';
      } else {
        searchCount.textContent = 'Not found';
        searchCount.className = 'pii-search-count pii-search-clear';
      }
    });

    textarea.addEventListener('input', () => {
      if (!dirty) {
        dirty = true;
        sendButton.textContent = 'Save & Send to AI';
      }
    });

    textarea.addEventListener('blur', () => {
      if (textarea.readOnly || !textarea.value) return;
      setTimeout(() => {
        if (document.activeElement !== textarea && overlay.parentElement) {
          showDiffPreview(textarea.value);
        }
      }, 150);
    });

    function switchToEditMode(event) {
      const diffView = /** @type {HTMLElement | null} */ (
        overlay.querySelector('.pii-diff-preview')
      );
      if (!diffView) return;
      let lineIndex = -1;
      if (event && event.target && diffView.contains(/** @type {Node} */ (event.target))) {
        let element = /** @type {Node | null} */ (event.target);
        while (element && element.parentNode !== diffView) {
          element = /** @type {Node | null} */ (element.parentNode);
        }
        if (element instanceof Element) {
          lineIndex = Array.from(diffView.children).indexOf(element);
        }
      }
      const scrollParent = diffView.parentElement;
      const scrollTop = scrollParent?.scrollTop ?? 0;
      diffView.style.display = 'none';
      textarea.style.display = '';
      if (lineIndex >= 0) {
        const textLines = textarea.value.split('\n');
        let offset = 0;
        for (let index = 0; index < lineIndex && index < textLines.length; index++) {
          offset += textLines[index].length + 1;
        }
        textarea.setSelectionRange(offset, offset);
      }
      textarea.focus({ preventScroll: true });
      if (textarea.parentElement) textarea.parentElement.scrollTop = scrollTop;
    }

    function showDiffPreview(currentObfuscatedText) {
      const { leftHtml: nextLeftHtml, rightHtml } = buildPIIDiffHTML(
        originalText,
        currentObfuscatedText,
      );
      if (leftPanel) {
        leftPanel.innerHTML = `<div class="pii-diff-header">Original report (comparison only)</div>${nextLeftHtml}`;
      }
      if (mobileOriginal) mobileOriginal.innerHTML = nextLeftHtml;
      textarea.style.display = 'none';
      let diffView = /** @type {HTMLElement | null} */ (
        overlay.querySelector('.pii-diff-preview')
      );
      if (!diffView) {
        const textareaParent = textarea.parentElement;
        if (!textareaParent) return;
        diffView = document.createElement('div');
        diffView.className = 'pii-diff-preview';
        textareaParent.insertBefore(diffView, textarea);
      }
      diffView.innerHTML = rightHtml;
      diffView.style.display = '';
    }

    /** @type {HTMLButtonElement} */ (
      overlay.querySelector('#pii-edit-btn')
    ).addEventListener('click', event => switchToEditMode(event));

    let abortController = /** @type {AbortController | null} */ (null);
    /** @type {HTMLButtonElement} */ (
      overlay.querySelector('#pii-review-regex')
    ).addEventListener('click', () => {
      const result = deps.obfuscatePDFText(originalText);
      textarea.value = result.obfuscated;
      textarea.readOnly = false;
      sendButton.disabled = false;
      if (statusElement) {
        statusElement.textContent = `Regex applied \u2014 ${result.replacements} replacement${result.replacements !== 1 ? 's' : ''}`;
      }
      if (stopButton) stopButton.hidden = true;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      deps.unloadOllamaPIIModel();
      showDiffPreview(result.obfuscated);
      sendButton.textContent = 'Send to AI';
      dirty = false;
    });

    sendButton.addEventListener('click', () => {
      closePIIOverlay(overlay);
      resolve(textarea.value);
    });
    /** @type {HTMLButtonElement} */ (
      overlay.querySelector('#pii-review-cancel')
    ).addEventListener('click', () => {
      if (abortController) abortController.abort();
      deps.unloadOllamaPIIModel();
      closePIIOverlay(overlay);
      resolve('cancel');
    });

    if (isStreaming) {
      const runStream = /** @type {PIIStreamFunction} */ (streamFn);
      if (!statusElement || !stopButton) {
        closePIIOverlay(overlay);
        resolve('cancel');
        return;
      }
      const retryButton = /** @type {HTMLButtonElement | null} */ (
        overlay.querySelector('#pii-stream-retry')
      );
      if (!retryButton) {
        closePIIOverlay(overlay);
        resolve('cancel');
        return;
      }
      const expectedLength = originalText.length;
      const thinkingSection = /** @type {HTMLDetailsElement | null} */ (
        overlay.querySelector('#pii-thinking-section')
      );
      const thinkingContent = /** @type {HTMLElement | null} */ (
        overlay.querySelector('#pii-thinking-content')
      );

      const startStream = () => {
        abortController = new AbortController();
        textarea.value = '';
        textarea.style.display = '';
        textarea.readOnly = true;
        sendButton.disabled = true;
        stopButton.hidden = false;
        retryButton.hidden = true;
        const previousDiff = /** @type {HTMLElement | null} */ (
          overlay.querySelector('.pii-diff-preview')
        );
        if (previousDiff) previousDiff.style.display = 'none';
        statusElement.className = 'pii-stream-status pii-stream-waiting';
        statusElement.textContent = 'Waiting for model response\u2026';
        if (thinkingSection && thinkingContent) {
          thinkingSection.hidden = true;
          thinkingContent.textContent = '';
        }
        let characterCount = 0;
        let framePending = false;
        let pendingText = '';
        let pendingThinking = '';
        let hasThinking = false;

        const flushToTextarea = () => {
          if (pendingThinking && thinkingSection && thinkingContent) {
            if (!hasThinking) {
              thinkingSection.hidden = false;
              thinkingSection.open = true;
              hasThinking = true;
            }
            thinkingContent.textContent += pendingThinking;
            pendingThinking = '';
            thinkingContent.scrollTop = thinkingContent.scrollHeight;
            if (!pendingText) statusElement.textContent = 'Thinking\u2026';
          }
          if (pendingText) {
            textarea.value += pendingText;
            characterCount += pendingText.length;
            pendingText = '';
            statusElement.classList.remove('pii-stream-waiting');
            const percent = Math.min(
              99,
              Math.round(characterCount / expectedLength * 100),
            );
            statusElement.textContent = `Streaming\u2026 ${percent}% (${characterCount.toLocaleString()} / ~${expectedLength.toLocaleString()} chars)`;
            textarea.scrollTop = textarea.scrollHeight;
          }
          framePending = false;
        };

        const onThinking = chunk => {
          pendingThinking += chunk;
          if (!framePending) {
            framePending = true;
            requestAnimationFrame(flushToTextarea);
          }
        };

        runStream(
          chunk => {
            pendingText += chunk;
            if (!framePending) {
              framePending = true;
              requestAnimationFrame(flushToTextarea);
            }
          },
          abortController.signal,
          onThinking,
        ).then(() => {
          flushToTextarea();
          textarea.readOnly = false;
          sendButton.disabled = false;
          statusElement.textContent = `Complete \u2014 ${characterCount.toLocaleString()} chars \u2014 click text to edit`;
          stopButton.hidden = true;
          retryButton.hidden = false;
          if (thinkingSection && hasThinking) {
            thinkingSection.open = false;
            const summary = thinkingSection.querySelector('summary');
            if (summary) summary.textContent = 'Thinking (done)';
          }
          showDiffPreview(textarea.value);
        }).catch(error => {
          flushToTextarea();
          if (error.name === 'AbortError') return;
          textarea.readOnly = false;
          sendButton.disabled = true;
          statusElement.textContent = `Error: ${error.message} Use Regex fallback or retry before sending.`;
          stopButton.hidden = true;
          retryButton.hidden = false;
        });
      };

      stopButton.addEventListener('click', () => {
        abortController?.abort();
        abortController = null;
        textarea.readOnly = false;
        sendButton.disabled = true;
        statusElement.textContent = 'Stopped \u2014 partial output cannot be sent. Use Regex fallback or retry.';
        stopButton.hidden = true;
        retryButton.hidden = false;
        deps.unloadOllamaPIIModel();
      });

      retryButton.addEventListener('click', startStream);
      startStream();
    }
  });
}
