// @ts-check
// chat-images.js — Chat panel image attachment flow
//
// Extracted from chat.js (v1.21.9) as the first Phase 2e refactor split.
// Owns the pending-attachment queue, paste/drop/picker handlers, HD-mode
// toggle, and thumbnail generation. Exposes a small interface so
// chat.js can read the queue when sending and clear it afterwards.
//
// The only back-reference into chat.js is `window.updateSendButtonState?.()`
// invoked when the queue changes — same window.fn() pattern that
// cross-module calls use elsewhere in the codebase to avoid circular
// deps (see CLAUDE.md's module-roster note).

import { escapeHTML, showNotification } from './utils.js';
import { resizeImage, isValidImageType } from './image-utils.js';
import { hasAIProvider, supportsVision } from './api.js';
import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';

const MAX_ATTACHMENTS = 5;
const THUMB_SIZE = 80;
/** @type {Array<{ base64: string, mediaType: string, name: string, previewUrl: string, thumbUrl: string | null }>} */
let _pendingAttachments = []; // { base64, mediaType, name, previewUrl, thumbUrl }
let _hdMode = localStorage.getItem('labcharts-hd-images') === 'true';

/// Queue inspection for chat.js's sendChatMessage + send-button state.
export function getPendingAttachments() { return _pendingAttachments; }
export function hasPendingAttachments() { return _pendingAttachments.length > 0; }

/** Shrink an image to a tiny thumbnail data URL for chat history storage */
function makeThumbnail(previewUrl, width, height) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = THUMB_SIZE / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
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
  if (_pendingAttachments.length >= MAX_ATTACHMENTS) {
    showNotification(`Maximum ${MAX_ATTACHMENTS} images per message`, 'error');
    return;
  }
  try {
    const maxDim = _hdMode ? 2048 : 1024;
    const quality = _hdMode ? 0.92 : 0.85;
    const { base64, mediaType, width, height, origWidth, origHeight, quality_warnings } = await resizeImage(file, maxDim, quality);
    const previewUrl = `data:${mediaType};base64,${base64}`;
    const thumbUrl = await makeThumbnail(previewUrl, width, height);
    _pendingAttachments.push({ base64, mediaType, name: file.name, previewUrl, thumbUrl });
    renderAttachmentPreview();
    window.updateSendButtonState?.();
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
  _pendingAttachments.splice(index, 1);
  renderAttachmentPreview();
  window.updateSendButtonState?.();
}

export function renderAttachmentPreview() {
  const container = document.getElementById('chat-attach-preview');
  if (!container) return;
  if (_pendingAttachments.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = _pendingAttachments.map((att, i) =>
    `<div class="chat-attach-thumb" title="${escapeHTML(att.name)}">` +
    `<img src="${att.previewUrl}" alt="${escapeHTML(att.name)}">` +
    `<button class="chat-attach-remove" onclick="removeImageAttachment(${i})" aria-label="Remove">&times;</button>` +
    `</div>`
  ).join('') +
  `<span class="chat-attach-count">${_pendingAttachments.length}/${MAX_ATTACHMENTS}</span>`;
}

export function openImageLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-lightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Full image';
  overlay.appendChild(img);
  let closed = false;
  const closeLightbox = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    removeModalOverlay(overlay);
  };
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    }
  };
  overlay.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  openModalOverlay(overlay);
}

export function clearAttachments() {
  _pendingAttachments = [];
  renderAttachmentPreview();
}

export function updateAttachButtonVisibility() {
  const visible = hasAIProvider() && supportsVision();
  const btn = document.getElementById('chat-attach-btn');
  if (btn) btn.style.display = visible ? 'flex' : 'none';
  const hdBtn = document.getElementById('chat-hd-btn');
  if (hdBtn) {
    hdBtn.style.display = visible ? 'flex' : 'none';
    hdBtn.classList.toggle('active', _hdMode);
    hdBtn.title = hdTitle();
  }
}

export function initChatImageHandlers() {
  const textarea = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
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

  // Drag-drop on chat messages area
  if (chatMessages) {
    chatMessages.addEventListener('dragover', (e) => {
      if (!supportsVision()) return;
      const hasImage = [...(e.dataTransfer?.types || [])].includes('Files');
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        chatMessages.classList.add('chat-drop-active');
      }
    });
    chatMessages.addEventListener('dragleave', (e) => {
      const relatedTarget = /** @type {Node | null} */ (e.relatedTarget);
      if (!relatedTarget || !chatMessages.contains(relatedTarget)) {
        chatMessages.classList.remove('chat-drop-active');
      }
    });
    chatMessages.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chatMessages.classList.remove('chat-drop-active');
      if (!supportsVision()) return;
      const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
      for (const file of files) addImageAttachment(file);
    });
  }

  // File input change
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      for (const file of input.files || []) {
        addImageAttachment(file);
      }
      input.value = '';
    });
  }
}

// HTML onclicks call these names directly; main.js / chat.js init also
// wires initChatImageHandlers() on DOMContentLoaded.
Object.assign(window, {
  toggleHDMode,
  addImageAttachment,
  removeImageAttachment,
  renderAttachmentPreview,
  openImageLightbox,
  clearAttachments,
  updateAttachButtonVisibility,
  initChatImageHandlers,
});
