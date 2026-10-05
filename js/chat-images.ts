// chat-images.js — Chat panel attachment and health-file import flow
//
// Extracted from chat.js (v1.21.9) as the first Phase 2e refactor split.
// Owns the pending-attachment queue, paste/drop/picker handlers, original
// image reads, and thumbnail generation. Exposes a small interface so
// chat.js can read the queue when sending and clear it afterwards.
//
// The only back-reference into chat-send.js is the configured
// updateSendButtonState callback invoked when the queue changes.

import { escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { imageFileToBase64, isValidImageType } from './image-utils.js';
import { hasAIProvider, supportsVision } from './api.js';
import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { state } from './state.js';
import { isCodexChatBackend } from './chat-backend-selection.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { handleImportInputChange } from './import-file-input.js';

const MAX_ATTACHMENTS = 5;
const MAX_AGENT_ATTACHMENTS = 4;
const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const THUMB_SIZE = 80;
// Restored or programmatically queued message copies retain their opaque leaves.
export interface ChatAttachment {
  base64?: unknown; mediaType?: unknown; name?: unknown; previewUrl?: unknown;
  thumbUrl?: unknown; sizeBytes?: unknown; [key: string]: unknown;
}
const pendingAttachmentsByThread = new Map<string, ChatAttachment[]>();
const sentMessageAttachments = new WeakMap<object, ChatAttachment[]>();
let chatMenuDismissInstalled = false;
const chatImageDeps: { updateSendButtonState: unknown; importFiles: unknown } = {
  updateSendButtonState: () => {},
  importFiles: (files: File[]) => handleImportInputChange({ target: { files, value: '' } }),
};

export function configureChatImages(deps: unknown = {}) {
  if (typeof (deps as { updateSendButtonState?: unknown }).updateSendButtonState === 'function') {
    chatImageDeps.updateSendButtonState = (deps as { updateSendButtonState?: unknown }).updateSendButtonState;
  }
  if (typeof (deps as { importFiles?: unknown }).importFiles === 'function') {
    chatImageDeps.importFiles = (deps as { importFiles?: unknown }).importFiles;
  }
}

function canAttachImages() {
  return isCodexChatBackend()
    ? getAssistantExecutionRoute().inputModalities?.includes('image') === true
    : hasAIProvider() && supportsVision();
}

function isChatImageFile(file: File) {
  return isValidImageType(file.type);
}

function currentAttachmentLimit() {
  return isCodexChatBackend() ? MAX_AGENT_ATTACHMENTS : MAX_ATTACHMENTS;
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error('Image dimensions are unavailable.'));
      else resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image.'));
    };
    img.src = url;
  });
}

/**
 * Images remain message attachments when the selected chat model can see
 * them. PDFs, spreadsheets, text exports, and every other file are routed to
 * getbased's reviewed import flow. If image input is unavailable, an image is
 * also offered to the import flow instead of disappearing silently.
 * @param {File[] | FileList} files
 */
export async function handleChatFiles(files: File[] | FileList | null | undefined) {
  const scope = attachmentDraftKey();
  const selectedFiles = Array.from(files || []);
  if (selectedFiles.length === 0) return;
  const imageFiles = canAttachImages() ? selectedFiles.filter(isChatImageFile) : [];
  const importFiles = selectedFiles.filter(file => !imageFiles.includes(file));
  for (const file of imageFiles) {
    if (scope !== attachmentDraftKey()) return;
    await addImageAttachment(file);
  }
  if (scope !== attachmentDraftKey()) return;
  if (importFiles.length === 0) return;
  try {
    await (chatImageDeps.importFiles as (files: File[]) => unknown)(importFiles);
  } catch (error) {
    console.error('[chat-files] import failed:', error);
    showNotification('Import failed — check the file and try again.', 'error');
  }
}

function snapshotDroppedFile(file: File) {
  return new Promise<File>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(new File([reader.result], file.name, { type: file.type, lastModified: file.lastModified }))
      : reject(new Error(`Could not read ${file.name}.`));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.onabort = () => reject(new Error(`Reading ${file.name} was interrupted.`));
    reader.readAsArrayBuffer(file);
  });
}

function readDroppedItem(item: DataTransferItem) {
  const reads: Promise<File>[] = [];
  const directFile = item.getAsFile();
  if (directFile) reads.push(snapshotDroppedFile(directFile));

  const getHandle = (item as DataTransferItem & { getAsFileSystemHandle?: unknown }).getAsFileSystemHandle;
  if (typeof getHandle === 'function') {
    try {
      const handleRequest = (getHandle as (this: DataTransferItem) => unknown).call(item);
      reads.push(Promise.resolve(handleRequest).then(async handle => {
        if (!handle || (handle as { kind?: unknown }).kind !== 'file' || typeof (handle as { getFile?: unknown }).getFile !== 'function') {
          throw new Error('The dropped item is not a readable file.');
        }
        return snapshotDroppedFile(await (handle as { getFile(): File | PromiseLike<File> }).getFile());
      }));
    } catch (_) {}
  }

  const getEntry = item.webkitGetAsEntry;
  if (typeof getEntry === 'function') {
    try {
      const entry = getEntry.call(item);
      if (entry?.isFile && typeof (entry as FileSystemFileEntry).file === 'function') {
        reads.push(new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(file => snapshotDroppedFile(file).then(resolve, reject), reject);
        }));
      }
    } catch (_) {}
  }
  return reads.length ? Promise.any(reads) : Promise.reject(new Error('The dropped item is not a readable file.'));
}

/**
 * Files supplied by OS drag-and-drop can be backed by a short-lived portal or
 * file-manager handle. Acquire every available browser handle before the drop
 * event returns, then continue with ordinary in-memory Files that survive lazy
 * PDF loading.
 * @param {DataTransfer | File[] | FileList} source
 */
export async function handleDroppedChatFiles(source: DataTransfer | File[] | FileList) {
  const scope = attachmentDraftKey();
  const fileItems = 'items' in source
    ? Array.from(source.items || []).filter(item => item.kind === 'file')
    : [];
  const reads = fileItems.length
    ? fileItems.map(readDroppedItem)
    : Array.from('files' in source ? source.files : source).map(snapshotDroppedFile);
  try {
    const files = (await Promise.all(reads));
    if (scope !== attachmentDraftKey()) return;
    await handleChatFiles(files);
  } catch (error) {
    if (scope !== attachmentDraftKey()) return;
    console.debug('[chat-files] Browser did not grant access to the dropped file:', error);
    const chromiumOnLinux = /Linux/i.test(navigator.userAgent)
      && /(?:Chrome|Chromium|Edg)\//i.test(navigator.userAgent);
    const platformHint = chromiumOnLinux
      ? ' Chrome on Linux/Wayland may require its Ozone platform to be set to X11 for file drag-and-drop.'
      : '';
    const chooseFile = await showConfirmDialog(
      `Your browser could not read this dropped file. Choose it from the file picker to continue.${platformHint}`,
      { confirmLabel: 'Choose file', cancelLabel: 'Cancel', tone: 'primary', ariaLabel: 'Choose dropped file' },
    );
    if (!chooseFile || scope !== attachmentDraftKey()) return;
    const input = document.getElementById('chat-file-input');
    if (input instanceof HTMLInputElement) input.click();
    else showNotification('The file picker is unavailable. Reload the app and try again.', 'error');
  }
}

function attachmentDraftKey(threadId: unknown = state.currentThreadId) {
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
function makeThumbnail(previewUrl: string, width: number, height: number) {
  return new Promise<string | null>(resolve => {
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

export async function addImageAttachment(file: File) {
  if (!isValidImageType(file.type)) {
    showNotification('Unsupported image type. Use JPEG, PNG, GIF, or WebP.', 'error');
    return;
  }
  const pendingAttachments = currentAttachmentDraft();
  const attachmentLimit = currentAttachmentLimit();
  if (pendingAttachments.length >= attachmentLimit) {
    showNotification(`Maximum ${attachmentLimit} images per message`, 'error');
    return;
  }
  const queuedBytes = pendingAttachments.reduce((total, attachment) => total + ((attachment.sizeBytes || 0) as number), 0);
  if (!file.size || file.size + queuedBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    showNotification('Photos can be up to 18 MB total per message. The original files are not compressed.', 'error', 6000);
    return;
  }
  try {
    const [{ width, height }, base64] = await Promise.all([
      readImageDimensions(file),
      imageFileToBase64(file),
    ]);
    const mediaType = file.type;
    const previewUrl = `data:${mediaType};base64,${base64}`;
    const thumbUrl = await makeThumbnail(previewUrl, width, height);
    pendingAttachments.push({ base64, mediaType, name: file.name, previewUrl, thumbUrl, sizeBytes: file.size });
    renderAttachmentPreview();
    (chatImageDeps.updateSendButtonState as () => unknown)();
    const longSide = Math.max(width, height);
    if (longSide < 512) {
      showNotification(`Low resolution image (${width}×${height}). AI may struggle with fine details.`, 'info', 5000);
    }
  } catch (e) {
    const error = e as { message?: unknown };
    showNotification('Failed to process image: ' + error.message, 'error');
  }
}

export function removeImageAttachment(index: number) {
  currentAttachmentDraft().splice(index, 1);
  renderAttachmentPreview();
  (chatImageDeps.updateSendButtonState as () => unknown)();
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
  `<span class="chat-attach-count">${pendingAttachments.length}/${currentAttachmentLimit()}</span>`;
}

export function openImageLightbox(src: unknown) {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'chat-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Attached image preview');
  const img = document.createElement('img');
  img.src = src as string;
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
  const onKeydown = (e: KeyboardEvent) => {
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

export function clearAttachments(threadId: unknown = state.currentThreadId) {
  pendingAttachmentsByThread.delete(attachmentDraftKey(threadId));
  renderAttachmentPreview();
}

/** Remove only the submitted objects, retaining attachments added during a save. */
export function consumeAttachments(attachments: Iterable<unknown> | null | undefined) {
  const draft = currentAttachmentDraft({ create: false });
  const submitted = new Set(attachments);
  pendingAttachmentsByThread.set(attachmentDraftKey(), draft.filter(attachment => !submitted.has(attachment)));
  refreshAttachmentDraft();
}

export function deleteAttachmentDraft(threadId: unknown) {
  pendingAttachmentsByThread.delete(attachmentDraftKey(threadId));
  if (threadId === state.currentThreadId) refreshAttachmentDraft();
}

export function refreshAttachmentDraft() {
  renderAttachmentPreview();
  (chatImageDeps.updateSendButtonState as () => unknown)();
}

export function rememberMessageAttachments(message: unknown, attachments: unknown) {
  if (!message || typeof message !== 'object' || !Array.isArray(attachments) || !attachments.length) return;
  sentMessageAttachments.set(message, (attachments as unknown[]).map(attachment => ({ ...(attachment as object) })));
}

export function getMessageAttachments(message: unknown) {
  const attachments = message && typeof message === 'object' ? sentMessageAttachments.get(message) : null;
  return attachments ? attachments.map(attachment => ({ ...attachment })) : [];
}

export function restoreMessageAttachments(message: unknown) {
  const attachments = getMessageAttachments(message);
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
  const photoAction = (document.getElementById('chat-add-photo-action') as HTMLButtonElement | null);
  if (photoAction) photoAction.hidden = !canAttachImages();
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('getbased:agent-model-catalog-changed', updateAttachButtonVisibility);
  globalThis.addEventListener('labcharts-ai-settings-local-changed', updateAttachButtonVisibility);
}

export function initChatImageHandlers() {
  const textarea = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const chatDropZone = document.querySelector('.chat-panel-conversation') as HTMLElement | null;
  const chatDropOverlay = document.getElementById('chat-drop-overlay');
  const fileInput = document.getElementById('chat-image-input');
  const fallbackFileInput = document.getElementById('chat-file-input');

  if (!chatMenuDismissInstalled) {
    chatMenuDismissInstalled = true;
    document.addEventListener('click', event => {
      const menu = document.getElementById('chat-context-menu') as HTMLDetailsElement | null;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const menu = document.getElementById('chat-context-menu') as HTMLDetailsElement | null;
      if (!menu?.open) return;
      menu.open = false;
      menu.querySelector<HTMLElement>('summary')?.focus();
    });
  }

  // Paste handler
  if (textarea && textarea.dataset.chatFilePasteBound !== 'true') {
    textarea.dataset.chatFilePasteBound = 'true';
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
  if (chatDropZone && chatDropZone.dataset.chatFileDropBound !== 'true') {
    chatDropZone.dataset.chatFileDropBound = 'true';
    const setDropActive = (active: boolean) => {
      chatDropZone.classList.toggle('chat-drop-active', active);
      if (chatDropOverlay) chatDropOverlay.hidden = !active;
    };
    chatDropZone.addEventListener('dragover', (e) => {
      const dragEvent = e as DragEvent;
      const hasFiles = [...(dragEvent.dataTransfer?.types || [])].includes('Files');
      if (hasFiles) {
        dragEvent.preventDefault();
        dragEvent.stopPropagation();
        if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'copy';
        setDropActive(true);
      }
    });
    chatDropZone.addEventListener('dragleave', (e) => {
      const relatedTarget = (e as DragEvent).relatedTarget as Node | null;
      if (!relatedTarget || !chatDropZone.contains(relatedTarget)) {
        setDropActive(false);
      }
    });
    chatDropZone.addEventListener('drop', (e) => {
      const dragEvent = e as DragEvent;
      if (dragEvent.defaultPrevented) return;
      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      setDropActive(false);
      if (dragEvent.dataTransfer) void handleDroppedChatFiles(dragEvent.dataTransfer);
    });
  }

  // File input change
  if (fileInput && fileInput.dataset.chatFilePickerBound !== 'true') {
    fileInput.dataset.chatFilePickerBound = 'true';
    fileInput.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      void handleChatFiles(files).finally(() => { input.value = ''; });
    });
  }
  if (fallbackFileInput && fallbackFileInput.dataset.chatFilePickerBound !== 'true') {
    fallbackFileInput.dataset.chatFilePickerBound = 'true';
    fallbackFileInput.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      void handleChatFiles(files).finally(() => { input.value = ''; });
    });
  }
}
