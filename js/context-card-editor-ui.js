// context-card-editor-ui.js - Shared context-card editor modal and field controls

import { escapeHTML } from './utils.js';

export function renderContextEditorModal(modal, title, subtitle, bodyHtml, closeFn = 'closeModal') {
  if (!modal) return;
  modal.className = 'modal gb-form-modal ctx-editor-modal';
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `<div class="gb-modal-head ctx-editor-head">
    <div>
      <div class="gb-modal-kicker">Profile context</div>
      <h3 class="gb-modal-title">${escapeHTML(title)}</h3>
    </div>
    <button type="button" class="modal-close" onclick="${closeFn}()" aria-label="Close ${escapeHTML(title)}">&times;</button>
  </div>
  <div class="gb-form-body ctx-editor-body">
    ${subtitle ? `<div class="modal-unit">${escapeHTML(subtitle)}</div>` : ''}
    ${bodyHtml}
  </div>`;
}

export function renderSelectField(label, id, options, current) {
  return `<div class="ctx-field-group"><label class="ctx-field-label">${escapeHTML(label)}</label>
    <div class="ctx-btn-group" id="${id}">
      ${options.map(o => `<button type="button" class="ctx-btn-option${current === o ? ' active' : ''}" onclick="selectCtxOption(this,'${id}')">${escapeHTML(o)}</button>`).join('')}
    </div></div>`;
}

export function selectCtxOption(btn, groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const wasActive = btn.classList.contains('active');
  group.querySelectorAll('.ctx-btn-option').forEach(b => b.classList.remove('active'));
  if (!wasActive) btn.classList.add('active');
}

export function getSelectedOption(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return null;
  const active = group.querySelector('.ctx-btn-option.active');
  return active ? active.textContent : null;
}

export function renderTagsField(label, id, options, selected) {
  const sel = selected || [];
  return `<div class="ctx-field-group"><label class="ctx-field-label">${escapeHTML(label)}</label>
    <div class="ctx-tags" id="${id}">
      ${options.map(o => `<button type="button" class="ctx-tag${sel.includes(o) ? ' active' : ''}" onclick="toggleCtxTag(this)">${escapeHTML(o)}</button>`).join('')}
    </div></div>`;
}

const CTX_EXCLUSIONS = [
  ['no screens 1-2h before bed', 'screen in bed'],
  ['dim lights after sunset', 'bright lights until bed'],
  ['early dinner (before 6pm)', 'late dinner (after 8pm)'],
];

export function toggleCtxTag(btn) {
  const text = btn.textContent.trim();
  const isNone = text.toLowerCase() === 'none';
  const group = btn.parentElement;
  if (isNone) {
    // Toggling "none" on deselects all other options in the group.
    if (!btn.classList.contains('active')) {
      group.querySelectorAll('.ctx-tag.active').forEach(b => b.classList.remove('active'));
    }
  } else {
    group.querySelectorAll('.ctx-tag.active').forEach(b => {
      if (b.textContent.trim().toLowerCase() === 'none') b.classList.remove('active');
    });
    if (!btn.classList.contains('active')) {
      for (const pair of CTX_EXCLUSIONS) {
        const other = pair[0] === text ? pair[1] : pair[1] === text ? pair[0] : null;
        if (other) {
          group.querySelectorAll('.ctx-tag.active').forEach(b => {
            if (b.textContent.trim() === other) b.classList.remove('active');
          });
        }
      }
    }
  }
  btn.classList.toggle('active');
}

export function getSelectedTags(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return Array.from(el.querySelectorAll('.ctx-tag.active')).map(b => b.textContent);
}

export function renderNoteField(value) {
  return `<div class="ctx-field-group"><label class="ctx-field-label">Notes</label>
    <input type="text" class="ctx-note-input" id="ctx-note-input" placeholder="Anything else..." value="${escapeHTML(value || '')}"></div>`;
}

export function contextEditorActions(hasCurrent, saveFn, clearFn) {
  return `<div class="ctx-editor-actions">
    <button class="import-btn import-btn-primary" onclick="${saveFn}()">Save</button>
    <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
    ${hasCurrent ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" onclick="${clearFn}()">Clear</button>` : ''}
  </div>`;
}
