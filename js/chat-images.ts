// Attachment processing, ephemeral profile/thread queues and health-file imports.
// Shared Svelte components own previews, inputs, drop feedback and the lightbox.
// The configured send-button callback is the only back-reference into chat-send.

import { showConfirmDialog, showNotification } from './utils.js';
import { imageFileToBase64, isValidImageType } from './image-utils.js';
import { hasAIProvider, supportsVision, getAIProvider, getActiveModelId } from './api.js';
import { openChatImageLightbox } from './chat-image-lightbox-component.js';
import { ChatAttachmentDrafts, type ChatAttachment } from './chat-attachment-drafts.js';
import { configureChatAttachmentActions, publishChatAttachments, captureChatAttachmentOwner } from './chat-attachment-view.js';
export type { ChatAttachment } from './chat-attachment-drafts.js';
import { state } from './state.js';
import { isCodexChatBackend } from './chat-backend-selection.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { handleImportInputChange } from './import-file-input.js';

const MAX_ATTACHMENTS = 5;
const MAX_AGENT_ATTACHMENTS = 4;
const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const THUMB_SIZE = 80;
const pendingAttachmentsByThread = new ChatAttachmentDrafts();
const sentMessageAttachments = new WeakMap<object, ChatAttachment[]>();
const chatImageDeps: { updateSendButtonState: unknown; importFiles: unknown; } = {
  updateSendButtonState: () => { },
  importFiles: (files: File[]) => handleImportInputChange({ target: { files, value: '' } }),
};

export function configureChatImages(deps: unknown = {}) {
  if (typeof (deps as { updateSendButtonState?: unknown; }).updateSendButtonState === 'function') {
    chatImageDeps.updateSendButtonState = (deps as { updateSendButtonState?: unknown; }).updateSendButtonState;
  }
  if (typeof (deps as { importFiles?: unknown; }).importFiles === 'function') {
    chatImageDeps.importFiles = (deps as { importFiles?: unknown; }).importFiles;
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
  return new Promise<{ width: number; height: number; }>((resolve, reject) => {
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
  const owns = captureChatAttachmentOwner();
  const scopeIsCurrent = () => owns() && scope === attachmentDraftKey();
  const selectedFiles = Array.from(files || []);
  if (selectedFiles.length === 0) return;
  const imageFiles = canAttachImages() ? selectedFiles.filter(isChatImageFile) : [];
  const importFiles = selectedFiles.filter(file => !imageFiles.includes(file));
  for (const file of imageFiles) {
    if (!scopeIsCurrent()) return;
    if (!canAttachImages()) { importFiles.push(file); continue; }
    await addImageAttachment(file);
  }
  if (!scopeIsCurrent()) return;
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

  const getHandle = (item as DataTransferItem & { getAsFileSystemHandle?: unknown; }).getAsFileSystemHandle;
  if (typeof getHandle === 'function') {
    try {
      const handleRequest = (getHandle as (this: DataTransferItem) => unknown).call(item);
      reads.push(Promise.resolve(handleRequest).then(async handle => {
        if (!handle || (handle as { kind?: unknown; }).kind !== 'file' || typeof (handle as { getFile?: unknown; }).getFile !== 'function') {
          throw new Error('The dropped item is not a readable file.');
        }
        return snapshotDroppedFile(await (handle as { getFile(): File | PromiseLike<File>; }).getFile());
      }));
    } catch (_) { }
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
    } catch (_) { }
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
  const owns = captureChatAttachmentOwner();
  const scopeIsCurrent = () => owns() && scope === attachmentDraftKey();
  const fileItems = 'items' in source
    ? Array.from(source.items || []).filter(item => item.kind === 'file')
    : [];
  const reads = fileItems.length
    ? fileItems.map(readDroppedItem)
    : Array.from('files' in source ? source.files : source).map(snapshotDroppedFile);
  try {
    const files = (await Promise.all(reads));
    if (!scopeIsCurrent()) return;
    await handleChatFiles(files);
  } catch (error) {
    if (!scopeIsCurrent()) return;
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
    if (!chooseFile || !scopeIsCurrent()) return;
    const input = document.getElementById('chat-file-input');
    if (input instanceof HTMLInputElement) input.click();
    else showNotification('The file picker is unavailable. Reload the app and try again.', 'error');
  }
}

function attachmentDraftKey(threadId: unknown = state.currentThreadId) {
  return `${state.currentProfile || 'default'}:${threadId || 'unassigned'}`;
}

function currentAttachmentDraft({ create = true } = {}) {
  return pendingAttachmentsByThread.get(attachmentDraftKey(), create);
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
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
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
  const scope = attachmentDraftKey();
  const attachmentLimit = currentAttachmentLimit();
  const reservation = pendingAttachmentsByThread.reserve(scope, file.size, attachmentLimit, MAX_TOTAL_ATTACHMENT_BYTES);
  if (reservation === 'count') {
    showNotification(`Maximum ${attachmentLimit} images per message`, 'error'); return;
  }
  if (reservation === 'bytes') {
    showNotification('Photos can be up to 18 MB total per message. The original files are not compressed.', 'error', 6000); return;
  }
  const capability = canAttachImages();
  const owns = captureChatAttachmentOwner();
  const route = () => isCodexChatBackend() ? JSON.stringify(getAssistantExecutionRoute()) : JSON.stringify([getAIProvider(), getActiveModelId()]);
  const originRoute = route();
  const current = () => owns() && originRoute === route() && scope === attachmentDraftKey() && pendingAttachmentsByThread.current(reservation)
    && capability === canAttachImages() && attachmentLimit === currentAttachmentLimit();
  try {
    const [{ width, height }, base64] = await Promise.all([
      readImageDimensions(file),
      imageFileToBase64(file),
    ]);
    if (!current()) return;
    const mediaType = file.type;
    const previewUrl = `data:${mediaType};base64,${base64}`;
    const thumbUrl = await makeThumbnail(previewUrl, width, height);
    if (!current() || !pendingAttachmentsByThread.commit(reservation,
      { base64, mediaType, name: file.name, previewUrl, thumbUrl, sizeBytes: file.size },
      currentAttachmentLimit(), MAX_TOTAL_ATTACHMENT_BYTES)) return;
    refreshAttachmentDraft();
    const longSide = Math.max(width, height);
    if (longSide < 512) {
      showNotification(`Low resolution image (${width}×${height}). AI may struggle with fine details.`, 'info', 5000);
    }
  } catch (e) {
    const error = e as { message?: unknown; };
    if (current()) showNotification('Failed to process image: ' + error.message, 'error');
  } finally { pendingAttachmentsByThread.release(reservation); }
}

export function removeImageAttachment(index: number) {
  currentAttachmentDraft().splice(index, 1);
  renderAttachmentPreview();
  (chatImageDeps.updateSendButtonState as () => unknown)();
}

export function renderAttachmentPreview() {
  publishChatAttachments({
    scope: attachmentDraftKey(), attachments: [...currentAttachmentDraft({ create: false })],
    limit: currentAttachmentLimit(), canAttach: canAttachImages()
  });
}

export function openImageLightbox(src: unknown) { openChatImageLightbox(src); }

export function clearAttachments(threadId: unknown = state.currentThreadId) {
  pendingAttachmentsByThread.delete(attachmentDraftKey(threadId));
  refreshAttachmentDraft();
}

/** Remove only the submitted objects, retaining attachments added during a save. */
export function consumeAttachments(attachments: Iterable<unknown> | null | undefined) {
  pendingAttachmentsByThread.consume(attachmentDraftKey(), attachments);
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
  pendingAttachmentsByThread.replace(
    attachmentDraftKey(),
    attachments.map(attachment => ({ ...attachment })),
  );
  refreshAttachmentDraft();
  return true;
}

// Compatibility entrypoints publish into the currently owned component.
export function updateAttachButtonVisibility() { renderAttachmentPreview(); }
export function initChatImageHandlers() { refreshAttachmentDraft(); }

configureChatAttachmentActions({
  files: files => handleChatFiles(files),
  drop: source => handleDroppedChatFiles(source),
  remove(attachment, scope) {
    if (scope !== attachmentDraftKey()) return;
    const index = currentAttachmentDraft({ create: false }).indexOf(attachment);
    if (index >= 0) removeImageAttachment(index);
  },
}, renderAttachmentPreview);
