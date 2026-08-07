// @ts-check
// context-card-editor-ui.js - Shared context-card editor modal and field controls

import { escapeAttr, escapeHTML, showNotification } from './utils.js';
import { closeContextCardModalRuntime } from './context-cards-runtime.js';

const CONTEXT_EDITOR_STYLESHEET_URL = new URL('../css/context-editor.css', import.meta.url).href;
/** @type {Promise<HTMLLinkElement> | null} */
let contextEditorStylesheetPromise = null;
let useContextEditorStylesheetRetryUrl = false;

function existingContextEditorStylesheet() {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLLinkElement | null} */ (
    document.querySelector('link[data-context-editor-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname === '/css/context-editor.css';
        } catch {
          return false;
        }
      })
    || null
  );
}

export function isContextEditorStylesheetLoaded() {
  return !!existingContextEditorStylesheet()?.sheet;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadContextEditorStylesheet() {
  const existing = existingContextEditorStylesheet();
  if (existing?.sheet) return Promise.resolve(existing);
  if (!contextEditorStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Context editor stylesheet requires a document'));
    }
    const link = existing || document.createElement('link');
    const url = new URL(CONTEXT_EDITOR_STYLESHEET_URL);
    if (useContextEditorStylesheetRetryUrl) url.searchParams.set('lazy-retry', '1');
    link.rel = 'stylesheet';
    link.href = url.href;
    link.dataset.contextEditorStylesheet = '';
    contextEditorStylesheetPromise = new Promise((resolve, reject) => {
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => reject(new Error('Context editor stylesheet could not be loaded')), { once: true });
      if (!link.isConnected) {
        const anchor = document.querySelector('[data-context-editor-stylesheet-anchor]');
        const parent = anchor?.parentNode || document.head;
        parent.insertBefore(link, anchor || null);
      }
    }).catch(err => {
      link.remove();
      contextEditorStylesheetPromise = null;
      useContextEditorStylesheetRetryUrl = true;
      throw err;
    });
  }
  return contextEditorStylesheetPromise;
}

/** @param {() => any} action */
export function runWithContextEditorStylesheet(action) {
  if (isContextEditorStylesheetLoaded()) return action();
  return loadContextEditorStylesheet().then(() => action()).catch(err => {
    console.error('Failed to load context editor presentation', err);
    showNotification('Context editor could not be loaded. Try again.', 'error');
    return false;
  });
}

/**
 * @param {string} action
 * @param {string} [extra]
 * @returns {string}
 */
export function contextEditorActionAttrs(action, extra = '') {
  return `data-ctx-editor-action="${action}"${extra ? ` ${extra}` : ''}`;
}

/**
 * @param {EventTarget | null} target
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestContextEditorElement(target, selector) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  return el instanceof HTMLElement ? el : null;
}

/** @param {MouseEvent} event */
function handleContextEditorClick(event) {
  const actionEl = closestContextEditorElement(event.target, '[data-ctx-editor-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.ctxEditorAction || '';
  switch (action) {
    case 'close':
      closeContextCardModalRuntime();
      break;
    case 'select-option':
      selectCtxOption(actionEl, actionEl.dataset.ctxEditorGroup || actionEl.parentElement?.id || '');
      break;
    case 'toggle-tag':
      toggleCtxTag(actionEl);
      break;
    default:
      break;
  }
}

let contextEditorDelegatesBound = false;

function initContextEditorDelegates() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (contextEditorDelegatesBound) return;
  contextEditorDelegatesBound = true;
  document.addEventListener('click', handleContextEditorClick);
}

initContextEditorDelegates();

export function renderContextEditorModal(
  modal,
  title,
  subtitle,
  bodyHtml,
  closeActionAttrs = contextEditorActionAttrs('close'),
) {
  if (!modal) return;
  const overlay = modal.closest('.modal-overlay');
  const shouldResetScroll = !overlay?.classList.contains('show');
  modal.className = 'modal gb-form-modal ctx-editor-modal';
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `<div class="gb-modal-head ctx-editor-head">
    <div>
      <div class="gb-modal-kicker">Profile context</div>
      <h3 class="gb-modal-title">${escapeHTML(title)}</h3>
    </div>
    <button type="button" class="modal-close" ${closeActionAttrs} aria-label="Close ${escapeHTML(title)}">&times;</button>
  </div>
  <div class="gb-form-body ctx-editor-body">
    ${subtitle ? `<div class="modal-unit">${escapeHTML(subtitle)}</div>` : ''}
    ${bodyHtml}
  </div>`;
  if (shouldResetScroll) modal.scrollTop = 0;
}

/** @typedef {string | { value: string, label: string }} ContextEditorOption */

/** @param {ContextEditorOption} option */
function normalizeContextEditorOption(option) {
  if (typeof option === 'string') return { value: option, label: option };
  return { value: String(option.value), label: String(option.label) };
}

/**
 * Groups optional editor fields behind a readable, native disclosure control.
 * Callers can expose an in-progress section while keeping saved optional
 * answers summarized in the disclosure header.
 *
 * @param {string} title
 * @param {string} summary
 * @param {string} bodyHtml
 * @param {boolean} [open]
 */
export function renderContextEditorSection(title, summary, bodyHtml, open = false) {
  return `<details class="ctx-editor-section"${open ? ' open' : ''}>
    <summary><span class="ctx-editor-section-title">${escapeHTML(title)}</span><span class="ctx-editor-section-summary">${escapeHTML(summary)}</span></summary>
    <div class="ctx-editor-section-body">${bodyHtml}</div>
  </details>`;
}

/**
 * String options remain supported for the current schema. Object options let
 * translated labels change independently from the canonical stored value.
 *
 * @param {string} label
 * @param {string} id
 * @param {ContextEditorOption[]} options
 * @param {string | null | undefined} current
 */
export function renderSelectField(label, id, options, current) {
  const labelId = `${id}-label`;
  return `<div class="ctx-field-group"><label class="ctx-field-label" id="${escapeAttr(labelId)}">${escapeHTML(label)}</label>
    <div class="ctx-btn-group" id="${escapeAttr(id)}" role="group" aria-labelledby="${escapeAttr(labelId)}">
      ${options.map(option => {
        const { value, label: optionLabel } = normalizeContextEditorOption(option);
        const active = current === value || current === optionLabel;
        return `<button type="button" class="ctx-btn-option${active ? ' active' : ''}" aria-pressed="${active}" data-context-value="${escapeAttr(value)}" ${contextEditorActionAttrs('select-option', `data-ctx-editor-group="${escapeAttr(id)}"`)}>${escapeHTML(optionLabel)}</button>`;
      }).join('')}
    </div></div>`;
}

export function selectCtxOption(btn, groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const wasActive = btn.classList.contains('active');
  group.querySelectorAll('.ctx-btn-option').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  if (!wasActive) {
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  }
}

export function getSelectedOption(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return null;
  const active = /** @type {HTMLElement | null} */ (group.querySelector('.ctx-btn-option.active'));
  return active ? active.dataset.contextValue || active.textContent : null;
}

/**
 * @param {string} label
 * @param {string} id
 * @param {ContextEditorOption[]} options
 * @param {string[] | null | undefined} selected
 */
export function renderTagsField(label, id, options, selected) {
  const sel = selected || [];
  const labelId = `${id}-label`;
  return `<div class="ctx-field-group"><label class="ctx-field-label" id="${escapeAttr(labelId)}">${escapeHTML(label)}</label>
    <div class="ctx-tags" id="${escapeAttr(id)}" role="group" aria-labelledby="${escapeAttr(labelId)}">
      ${options.map(option => {
        const { value, label: optionLabel } = normalizeContextEditorOption(option);
        const active = sel.includes(value) || sel.includes(optionLabel);
        return `<button type="button" class="ctx-tag${active ? ' active' : ''}" aria-pressed="${active}" data-context-value="${escapeAttr(value)}" ${contextEditorActionAttrs('toggle-tag')}>${escapeHTML(optionLabel)}</button>`;
      }).join('')}
    </div></div>`;
}

const CTX_EXCLUSIONS = [
  ['no screens 1-2h before bed', 'screen in bed'],
  ['dim lights after sunset', 'bright lights until bed'],
  ['early dinner (before 6pm)', 'late dinner (after 8pm)'],
];

export function toggleCtxTag(btn) {
  const value = btn.dataset.contextValue || btn.textContent.trim();
  const isNone = value.toLowerCase() === 'none';
  const group = btn.parentElement;
  if (isNone) {
    // Toggling "none" on deselects all other options in the group.
    if (!btn.classList.contains('active')) {
      group.querySelectorAll('.ctx-tag.active').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
    }
  } else {
    group.querySelectorAll('.ctx-tag.active').forEach(b => {
      const activeValue = /** @type {HTMLElement} */ (b).dataset.contextValue || b.textContent.trim();
      if (activeValue.toLowerCase() === 'none') {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      }
    });
    if (!btn.classList.contains('active')) {
      for (const pair of CTX_EXCLUSIONS) {
        const other = pair[0] === value ? pair[1] : pair[1] === value ? pair[0] : null;
        if (other) {
          group.querySelectorAll('.ctx-tag.active').forEach(b => {
            const activeValue = /** @type {HTMLElement} */ (b).dataset.contextValue || b.textContent.trim();
            if (activeValue === other) {
              b.classList.remove('active');
              b.setAttribute('aria-pressed', 'false');
            }
          });
        }
      }
    }
  }
  btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
}

export function getSelectedTags(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return Array.from(el.querySelectorAll('.ctx-tag.active')).map(b => {
    const tag = /** @type {HTMLElement} */ (b);
    return tag.dataset.contextValue || tag.textContent;
  });
}

export function renderNoteField(value) {
  return `<div class="ctx-field-group"><label class="ctx-field-label" for="ctx-note-input">Notes</label>
    <textarea class="ctx-note-input ctx-note-textarea" id="ctx-note-input" rows="2" placeholder="Anything else that may be relevant">${escapeHTML(value || '')}</textarea></div>`;
}

export function contextEditorActions(hasCurrent, saveActionAttrs, clearActionAttrs) {
  return `<div class="ctx-editor-actions">
    <button class="import-btn import-btn-primary" ${saveActionAttrs}>Save</button>
    <button class="import-btn import-btn-secondary" ${contextEditorActionAttrs('close')}>Cancel</button>
    ${hasCurrent ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${clearActionAttrs}>Clear</button>` : ''}
  </div>`;
}
