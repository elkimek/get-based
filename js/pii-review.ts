// pii-review.js — PII diff rendering and review-modal interaction.

import type { ModalOverlayOptions } from './modal-lifecycle.js';

export type PIIStreamFunction = (
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
  onThinking: (chunk: string) => void,
) => Promise<unknown>;
export interface PIIReviewOptions { obfuscatedText?: string; streamFn?: PIIStreamFunction | null; }
type PIIReviewDeps = Pick<typeof import('./pii.js'), 'obfuscatePDFText' | 'unloadOllamaPIIModel'>;
type DiffOperation =
  | { type: 'equal'; original: string; replacement: string }
  | { type: 'add'; replacement: string }
  | { type: 'delete'; original: string };

import { escapeHTML, showNotification } from './utils.js';
import {renderPIIPanel, renderPIIOriginalPanel, renderPIIDiffViewer, renderPIIReviewModal} from './pii-review-presentation.js';
import type {PIIWordView, PIILineView, PIIDiffView} from './pii-review-presentation.js';
import {
  isDataProtectionStylesheetLoaded,
  loadDataProtectionStylesheetForAction,
  openModalOverlay,
  removeModalOverlay,
  trapModalFocus,
} from './modal-lifecycle.js';


function wordDiff(originalLine: string, replacementLine: string): {left: PIIWordView[]; right: PIIWordView[]} {
  const tokenize = (value: string) => value.match(/\S+|\s+/g) || [];
  const originalTokens = tokenize(originalLine);
  const replacementTokens = tokenize(replacementLine);
  const originalLength = originalTokens.length;
  const replacementLength = replacementTokens.length;
  if (originalLength === 0 && replacementLength === 0) {
    return { left: [{kind: 'blank', text: '\u00a0'}], right: [{kind: 'blank', text: '\u00a0'}] };
  }
  if (originalLength > 200 || replacementLength > 200) {
    return {
      left: [{kind: 'removed', text: originalLine}],
      right: [{kind: 'added', text: replacementLine}],
    };
  }

  const matches = Array.from(
    { length: originalLength + 1 },
    () => new Uint16Array(replacementLength + 1),
  );
  for (let originalIndex = 1; originalIndex <= originalLength; originalIndex++) {
    for (let replacementIndex = 1; replacementIndex <= replacementLength; replacementIndex++) {
      matches[originalIndex]![replacementIndex] = originalTokens[originalIndex - 1]
        === replacementTokens[replacementIndex - 1]
        ? matches[originalIndex - 1]![replacementIndex - 1]! + 1
        : Math.max(
          matches[originalIndex - 1]![replacementIndex]!,
          matches[originalIndex]![replacementIndex - 1]!,
        );
    }
  }

  const operations: DiffOperation[] = [];
  let originalIndex = originalLength;
  let replacementIndex = replacementLength;
  while (originalIndex > 0 || replacementIndex > 0) {
    if (originalIndex > 0 && replacementIndex > 0
        && originalTokens[originalIndex - 1] === replacementTokens[replacementIndex - 1]) {
      operations.push({
        type: 'equal',
        original: originalTokens[--originalIndex]!,
        replacement: replacementTokens[--replacementIndex]!,
      });
    } else if (replacementIndex > 0
        && (originalIndex === 0
          || matches[originalIndex]![replacementIndex - 1]!
            >= matches[originalIndex - 1]![replacementIndex]!)) {
      operations.push({ type: 'add', replacement: replacementTokens[--replacementIndex]! });
    } else {
      operations.push({ type: 'delete', original: originalTokens[--originalIndex]! });
    }
  }
  operations.reverse();

  const left: PIIWordView[] = [];
  const right: PIIWordView[] = [];
  for (const operation of operations) {
    if (operation.type === 'equal') {
      left.push({kind: 'equal', text: operation.original});
      right.push({kind: 'equal', text: operation.replacement});
    } else if (operation.type === 'delete') {
      left.push({kind: 'removed', text: operation.original});
    } else {
      right.push({kind: 'added', text: operation.replacement});
    }
  }
  return { left: left.length ? left : [{kind: 'blank', text: '\u00a0'}], right: right.length ? right : [{kind: 'blank', text: '\u00a0'}] };
}

export function projectPIIDiff(originalText: string, obfuscatedText: string): PIIDiffView {
  const trimBlankLines = (value: string) => value.replace(/^\n+/, '').replace(/\n+$/, '');
  const originalLines = trimBlankLines(originalText).split('\n');
  const obfuscatedLines = trimBlankLines(obfuscatedText).split('\n');
  const maxLines = Math.max(originalLines.length, obfuscatedLines.length);
  const leftLines: PIILineView[] = [];
  const rightLines: PIILineView[] = [];
  for (let index = 0; index < maxLines; index++) {
    const originalLine = originalLines[index] || '';
    const obfuscatedLine = obfuscatedLines[index] || '';
    if (originalLine === obfuscatedLine) {
      leftLines.push({kind: 'equal', words: [{kind: originalLine ? 'equal' : 'blank', text: originalLine || '\u00a0'}]});
      rightLines.push({kind: 'equal', words: [{kind: obfuscatedLine ? 'equal' : 'blank', text: obfuscatedLine || '\u00a0'}]});
    } else {
      const { left, right } = wordDiff(originalLine, obfuscatedLine);
      leftLines.push({kind: 'removed', words: left});
      rightLines.push({kind: 'added', words: right});
    }
  }
  return {left: {lines: leftLines}, right: {lines: rightLines}};
}

/** Public legacy HTML export. The live review/viewer consume projectPIIDiff data directly. */
export function buildPIIDiffHTML(originalText: string, obfuscatedText: string) {
  const view = projectPIIDiff(originalText, obfuscatedText);
  const serialize = (lines: readonly PIILineView[]) => lines.map(line => {
    const words = line.words.map(word => {
      const text = word.kind === 'blank' ? '&nbsp;' : escapeHTML(word.text);
      return word.kind === 'equal' || word.kind === 'blank' ? text : '<span class="pii-word-' + word.kind + '">' + text + '</span>';
    }).join('');
    return '<div' + (line.kind === 'equal' ? '' : ' class="pii-diff-highlight-' + line.kind + '"') + '>' + words + '</div>';
  }).join('');
  return {leftHtml: serialize(view.left.lines), rightHtml: serialize(view.right.lines)};
}

function openPIIOverlay(overlay: HTMLElement, options: ModalOverlayOptions = {}) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    openModalOverlay(overlay, options);
    try {
      trapModalFocus(overlay, { closeOnEscape: false });
    } catch (_) {}
  });
}

function closePIIOverlay(overlay: HTMLElement) {
  removeModalOverlay(overlay);
}

export function showPIIDiffViewer(originalText: string, obfuscatedText: string): void | Promise<void | false> {
  if (!isDataProtectionStylesheetLoaded()) {
    return loadDataProtectionStylesheetForAction().then(loaded => {
      if (loaded) return showPIIDiffViewer(originalText, obfuscatedText);
      showNotification('Privacy review could not be loaded. Try again.', 'error');
      return false;
    });
  }
  const overlay = document.createElement('div');
  overlay.className = 'pii-warning-overlay';
  const {left, right} = projectPIIDiff(originalText, obfuscatedText);
  overlay.innerHTML = renderPIIDiffViewer(left, right);
  const close = () => closePIIOverlay(overlay);
  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('[data-pii-diff-close]')?.addEventListener('click', close);
  openPIIOverlay(overlay);
}

function nudgePIIOverlay(overlay: HTMLElement) {
  const modal = overlay?.querySelector?.('.pii-diff-modal');
  if (!modal) return;
  modal.classList.add('modal-nudge');
  modal.addEventListener('animationend', () => modal.classList.remove('modal-nudge'), { once: true });
}

function wirePIIOverlayNudge(overlay: HTMLElement) {
  overlay.addEventListener('click', event => {
    if (event.target === overlay) nudgePIIOverlay(overlay);
  });
}

export function reviewPIIBeforeSend(
  originalText: string,
  {
    obfuscatedText = '',
    streamFn = null,
  }: PIIReviewOptions = {},
  deps: PIIReviewDeps,
): Promise<string> {
  if (!isDataProtectionStylesheetLoaded()) {
    return loadDataProtectionStylesheetForAction().then(loaded => {
      if (loaded) {
        return reviewPIIBeforeSend(originalText, { obfuscatedText, streamFn }, deps);
      }
      showNotification('Privacy review could not be loaded. Try again.', 'error');
      return 'cancel';
    });
  }
  return new Promise<string>(resolve => {
    const isStreaming = typeof streamFn === 'function';
    const overlay = document.createElement('div');
    overlay.className = 'pii-warning-overlay';
    const {left} = projectPIIDiff(originalText, obfuscatedText || originalText);
    const initialText = obfuscatedText || '';
    overlay.innerHTML = renderPIIReviewModal(left, initialText, isStreaming);
    wirePIIOverlayNudge(overlay);
    openPIIOverlay(overlay);

    const searchInput = overlay.querySelector<HTMLInputElement>('#pii-search-input')!;
    const searchCount = overlay.querySelector<HTMLElement>('#pii-search-count')!;
    const textarea = overlay.querySelector<HTMLTextAreaElement>('#pii-edit-textarea')!;
    const sendButton = overlay.querySelector<HTMLButtonElement>('#pii-review-send')!;
    const statusElement = overlay.querySelector<HTMLElement>('#pii-stream-status');
    const stopButton = overlay.querySelector<HTMLButtonElement>('#pii-stream-stop');
    const leftPanel = overlay.querySelector<HTMLElement>('.pii-review-viewer > .pii-diff-left');
    const mobileOriginal = overlay.querySelector<HTMLElement>('.pii-mobile-original-body');
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

    function switchToEditMode(event: Event) {
      const diffView = overlay.querySelector<HTMLElement>('.pii-diff-preview');
      if (!diffView) return;
      let lineIndex = -1;
      if (event && event.target && diffView.contains((event.target as Node))) {
        let element = (event.target as Node | null);
        while (element && element.parentNode !== diffView) {
          element = (element.parentNode as Node | null);
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
          offset += textLines[index]!.length + 1;
        }
        textarea.setSelectionRange(offset, offset);
      }
      textarea.focus({ preventScroll: true });
      if (textarea.parentElement) textarea.parentElement.scrollTop = scrollTop;
    }

    function showDiffPreview(currentObfuscatedText: string) {
      const {left, right} = projectPIIDiff(
        originalText,
        currentObfuscatedText,
      );
      if (leftPanel) {
        leftPanel.innerHTML = renderPIIOriginalPanel(left);
      }
      if (mobileOriginal) mobileOriginal.innerHTML = renderPIIPanel(left);
      textarea.style.display = 'none';
      let diffView = overlay.querySelector<HTMLElement>('.pii-diff-preview');
      if (!diffView) {
        const textareaParent = textarea.parentElement;
        if (!textareaParent) return;
        diffView = document.createElement('div');
        diffView.className = 'pii-diff-preview';
        textareaParent.insertBefore(diffView, textarea);
      }
      diffView.innerHTML = renderPIIPanel(right);
      diffView.style.display = '';
    }

    overlay.querySelector<HTMLButtonElement>('#pii-edit-btn')!.addEventListener('click', event => switchToEditMode(event));

    let abortController: AbortController | null = null;
    overlay.querySelector<HTMLButtonElement>('#pii-review-regex')!.addEventListener('click', () => {
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
    overlay.querySelector<HTMLButtonElement>('#pii-review-cancel')!.addEventListener('click', () => {
      if (abortController) abortController.abort();
      deps.unloadOllamaPIIModel();
      closePIIOverlay(overlay);
      resolve('cancel');
    });

    if (isStreaming) {
      const runStream = (streamFn as PIIStreamFunction);
      if (!statusElement || !stopButton) {
        closePIIOverlay(overlay);
        resolve('cancel');
        return;
      }
      const retryButton = overlay.querySelector<HTMLButtonElement>('#pii-stream-retry');
      if (!retryButton) {
        closePIIOverlay(overlay);
        resolve('cancel');
        return;
      }
      const expectedLength = originalText.length;
      const thinkingSection = overlay.querySelector<HTMLDetailsElement>('#pii-thinking-section');
      const thinkingContent = overlay.querySelector<HTMLElement>('#pii-thinking-content');

      const startStream = () => {
        abortController = new AbortController();
        textarea.value = '';
        textarea.style.display = '';
        textarea.readOnly = true;
        sendButton.disabled = true;
        stopButton.hidden = false;
        retryButton.hidden = true;
        const previousDiff = overlay.querySelector<HTMLElement>('.pii-diff-preview');
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

        const onThinking = (chunk: string) => {
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
