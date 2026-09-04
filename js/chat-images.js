// @ts-check
// chat-images.js — Chat panel attachment and health-file import flow
//
// Extracted from chat.js (v1.21.9) as the first Phase 2e refactor split.
// Owns the pending-attachment queue, paste/drop/picker handlers, HD-mode
// toggle, and thumbnail generation. Exposes a small interface so
// chat.js can read the queue when sending and clear it afterwards.
//
// The only back-reference into chat-send.js is the configured
// updateSendButtonState callback invoked when the queue changes.

import { escapeHTML, showNotification } from './utils.js';
import { resizeImage, isValidImageType } from './image-utils.js';
import { hasAIProvider, supportsVision } from './api.js';
import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { state } from './state.js';
import { isCodexChatBackend } from './chat-backend-selection.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { handleImportInputChange } from './import-file-input.js';

const MAX_ATTACHMENTS = 5;
const THUMB_SIZE = 80;
/** @typedef {{ base64: string, mediaType: string, name: string, previewUrl: string, thumbUrl: string | null }} PendingAttachment */
/** @type {Map<string, PendingAttachment[]>} */
const pendingAttachmentsByThread = new Map();
/** @type {WeakMap<object, PendingAttachment[]>} */
const sentMessageAttachments = new WeakMap();
let _hdMode = localStorage.getItem('labcharts-hd-images') === 'true';
const chatImageDeps = {
  updateSendButtonState: () => {},
  importFiles: files => handleImportInputChange({ target: { files, value: '' } }),
};

export function configureChatImages(deps = {}) {
  if (typeof deps.updateSendButtonState === 'function') {
    chatImageDeps.updateSendButtonState = deps.updateSendButtonState;
  }
  if (typeof deps.importFiles === 'function') {
    chatImageDeps.importFiles = deps.importFiles;
  }
}

function canAttachImages() {
  return isCodexChatBackend()
    ? getAssistantExecutionRoute().inputModalities?.includes('image') === true
    : hasAIProvider() && supportsVision();
}

function isChatImageFile(file) {
  return isValidImageType(file.type);
}

/**
 * Images remain message attachments when the selected chat model can see
 * them. PDFs, spreadsheets, text exports, and every other file are routed to
 * getbased's reviewed import flow. If image input is unavailable, an image is
 * also offered to the import flow instead of disappearing silently.
 * @param {File[] | FileList} files
 */
export async function handleChatFiles(files) {
  const selectedFiles = Array.from(files || []);
  if (selectedFiles.length === 0) return;
  const imageFiles = canAttachImages() ? selectedFiles.filter(isChatImageFile) : [];
  const importFiles = selectedFiles.filter(file => !imageFiles.includes(file));
  for (const file of imageFiles) await addImageAttachment(file);
  if (importFiles.length === 0) return;
  try {
    await chatImageDeps.importFiles(importFiles);
  } catch (error) {
    console.error('[chat-files] import failed:', error);
    showNotification('Import failed — check the file and try again.', 'error');
  }
}

function attachmentDraftKey(threadId = state.currentThreadId) {
  return `${state.currentProfile || 'default'}:${threadId || 'unassigned'}`;
}

function currentAttachmentDraft({ create = true } = {}) {
  const key = attachmentDraftKey();
  let draft = pendingAttachmentsByThread.get(key);
  if (!draft && create) {
    draft = [];
    pendingAttachmentsByThread.set(key, draft);
  }
  return draft || [];
}

/// Queue inspection for chat.js's sendChatMessage + send-button state.
export function getPendingAttachments() { return currentAttachmentDraft(); }
export function hasPendingAttachments() { return currentAttachmentDraft({ create: false }).length > 0; }

/** Shrink an image to a tiny thumbnail data URL for chat history storage */
function makeThumbnail(previewUrl, width, height) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = THUMB_SIZE / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(null);
    img.src = previewUrl;
  });
}

function hdTitle() {
  return _hdMode ? 'HD quality (2048px) — click for standard' : 'Standard quality (1024px) — click for HD';
}

export function toggleHDMode() {
  _hdMode = !_hdMode;
  localStorage.setItem('labcharts-hd-images', String(_hdMode));
  const btn = document.getElementById('chat-hd-btn');
  if (btn) {
    btn.classList.toggle('active', _hdMode);
    btn.title = hdTitle();
  }
}

export async function addImageAttachment(file) {
  if (!isValidImageType(file.type)) {
    showNotification('Unsupported image type. Use JPEG, PNG, GIF, or WebP.', 'error');
    return;
  }
  const pendingAttachments = currentAttachmentDraft();
  if (pendingAttachments.length >= MAX_ATTACHMENTS) {
    showNotification(`Maximum ${MAX_ATTACHMENTS} images per message`, 'error');
    return;
  }
  try {
    const maxDim = _hdMode ? 2048 : 1024;
    const quality = _hdMode ? 0.92 : 0.85;
    const { base64, mediaType, width, height, origWidth, origHeight, quality_warnings } = await resizeImage(file, maxDim, quality);
    const previewUrl = `data:${mediaType};base64,${base64}`;
    const thumbUrl = await makeThumbnail(previewUrl, width, height);
    pendingAttachments.push({ base64, mediaType, name: file.name, previewUrl, thumbUrl });
    renderAttachmentPreview();
    chatImageDeps.updateSendButtonState();
    // Warn about image quality issues
    const longSide = Math.max(origWidth, origHeight);
    if (longSide < 512) {
      showNotification(`Low resolution image (${origWidth}×${origHeight}). AI may struggle with fine details.`, 'info', 5000);
    } else if (longSide < 1024 && _hdMode) {
      showNotification(`Image is ${origWidth}×${origHeight} — smaller than HD target. Consider using a higher-res photo.`, 'info', 4000);
    }
    if (quality_warnings.length > 0) {
      showNotification(quality_warnings[0], 'info', 5000);
    }
  } catch (e) {
    const error = /** @type {Error} */ (e);
    showNotification('Failed to process image: ' + error.message, 'error');
  }
}

export function removeImageAttachment(index) {
  currentAttachmentDraft().splice(index, 1);
  renderAttachmentPreview();
  chatImageDeps.updateSendButtonState();
}

export function renderAttachmentPreview() {
  const container = document.getElementById('chat-attach-preview');
  if (!container) return;
  const pendingAttachments = currentAttachmentDraft({ create: false });
  if (pendingAttachments.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = pendingAttachments.map((att, i) =>
    `<div class="chat-attach-thumb" title="${escapeHTML(att.name)}">` +
    `<img src="${att.previewUrl}" alt="${escapeHTML(att.name)}">` +
    `<button class="chat-attach-remove" type="button" ${chatMessageActionAttrs('remove-image-attachment', { index: i })} aria-label="Remove ${escapeHTML(att.name)}">&times;</button>` +
    `</div>`
  ).join('') +
  `<span class="chat-attach-count">${pendingAttachments.length}/${MAX_ATTACHMENTS}</span>`;
}

export function openImageLightbox(src) {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'chat-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Attached image preview');
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Attached image preview';
  overlay.appendChild(img);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'chat-lightbox-close';
  closeButton.setAttribute('aria-label', 'Close image preview');
  closeButton.textContent = '\u00d7';
  overlay.appendChild(closeButton);
  let closed = false;
  const closeLightbox = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    removeModalOverlay(overlay);
    returnFocus?.focus();
  };
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    }
  };
  overlay.addEventListener('click', event => {
    if (event.target === overlay || event.target === closeButton) closeLightbox();
  });
  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  openModalOverlay(overlay);
  closeButton.focus();
}

export function clearAttachments(threadId = state.currentThreadId) {
  pendingAttachmentsByThread.delete(attachmentDraftKey(threadId));
  renderAttachmentPreview();
}

export function deleteAttachmentDraft(threadId) {
  pendingAttachmentsByThread.delete(attachmentDraftKey(threadId));
  if (threadId === state.currentThreadId) refreshAttachmentDraft();
}

export function refreshAttachmentDraft() {
  renderAttachmentPreview();
  chatImageDeps.updateSendButtonState();
}

export function rememberMessageAttachments(message, attachments) {
  if (!message || typeof message !== 'object' || !Array.isArray(attachments) || !attachments.length) return;
  sentMessageAttachments.set(message, attachments.map(attachment => ({ ...attachment })));
}

export function restoreMessageAttachments(message) {
  const attachments = message && typeof message === 'object'
    ? sentMessageAttachments.get(message)
    : null;
  if (!attachments?.length) return false;
  pendingAttachmentsByThread.set(
    attachmentDraftKey(),
    attachments.map(attachment => ({ ...attachment })),
  );
  refreshAttachmentDraft();
  return true;
}

export function updateAttachButtonVisibility() {
  const btn = document.getElementById('chat-attach-btn');
  if (btn) btn.style.display = 'flex';
  const hdBtn = document.getElementById('chat-hd-btn');
  if (hdBtn) {
    hdBtn.style.display = canAttachImages() ? 'flex' : 'none';
    hdBtn.classList.toggle('active', _hdMode);
    hdBtn.title = hdTitle();
  }
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('getbased:agent-model-catalog-changed', updateAttachButtonVisibility);
}

export function initChatImageHandlers() {
  const textarea = document.getElementById('chat-input');
  const chatDropZone = document.querySelector('.chat-panel-conversation');
  const chatDropOverlay = document.getElementById('chat-drop-overlay');
  const fileInput = document.getElementById('chat-image-input');

  // Paste handler
  if (textarea) {
    textarea.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addImageAttachment(file);
        }
      }
    });
  }

  // Drag-drop across the conversation and composer. The overlay explains the
  // image-attachment vs health-import split before the user releases a file.
  if (chatDropZone) {
    const setDropActive = active => {
      chatDropZone.classList.toggle('chat-drop-active', active);
      if (chatDropOverlay) chatDropOverlay.hidden = !active;
    };
    chatDropZone.addEventListener('dragover', (e) => {
      const dragEvent = /** @type {DragEvent} */ (e);
      const hasFiles = [...(dragEvent.dataTransfer?.types || [])].includes('Files');
      if (hasFiles) {
        dragEvent.preventDefault();
        dragEvent.stopPropagation();
        if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'copy';
        setDropActive(true);
      }
    });
    chatDropZone.addEventListener('dragleave', (e) => {
      const relatedTarget = /** @type {Node | null} */ (/** @type {DragEvent} */ (e).relatedTarget);
      if (!relatedTarget || !chatDropZone.contains(relatedTarget)) {
        setDropActive(false);
      }
    });
    chatDropZone.addEventListener('drop', (e) => {
      const dragEvent = /** @type {DragEvent} */ (e);
      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      setDropActive(false);
      void handleChatFiles(dragEvent.dataTransfer?.files || []);
    });
  }

  // File input change
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const files = Array.from(input.files || []);
      void handleChatFiles(files).finally(() => { input.value = ''; });
    });
  }
}
