// chat.js — AI chat panel, markdown rendering, personalities, conversation threads

import { state } from './state.js';
import { CHAT_PERSONALITIES, CHAT_SYSTEM_PROMPT, LATITUDE_BANDS } from './constants.js';
import { calculateCost, formatCost, trackUsage, SBM_2015_THRESHOLDS, getEMFSeverity } from './schema.js';
import { escapeHTML, showNotification, showConfirmDialog, isDebugMode, formatValue, getStatus, hasCardContent } from './utils.js';
import { formatTime } from './theme.js';
import { getActiveData, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, getAllFlaggedMarkers, saveImportedData } from './data.js';
import { encryptedSetItem, encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { getProfileLocation, setProfileLocation, getLatitudeFromLocation, getLocationCache, latitudeToBand, detectLatitudeWithAI, getProfiles, renameProfile, setProfileSex, setProfileDob } from './profile.js';
import { callClaudeAPI, hasAIProvider, isAIPaused, setAIPaused, getAIProvider, getAnthropicModel, getVeniceModel, getOpenRouterModel, /* ROUTSTR DISABLED: getRoutstrModel, */ getOllamaMainModel, getActiveModelId, getActiveModelDisplay, supportsVision } from './api.js';
import { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } from './image-utils.js';
import { getBloodDrawPhases, getNextBestDrawDate, detectPerimenopausePattern, detectCycleIronAlerts } from './cycle.js';

// ═══════════════════════════════════════════════
// ABORT CONTROLLER (stop streaming)
// ═══════════════════════════════════════════════
let _chatAbortController = null;

// ═══════════════════════════════════════════════
// TYPEWRITER — smooth character trickle for streaming
// ═══════════════════════════════════════════════
function createTypewriter(el, typingEl, container) {
  let target = '';
  let displayed = 0;
  let timer = null;
  let autoScrollLocked = false;

  function scrollToBottom() {
    container.scrollTop = container.scrollHeight;
  }

  function isNearBottom() {
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < 80;
  }

  function onWheel(e) {
    // If user scrolls upward while AI is typing, stop auto-scroll immediately
    if (e.deltaY < 0) {
      autoScrollLocked = true;
    }
  }

  function onTouchMove() {
    // Mobile/manual scroll should also lock auto-scroll
    autoScrollLocked = true;
  }

  function onMouseDown() {
    // If user grabs scrollbar, assume manual control
    autoScrollLocked = true;
  }

  function onScroll() {
    // If user comes back near bottom, allow auto-scroll again
    if (isNearBottom()) {
      autoScrollLocked = false;
    }
  }

  container.addEventListener('wheel', onWheel, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: true });
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('scroll', onScroll, { passive: true });

  function cleanup() {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('scroll', onScroll);
  }

  function tick() {
    if (displayed >= target.length) {
      timer = null;
      return;
    }

    const behind = target.length - displayed;
    const batch = Math.max(1, Math.ceil(behind * 0.3));
    displayed = Math.min(displayed + batch, target.length);

    if (typingEl.parentNode) typingEl.remove();
    if (!el.parentNode) container.appendChild(el);

    el.textContent = target.slice(0, displayed);

    if (!autoScrollLocked) {
      scrollToBottom();
    }

    timer = setTimeout(tick, 16);
  }

  return {
    update(text) {
      target = text;
      if (!timer) tick();
    },
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      displayed = target.length;
      cleanup();
    }
  };
}

// ═══════════════════════════════════════════════
// IMAGE ATTACHMENTS
// ═══════════════════════════════════════════════
const MAX_ATTACHMENTS = 5;
const THUMB_SIZE = 80;
let _pendingAttachments = []; // { base64, mediaType, name, previewUrl }
let _hdMode = localStorage.getItem('labcharts-hd-images') === 'true';

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

export function toggleHDMode() {
  _hdMode = !_hdMode;
  localStorage.setItem('labcharts-hd-images', _hdMode);
  const btn = document.getElementById('chat-hd-btn');
  if (btn) {
    btn.classList.toggle('active', _hdMode);
    btn.title = hdTitle();
  }
}

function hdTitle() {
  return _hdMode ? 'HD quality (2048px) — click for standard' : 'Standard quality (1024px) — click for HD';
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
    updateSendButtonState();
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
    showNotification('Failed to process image: ' + e.message, 'error');
  }
}

export function removeImageAttachment(index) {
  _pendingAttachments.splice(index, 1);
  renderAttachmentPreview();
  updateSendButtonState();
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
  overlay.addEventListener('click', () => overlay.remove());
  const close = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', close); } };
  document.addEventListener('keydown', close);
  document.body.appendChild(overlay);
}

export function clearAttachments() {
  _pendingAttachments = [];
  renderAttachmentPreview();
}

function updateSendButtonState() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!sendBtn) return;
  const hasContent = (input && input.value.trim()) || _pendingAttachments.length > 0;
  sendBtn.disabled = !hasContent && !_chatAbortController;
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
      const hasImage = [...e.dataTransfer.types].includes('Files');
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        chatMessages.classList.add('chat-drop-active');
      }
    });
    chatMessages.addEventListener('dragleave', (e) => {
      if (!chatMessages.contains(e.relatedTarget)) {
        chatMessages.classList.remove('chat-drop-active');
      }
    });
    chatMessages.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chatMessages.classList.remove('chat-drop-active');
      if (!supportsVision()) return;
      const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
      for (const file of files) addImageAttachment(file);
    });
  }

  // File input change
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      for (const file of e.target.files) {
        addImageAttachment(file);
      }
      e.target.value = '';
    });
  }
}

// ═══════════════════════════════════════════════
// THREAD STORAGE HELPERS
// ═══════════════════════════════════════════════
const MAX_THREADS = 50;

export function getChatThreadsKey() {
  return `labcharts-${state.currentProfile}-chat-threads`;
}

export function getChatThreadKey(threadId) {
  return `labcharts-${state.currentProfile}-chat-t_${threadId}`;
}

function generateThreadId() {
  return 't_' + Date.now().toString(36);
}

// ═══════════════════════════════════════════════
// THREAD INDEX CRUD
// ═══════════════════════════════════════════════
export function loadChatThreads() {
  const raw = localStorage.getItem(getChatThreadsKey());
  if (raw) {
    try {
      state.chatThreads = JSON.parse(raw);
    } catch { state.chatThreads = []; }
  } else {
    // Migration: convert legacy flat chat array to a thread
    state.chatThreads = [];
    const legacyKey = `labcharts-${state.currentProfile}-chat`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      try {
        const messages = JSON.parse(legacyRaw);
        if (Array.isArray(messages) && messages.length > 0) {
          const threadId = 't_migrated';
          const now = new Date().toISOString();
          state.chatThreads = [{
            id: threadId,
            name: 'Previous Chat',
            createdAt: now,
            updatedAt: now,
            messageCount: messages.length,
            personality: state.currentChatPersonality || 'default'
          }];
          // Write per-thread messages (plaintext — encryption handled by save)
          localStorage.setItem(getChatThreadKey(threadId), legacyRaw);
          saveChatThreadIndex();
          // Leave legacy key in place for rollback safety
        }
      } catch {}
    }
  }
}

export function saveChatThreadIndex() {
  localStorage.setItem(getChatThreadsKey(), JSON.stringify(state.chatThreads));
}

export function ensureActiveThread() {
  if (state.currentThreadId) {
    const exists = state.chatThreads.find(t => t.id === state.currentThreadId);
    if (exists) return;
  }
  // Pick most recent thread or create new
  if (state.chatThreads.length > 0) {
    const sorted = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    state.currentThreadId = sorted[0].id;
  } else {
    createNewThread();
  }
}

export function createNewThread() {
  const id = generateThreadId();
  const now = new Date().toISOString();
  const p = getActivePersonality();
  const thread = {
    id,
    name: 'New Conversation',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    personality: state.currentChatPersonality || 'default',
    personalityName: p.name,
    personalityIcon: p.icon
  };
  state.chatThreads.unshift(thread);
  pruneOldThreads();
  saveChatThreadIndex();
  cleanupDiscussionState();
  // Reset to default personality for new thread
  state.currentChatPersonality = 'default';
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
  state.currentThreadId = id;
  state.chatHistory = [];
  renderChatMessages();
  updateChatHeaderTitle();
  updatePersonalityBar();
  renderThreadList();
  // Focus input
  const input = document.getElementById('chat-input');
  if (input) input.focus();
}

export async function switchToThread(threadId) {
  if (threadId === state.currentThreadId) return;
  // Save current thread messages
  await saveChatHistory();
  cleanupDiscussionState();
  // Switch
  state.currentThreadId = threadId;
  await loadChatHistory();
  // Update thread personality
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (thread && thread.personality) {
    state.currentChatPersonality = thread.personality;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, thread.personality);
    updateChatHeaderTitle();
    updatePersonalityBar();
  }
  // Restore discussion state if this thread had an active discussion
  if (thread && thread.discussionPersonas) {
    showDiscussContinuePrompt(thread.discussionPersonas, thread.discussionOriginalPersonality);
  }
  renderThreadList();
}

export function deleteThread(threadId) {
  showConfirmDialog('Delete this conversation? This cannot be undone.', () => {
    // Remove from index
    state.chatThreads = state.chatThreads.filter(t => t.id !== threadId);
    saveChatThreadIndex();
    // Remove per-thread messages
    localStorage.removeItem(getChatThreadKey(threadId));
    // If we deleted the active thread, switch
    if (state.currentThreadId === threadId) {
      if (state.chatThreads.length > 0) {
        state.currentThreadId = state.chatThreads[0].id;
        loadChatHistory();
      } else {
        createNewThread();
      }
    }
    renderThreadList();
    showNotification('Conversation deleted', 'info');
  });
}

export function renameThread(threadId, newName) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (thread && newName && newName.trim()) {
    thread.name = newName.trim().slice(0, 60);
    saveChatThreadIndex();
    renderThreadList();
  }
}

export function renameThreadPrompt(threadId) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!thread) return;
  const name = prompt('Rename conversation:', thread.name);
  if (name !== null && name.trim()) {
    renameThread(threadId, name);
  }
}

export function autoNameThread(threadId, firstMessage) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!thread || thread.name !== 'New Conversation') return;
  // Extract first 40 chars from the message, trimmed at word boundary
  let excerpt = firstMessage.replace(/\s+/g, ' ').trim();
  if (excerpt.length > 40) {
    excerpt = excerpt.slice(0, 40);
    const lastSpace = excerpt.lastIndexOf(' ');
    if (lastSpace > 20) excerpt = excerpt.slice(0, lastSpace);
    excerpt += '\u2026';
  }
  thread.name = excerpt;
  saveChatThreadIndex();
  renderThreadList();
}

export function pruneOldThreads() {
  if (state.chatThreads.length <= MAX_THREADS) return;
  // Sort by updatedAt desc, remove oldest
  const sorted = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const toRemove = sorted.slice(MAX_THREADS);
  for (const t of toRemove) {
    localStorage.removeItem(getChatThreadKey(t.id));
  }
  state.chatThreads = sorted.slice(0, MAX_THREADS);
  saveChatThreadIndex();
  if (toRemove.length > 0) {
    showNotification(`Pruned ${toRemove.length} old conversation(s)`, 'info');
  }
}

// ═══════════════════════════════════════════════
// THREAD RAIL UI
// ═══════════════════════════════════════════════
export function renderThreadList(filter) {
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  let threads = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (filter && filter.trim()) {
    const q = filter.toLowerCase().trim();
    threads = threads.filter(t => t.name.toLowerCase().includes(q));
  }
  if (threads.length === 0) {
    list.innerHTML = '<div style="padding:12px 10px;font-size:11px;color:var(--text-muted);text-align:center">' +
      (filter ? 'No matching conversations' : 'No conversations yet') + '</div>';
    return;
  }
  const personalityMap = {};
  for (const p of CHAT_PERSONALITIES) personalityMap[p.id] = p.icon;

  list.innerHTML = threads.map(t => {
    const isActive = t.id === state.currentThreadId;
    const date = new Date(t.updatedAt);
    const dateStr = formatThreadDate(date);
    const icon = t.personalityIcon || personalityMap[t.personality] || personalityMap.default || '';
    const iconTitle = t.personalityName ? ` title="${escapeHTML(t.personalityName)}"` : '';
    return `<div class="chat-thread-item${isActive ? ' active' : ''}" onclick="switchToThread('${escapeHTML(t.id)}')" data-thread-id="${escapeHTML(t.id)}">
      <div class="chat-thread-item-name">${escapeHTML(t.name)}</div>
      <div class="chat-thread-item-meta">
        <span${iconTitle}>${icon}</span>
        <span>${dateStr}</span>
        <span>${t.messageCount} msg${t.messageCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="chat-thread-item-actions">
        <button class="chat-thread-item-action" onclick="event.stopPropagation();renameThreadPrompt('${escapeHTML(t.id)}')" title="Rename">&#9998;</button>
        <button class="chat-thread-item-action delete" onclick="event.stopPropagation();deleteThread('${escapeHTML(t.id)}')" title="Delete">&#10005;</button>
      </div>
    </div>`;
  }).join('');
}

function formatThreadDate(date) {
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function filterThreadList(value) {
  renderThreadList(value);
}

export function toggleThreadRail() {
  const rail = document.getElementById('chat-thread-rail');
  if (!rail) return;
  const isOpen = rail.classList.toggle('open');
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`, isOpen ? 'true' : 'false');
}

function restoreRailState() {
  const rail = document.getElementById('chat-thread-rail');
  if (!rail) return;
  const saved = localStorage.getItem(`labcharts-${state.currentProfile}-chatRailOpen`);
  if (saved === 'true') {
    rail.classList.add('open');
  } else {
    rail.classList.remove('open');
  }
}

// ═══════════════════════════════════════════════
// LAB CONTEXT (unchanged)
// ═══════════════════════════════════════════════
export function buildLabContext() {
  const data = getActiveData();
  const hasLabData = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate);
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sexLabel = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'not specified';
  const age = state.profileDob ? Math.floor((new Date() - new Date(state.profileDob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const unitLabel = state.unitSystem === 'US' ? 'US conventional' : 'SI';

  let ctx;
  if (hasLabData) {
    ctx = `Lab data for current profile (sex: ${sexLabel}${age !== null ? ', age: ' + age : ''}, unit system: ${unitLabel}, today: ${today}, dates: ${data.dateLabels.join(', ')}):\n\n`;
  } else {
    const missingDemo = [];
    if (sexLabel === 'not specified') missingDemo.push('sex');
    if (age === null) missingDemo.push('date of birth');
    const demoWarning = missingDemo.length > 0
      ? ` IMPORTANT: ${missingDemo.join(' and ')} not set — urge the user to set ${missingDemo.length > 1 ? 'these' : 'this'} in Settings first, as it directly affects which tests to recommend and how to interpret results.`
      : '';
    ctx = `Profile context (sex: ${sexLabel}${age !== null ? ', age: ' + age : ''}, today: ${today}):\n\nNo lab data has been imported yet.\nNOTE: The user has not imported any lab results. Use their profile context below to recommend which blood panels and specific tests would be most valuable for them, and explain why each is relevant to their situation. The more cards the user fills out (there are 9 total), the more targeted your recommendations become — encourage filling all of them.${demoWarning}\n\n`;
  }

  // ── Staleness signal ──
  if (hasLabData && data.dates.length > 0) {
    const lastDate = data.dates[data.dates.length - 1];
    const daysSince = Math.round((new Date() - new Date(lastDate + 'T00:00:00')) / (24 * 3600 * 1000));
    if (daysSince > 90) {
      const monthsAgo = Math.round(daysSince / 30.44);
      ctx += `NOTE: Most recent lab results are from ${fmtDate(lastDate)} (approximately ${monthsAgo} months ago). Values may have changed.\n\n`;
    }
  }

  // ── 1. Health Goals (top priority — "what are you trying to solve?") ──
  const healthGoals = state.importedData.healthGoals || [];
  if (healthGoals.length > 0) {
    ctx += `## Health Goals (Things to Solve)\n`;
    const byPriority = { major: [], mild: [], minor: [] };
    for (const g of healthGoals) (byPriority[g.severity] || byPriority.minor).push(g.text);
    for (const [sev, items] of Object.entries(byPriority)) {
      if (items.length > 0) {
        ctx += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Priority\n`;
        for (const t of items) ctx += `- ${t}\n`;
      }
    }
    ctx += '\n';
  }

  // ── 2. Interpretive Lens ──
  const interpretiveLens = state.importedData.interpretiveLens || '';
  if (interpretiveLens.trim()) {
    ctx += `## Interpretive Lens\n${interpretiveLens.trim()}\n\n`;
  }

  // ── 3. Lab values by category ("what do the numbers say?") ──
  if (hasLabData) {
    const rangeLabel = state.rangeMode === 'optimal' ? 'optimal' : 'reference';
    ctx += `Note: status labels below use ${rangeLabel} ranges.\n\n`;
    for (const [catKey, cat] of Object.entries(data.categories)) {
      if (cat.group && !isGroupInAIContext(cat.group)) continue;
      const markersWithData = Object.entries(cat.markers).filter(([_, m]) => m.values.some(v => v !== null));
      if (markersWithData.length === 0) continue;
      ctx += `## ${cat.label}\n`;
      for (const [key, m] of markersWithData) {
        const latestIdx = getLatestValueIndex(m.values);
        if (m.phaseRefRanges && m.phaseLabels) {
          const parts = m.values.map((v, i) => {
            if (v === null) return null;
            const phase = m.phaseLabels[i];
            const pr = m.phaseRefRanges[i];
            const dateLabel = m.singlePoint ? '' : data.dateLabels[i];
            const s = pr ? getStatus(v, pr.min, pr.max) : getStatus(v, m.refMin, m.refMax);
            const rangeStr = pr ? `${pr.min}\u2013${pr.max}` : `${m.refMin}\u2013${m.refMax}`;
            return `${dateLabel}: ${v} [${phase || '?'}, ref ${rangeStr}, ${s}]`;
          }).filter(Boolean).join(', ');
          ctx += `- ${m.name}: ${parts} ${m.unit}\n`;
        } else {
          const vals = m.singlePoint
            ? m.values.filter(v => v !== null).map(v => `${v}`).join('')
            : m.values.map((v, i) => v !== null ? `${data.dateLabels[i]}: ${v}` : null).filter(Boolean).join(', ');
          const mr = getEffectiveRangeForDate(m, latestIdx);
          const status = latestIdx !== -1 ? getStatus(m.values[latestIdx], mr.min, mr.max) : 'no data';
          const refStr = mr.min != null && mr.max != null ? `ref: ${mr.min}\u2013${mr.max}, ` : '';
          ctx += `- ${m.name}: ${vals} ${m.unit} (${refStr}status: ${status})\n`;
        }
      }
      // Per-category staleness: flag if this category's latest data is >90 days old
      const catLatestDate = cat.singleDate || (() => {
        for (let i = data.dates.length - 1; i >= 0; i--) {
          if (markersWithData.some(([_, m]) => m.values[i] !== null)) return data.dates[i];
        }
        return null;
      })();
      if (catLatestDate) {
        const catDaysSince = Math.round((new Date() - new Date(catLatestDate + 'T00:00:00')) / (24 * 3600 * 1000));
        if (catDaysSince > 90) {
          const catMonthsAgo = Math.round(catDaysSince / 30.44);
          ctx += `⚠ Last tested ~${catMonthsAgo} months ago — values may no longer reflect current status.\n`;
        }
      }
      ctx += '\n';
    }

    // ── 4. Flagged Results (quick-scan summary) ──
    const allFlags = getAllFlaggedMarkers(data);
    const flags = allFlags.filter(f => {
      const cat = data.categories[f.categoryKey];
      return !cat?.group || isGroupInAIContext(cat.group);
    });
    if (flags.length > 0) {
      ctx += `## Flagged Results (Latest)\n`;
      for (const f of flags) {
        ctx += `- ${f.name}: ${f.value} ${f.unit} (${f.status.toUpperCase()}, range: ${f.effectiveMin}\u2013${f.effectiveMax})\n`;
      }
      ctx += '\n';
    }
  }

  // ── 5. User Notes ──
  const notes = (state.importedData.notes || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (notes.length > 0) {
    ctx += `## User Notes\n`;
    for (const n of notes) {
      ctx += `- ${fmtDate(n.date)}: ${n.text}\n`;
    }
    ctx += '\n';
  }

  // ── 6. Medical Conditions ("what medical context applies?") ──
  const diag = state.importedData.diagnoses;
  if (hasCardContent(diag)) {
    ctx += `## Medical Conditions / Diagnoses\n`;
    if (diag.conditions && diag.conditions.length) {
      for (const c of diag.conditions) {
        ctx += `- ${c.name} (${c.severity}${c.since ? ', since ' + c.since : ''})\n`;
      }
    }
    if (diag.note) ctx += `Notes: ${diag.note}\n`;
    ctx += '\n';
  }

  // ── 7. Supplements & Medications ──
  const supps = state.importedData.supplements || [];
  if (supps.length > 0) {
    ctx += `## Supplements & Medications\n`;
    for (const s of supps) {
      const dateRange = `${fmtDate(s.startDate)} \u2192 ${s.endDate ? fmtDate(s.endDate) : 'ongoing'}`;
      ctx += `- ${s.name}${s.dosage ? ' (' + s.dosage + ')' : ''} [${s.type}]: ${dateRange}\n`;
    }
    ctx += '\n';
  }

  // ── 8. Genetics ──
  const genetics = state.importedData.genetics;
  if (genetics && genetics.snps && Object.keys(genetics.snps).length > 0) {
    // Collect active marker keys to filter relevant SNPs
    const activeMarkerKeys = hasLabData ? Object.entries(data.categories).flatMap(([catKey, cat]) =>
      Object.entries(cat.markers).filter(([_, m]) => m.values.some(v => v !== null)).map(([key]) => `${catKey}.${key}`)
    ) : [];
    const geneticsCtx = window._buildGeneticsContext ? window._buildGeneticsContext(genetics, activeMarkerKeys) : '';
    if (geneticsCtx) {
      ctx += `${geneticsCtx}\n\n`;
    }
  }

  // ── 9. Menstrual Cycle (female only) ──
  const mc = state.importedData.menstrualCycle;
  if (mc && state.profileSex === 'female') {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    ctx += `## Menstrual Cycle\n`;
    const statusCtx = { perimenopause: 'Status: Perimenopause (irregular/transitional).', postmenopause: 'Status: Postmenopause (no active cycle).', pregnant: 'Status: Currently pregnant.', breastfeeding: 'Status: Currently breastfeeding (postpartum).', absent: 'Status: No active menstrual cycle.' };
    if (mc.cycleStatus && statusCtx[mc.cycleStatus]) {
      ctx += statusCtx[mc.cycleStatus];
    } else {
      ctx += `Profile: ${mc.cycleLength || 28}-day cycle (${mc.periodLength || 5}-day period), ${regLabel}, ${mc.flow || 'moderate'} flow.`;
    }
    if (mc.contraceptive) {
      const _hormonalBC = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection'];
      const isHormonal = _hormonalBC.some(h => mc.contraceptive.toLowerCase().includes(h));
      ctx += ` Contraceptive: ${mc.contraceptive}${isHormonal ? ' (HORMONAL — suppresses natural cycle phases; phase-specific hormone ranges do NOT apply)' : ''}.`;
    }
    if (mc.conditions) ctx += ` Conditions: ${mc.conditions}.`;
    ctx += '\n';
    const periods = (mc.periods || []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (periods.length > 0) {
      const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx += `Recent periods: ${periods.slice(0, 6).map(p => {
        let desc = `${fmtD(p.startDate)}-${fmtD(p.endDate)} (${p.flow})`;
        if (p.symptoms?.length) desc += ` [${p.symptoms.join(', ')}]`;
        return desc;
      }).join(', ')}\n`;
    }
    const _isActiveCycleCtx = !mc.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
    const _hormonalBCCtx = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection'];
    const _isHormonalBCCtx = mc.contraceptive && _hormonalBCCtx.some(h => mc.contraceptive.toLowerCase().includes(h));
    if (_isActiveCycleCtx && !_isHormonalBCCtx) {
      if (data.dates.length > 0) {
        const phases = getBloodDrawPhases(mc, data.dates);
        const phaseDates = Object.entries(phases);
        if (phaseDates.length > 0) {
          ctx += `\nBlood draw cycle context:\n`;
          for (const [date, p] of phaseDates) {
            ctx += `- ${fmtDate(date)}: Day ${p.cycleDay} (${p.phaseName} phase)\n`;
          }
        }
      }
      const drawRec = getNextBestDrawDate(mc);
      if (drawRec) {
        ctx += `\nNext optimal blood draw window: ${drawRec.description}\n`;
      }
    }
    const perimenopause = detectPerimenopausePattern(mc, state.profileDob);
    if (perimenopause) {
      ctx += `\nPERIMENOPAUSE ALERT: ${perimenopause.message}\n`;
    }
    const ironAlerts = detectCycleIronAlerts(mc, data);
    if (ironAlerts.length) {
      ctx += `\nIRON/FLOW ALERTS:\n`;
      for (const a of ironAlerts) ctx += `- ${a.message}\n`;
    }
    ctx += '\n';
  }

  // ── 9. Diet & Digestion ("what lifestyle context?") ──
  const diet = state.importedData.diet;
  if (hasCardContent(diet)) {
    ctx += `## Diet & Digestion\n`;
    const parts = [];
    if (diet.type) parts.push(`Type: ${diet.type}`);
    if (diet.pattern) parts.push(`Pattern: ${diet.pattern}`);
    if (diet.restrictions && diet.restrictions.length) parts.push(`Restrictions: ${diet.restrictions.join(', ')}`);
    if (parts.length) ctx += parts.join('. ') + '\n';
    if (diet.breakfast) ctx += `Breakfast${diet.breakfastTime ? ' (' + formatTime(diet.breakfastTime) + ')' : ''}: ${diet.breakfast}\n`;
    if (diet.lunch) ctx += `Lunch${diet.lunchTime ? ' (' + formatTime(diet.lunchTime) + ')' : ''}: ${diet.lunch}\n`;
    if (diet.dinner) ctx += `Dinner${diet.dinnerTime ? ' (' + formatTime(diet.dinnerTime) + ')' : ''}: ${diet.dinner}\n`;
    if (diet.snacks) ctx += `Snacks${diet.snacksTime ? ' (' + formatTime(diet.snacksTime) + ')' : ''}: ${diet.snacks}\n`;
    const dParts = [];
    if (diet.bowelFrequency) dParts.push(`Bowel frequency: ${diet.bowelFrequency}`);
    if (diet.stoolConsistency) dParts.push(`Stool consistency: ${diet.stoolConsistency}`);
    if (diet.bloating && diet.bloating !== 'none') dParts.push(`Bloating: ${diet.bloating}`);
    if (diet.gas && diet.gas !== 'none') dParts.push(`Gas: ${diet.gas}`);
    if (diet.acidReflux && diet.acidReflux !== 'none') dParts.push(`Acid reflux: ${diet.acidReflux}`);
    if (diet.burping && diet.burping !== 'none') dParts.push(`Burping: ${diet.burping}`);
    if (diet.nausea && diet.nausea !== 'none') dParts.push(`Nausea: ${diet.nausea}`);
    if (diet.appetite && diet.appetite !== 'normal') dParts.push(`Appetite: ${diet.appetite}`);
    if (diet.abdominalPain && diet.abdominalPain !== 'none') dParts.push(`Abdominal pain: ${diet.abdominalPain}`);
    if (diet.foodSensitivities && diet.foodSensitivities.length) dParts.push(`Food sensitivities: ${diet.foodSensitivities.join(', ')}`);
    if (dParts.length) ctx += dParts.join('. ') + '\n';
    if (diet.note) ctx += `Notes: ${diet.note}\n`;
    ctx += '\n';
  }

  // ── 10. Exercise ──
  const ex = state.importedData.exercise;
  if (hasCardContent(ex)) {
    ctx += `## Exercise & Movement\n`;
    const parts = [];
    if (ex.frequency) parts.push(`Frequency: ${ex.frequency}`);
    if (ex.types && ex.types.length) parts.push(`Types: ${ex.types.join(', ')}`);
    if (ex.intensity) parts.push(`Intensity: ${ex.intensity}`);
    if (ex.dailyMovement) parts.push(`Daily movement: ${ex.dailyMovement}`);
    ctx += parts.join('. ') + '\n';
    if (ex.note) ctx += `Notes: ${ex.note}\n`;
    ctx += '\n';
  }

  // ── 11. Sleep & Rest ──
  const sl = state.importedData.sleepRest;
  if (hasCardContent(sl)) {
    ctx += `## Sleep & Rest\n`;
    const parts = [];
    if (sl.duration) parts.push(`Duration: ${sl.duration}`);
    if (sl.quality) parts.push(`Quality: ${sl.quality}`);
    if (sl.schedule) parts.push(`Schedule: ${sl.schedule}`);
    if (sl.roomTemp) parts.push(`Room temp: ${sl.roomTemp}`);
    if (sl.issues && sl.issues.length) parts.push(`Issues: ${sl.issues.join(', ')}`);
    if (sl.environment && sl.environment.length) parts.push(`Environment: ${sl.environment.join(', ')}`);
    if (sl.practices && sl.practices.length) parts.push(`Practices: ${sl.practices.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (sl.note) ctx += `Notes: ${sl.note}\n`;
    ctx += '\n';
  }

  // ── 12. Light & Circadian ──
  const lc = state.importedData.lightCircadian;
  const autoLat = getLatitudeFromLocation();
  if (lc || autoLat) {
    ctx += `## Light & Circadian\n`;
    const parts = [];
    if (lc) {
      if (lc.amLight) parts.push(`Morning light: ${lc.amLight}`);
      if (lc.daytime) parts.push(`Daytime outdoor: ${lc.daytime}`);
      if (lc.uvExposure) parts.push(`UV exposure: ${lc.uvExposure}`);
      if (lc.evening && lc.evening.length) parts.push(`Evening light: ${lc.evening.join(', ')}`);
      if (lc.screenTime) parts.push(`Daily screen time: ${lc.screenTime}`);
      if (lc.techEnv && lc.techEnv.length) parts.push(`Tech environment: ${lc.techEnv.join(', ')}`);
      if (lc.cold) parts.push(`Cold exposure: ${lc.cold}`);
      if (lc.grounding) parts.push(`Grounding: ${lc.grounding}`);
      if (lc.mealTiming && lc.mealTiming.length) parts.push(`Meal timing: ${lc.mealTiming.join(', ')}`);
    }
    if (autoLat) parts.push(`Latitude: ${autoLat}`);
    const loc = getProfileLocation();
    if (loc.country) parts.push(`Location: ${loc.country}${loc.zip ? ' ' + loc.zip : ''}`);
    ctx += parts.join('. ') + '\n';
    if (lc && lc.note) ctx += `Notes: ${lc.note}\n`;
    ctx += '\n';
  }

  // ── 13. Stress ──
  const st = state.importedData.stress;
  if (hasCardContent(st)) {
    ctx += `## Stress\n`;
    const parts = [];
    if (st.level) parts.push(`Level: ${st.level}`);
    if (st.sources && st.sources.length) parts.push(`Sources: ${st.sources.join(', ')}`);
    if (st.management && st.management.length) parts.push(`Management: ${st.management.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (st.note) ctx += `Notes: ${st.note}\n`;
    ctx += '\n';
  }

  // ── 14. Love Life & Sexual Health ──
  const ll = state.importedData.loveLife;
  if (hasCardContent(ll)) {
    ctx += `## Love Life & Sexual Health\n`;
    const parts = [];
    if (ll.status) parts.push(`Status: ${ll.status}`);
    if (ll.relationship) parts.push(`Relationship quality: ${ll.relationship}`);
    if (ll.satisfaction) parts.push(`Satisfaction: ${ll.satisfaction}`);
    if (ll.libido) parts.push(`Libido: ${ll.libido}`);
    if (ll.frequency) parts.push(`Sexual frequency: ${ll.frequency}`);
    if (ll.orgasm) parts.push(`Orgasm: ${ll.orgasm}`);
    if (ll.concerns && ll.concerns.length) parts.push(`Concerns: ${ll.concerns.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (ll.note) ctx += `Notes: ${ll.note}\n`;
    ctx += '\n';
  }

  // ── 15. Environment ──
  const env = state.importedData.environment;
  if (hasCardContent(env)) {
    ctx += `## Environment\n`;
    const parts = [];
    if (env.setting) parts.push(`Setting: ${env.setting}`);
    if (env.climate) parts.push(`Climate: ${env.climate}`);
    if (env.water) parts.push(`Water: ${env.water}`);
    if (env.waterConcerns && env.waterConcerns.length) parts.push(`Water concerns: ${env.waterConcerns.join(', ')}`);
    if (env.emf && env.emf.length) parts.push(`EMF exposure: ${env.emf.join(', ')}`);
    if (env.emfMitigation && env.emfMitigation.length) parts.push(`EMF mitigation: ${env.emfMitigation.join(', ')}`);
    if (env.homeLight) parts.push(`Home lighting: ${env.homeLight}`);
    if (env.air && env.air.length) parts.push(`Air quality: ${env.air.join(', ')}`);
    if (env.toxins && env.toxins.length) parts.push(`Toxin exposure: ${env.toxins.join(', ')}`);
    if (env.building) parts.push(`Building: ${env.building}`);
    ctx += parts.join('. ') + '\n';
    if (env.note) ctx += `Notes: ${env.note}\n`;
    ctx += '\n';
  }

  // ── 16. EMF Assessment (sub-section of Environment) ──
  const emf = state.importedData.emfAssessment;
  if (emf && emf.assessments && emf.assessments.length > 0) {
    ctx += `### EMF Assessment (Baubiologie SBM-2015)\n`;
    const sorted = [...emf.assessments].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    ctx += `Assessment: ${fmtDate(latest.date)}${latest.label ? ' (' + latest.label + ')' : ''}${latest.consultant ? ' by ' + latest.consultant : ''}\n`;
    for (const room of latest.rooms) {
      const sleeping = room.sleeping !== false;
      ctx += `  ${room.name}${room.location ? ' (' + room.location + ')' : ''}${sleeping ? ' [sleeping area]' : ''}:\n`;
      for (const [type, m] of Object.entries(room.measurements || {})) {
        if (m && m.value != null) {
          const sev = getEMFSeverity(type, m.value, sleeping);
          const def = SBM_2015_THRESHOLDS[type];
          ctx += `    ${def.name}: ${m.value} ${m.unit}${sev ? ' — ' + sev.label : ''}\n`;
        }
      }
      if (room.sources && room.sources.length) ctx += `    Sources: ${room.sources.join(', ')}\n`;
      if (room.mitigations && room.mitigations.length) ctx += `    Mitigations: ${room.mitigations.join(', ')}\n`;
    }
    if (sorted.length > 1) ctx += `(${sorted.length - 1} earlier assessment${sorted.length > 2 ? 's' : ''} also on file)\n`;
    if (latest.interpretation && latest.interpretation.text) {
      ctx += `\nAI Interpretation (${latest.interpretation.date ? new Date(latest.interpretation.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'recent'}):\n${latest.interpretation.text}\n`;
    }
    ctx += '\n';
  }

  // ── 17. Additional Context Notes ──
  const ctxNotes = state.importedData.contextNotes || '';
  if (ctxNotes.trim()) {
    ctx += `## Additional Context Notes\n${ctxNotes.trim()}\n\n`;
  }

  return ctx;
}

// ═══════════════════════════════════════════════
// CONTEXT SUMMARY (snapshot what data areas were sent)
// ═══════════════════════════════════════════════
export function getContextSummary() {
  const areas = [];
  const data = getActiveData();
  // Lab values
  const markerCount = Object.values(data.categories).reduce((sum, cat) =>
    sum + Object.values(cat.markers).filter(m => m.values.some(v => v !== null)).length, 0);
  if (markerCount > 0) areas.push({ label: 'Lab values', detail: `${markerCount} markers` });
  // Context cards
  const diag = state.importedData.diagnoses;
  if (diag && ((diag.conditions && diag.conditions.length) || diag.note)) areas.push({ label: 'Medical Conditions', detail: diag.conditions ? `${diag.conditions.length} condition${diag.conditions.length !== 1 ? 's' : ''}` : 'notes' });
  if (state.importedData.diet) areas.push({ label: 'Diet & Digestion', detail: state.importedData.diet.type || 'filled' });
  if (state.importedData.exercise) areas.push({ label: 'Exercise', detail: state.importedData.exercise.frequency || 'filled' });
  if (state.importedData.sleepRest) areas.push({ label: 'Sleep & Rest', detail: state.importedData.sleepRest.duration || 'filled' });
  const lc = state.importedData.lightCircadian;
  const autoLat = getLatitudeFromLocation();
  if (lc || autoLat) areas.push({ label: 'Light & Circadian', detail: autoLat ? `lat ${autoLat}` : 'filled' });
  if (state.importedData.stress) areas.push({ label: 'Stress', detail: state.importedData.stress.level || 'filled' });
  if (state.importedData.loveLife) areas.push({ label: 'Love Life', detail: 'filled' });
  if (state.importedData.environment) areas.push({ label: 'Environment', detail: state.importedData.environment.setting || 'filled' });
  const emfData = state.importedData.emfAssessment;
  if (emfData && emfData.assessments && emfData.assessments.length > 0) areas.push({ label: 'EMF Assessment', detail: `${emfData.assessments.length} assessment${emfData.assessments.length !== 1 ? 's' : ''}` });
  // Goals, lens, notes
  const goals = state.importedData.healthGoals || [];
  if (goals.length > 0) areas.push({ label: 'Health Goals', detail: `${goals.length} goal${goals.length !== 1 ? 's' : ''}` });
  const lens = state.importedData.interpretiveLens || '';
  if (lens.trim()) areas.push({ label: 'Interpretive Lens', detail: 'set' });
  const ctxNotes = state.importedData.contextNotes || '';
  if (ctxNotes.trim()) areas.push({ label: 'Context Notes', detail: 'set' });
  // Cycle
  const mc = state.importedData.menstrualCycle;
  if (mc && state.profileSex === 'female') areas.push({ label: 'Menstrual Cycle', detail: `${mc.cycleLength || 28}-day` });
  // Supplements
  const supps = state.importedData.supplements || [];
  if (supps.length > 0) areas.push({ label: 'Supplements', detail: `${supps.length} item${supps.length !== 1 ? 's' : ''}` });
  // Notes
  const notes = state.importedData.notes || [];
  if (notes.length > 0) areas.push({ label: 'User Notes', detail: `${notes.length} note${notes.length !== 1 ? 's' : ''}` });
  // Flagged
  const flags = getAllFlaggedMarkers(data);
  if (flags.length > 0) areas.push({ label: 'Flagged Results', detail: `${flags.length} flagged` });
  return areas;
}

// ═══════════════════════════════════════════════
// SPECIALTY LABS IN AI CONTEXT (per-group)
// ═══════════════════════════════════════════════
export function isGroupInAIContext(groupName) {
  return localStorage.getItem(`labcharts-ai-ctx-${groupName}`) === 'on';
}

export function setGroupInAIContext(groupName, val) {
  localStorage.setItem(`labcharts-ai-ctx-${groupName}`, val ? 'on' : 'off');
}

// ═══════════════════════════════════════════════
// CHAT SOURCES (OpenAlex)
// ═══════════════════════════════════════════════
export function getChatSourcesEnabled() {
  return localStorage.getItem('labcharts-chat-sources') === 'on';
}

export function setChatSourcesEnabled(val) {
  localStorage.setItem('labcharts-chat-sources', val ? 'on' : 'off');
}

export async function searchOpenAlex(terms) {
  if (!terms || terms.length === 0) return [];
  const query = encodeURIComponent(terms.join(' '));
  try {
    const resp = await fetch(`https://api.openalex.org/works?search=${query}&per_page=5&mailto=user@getbased.health&select=id,title,authorships,publication_year,doi,cited_by_count,primary_location`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).map(w => {
      const allAuthors = (w.authorships || []).map(a => a.author?.display_name || '').filter(Boolean);
      const authorStr = allAuthors.length > 3 ? allAuthors.slice(0, 2).join(', ') + ' et al.' : allAuthors.join(', ');
      const doi = w.doi ? w.doi.replace('https://doi.org/', '') : null;
      // Fallback chain: landing page → DOI link → OpenAlex page
      const oaId = w.id ? w.id.replace('https://openalex.org/', '') : null;
      const url = w.primary_location?.landing_page_url
        || (doi ? `https://doi.org/${doi}` : null)
        || (oaId ? `https://openalex.org/${oaId}` : null);
      return {
        title: w.title || 'Untitled',
        authors: authorStr,
        year: w.publication_year,
        doi,
        url,
        citations: w.cited_by_count || 0
      };
    }).filter(s => s.url);
  } catch { return []; }
}

export function parseSearchTerms(fullText) {
  const lines = fullText.split('\n');
  // Strip backticks, markdown prefixes (>, -, *) before matching
  const cleanLine = l => l.trim().replace(/^[`>*-]+\s*/, '').replace(/`+$/, '').trim();
  const termLine = lines.findIndex(l => /^SEARCH_TERMS:\s*/i.test(cleanLine(l)));
  if (termLine === -1) return { cleanText: fullText, terms: null };
  const raw = cleanLine(lines[termLine]).replace(/^SEARCH_TERMS:\s*/i, '').trim();
  const terms = raw.split(',').map(t => t.trim()).filter(Boolean);
  const cleanLines = lines.slice(0, termLine).concat(lines.slice(termLine + 1));
  // Remove trailing empty lines
  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') cleanLines.pop();
  return { cleanText: cleanLines.join('\n'), terms: terms.length > 0 ? terms : null };
}

// ═══════════════════════════════════════════════
// ACTION BAR RENDERING
// ═══════════════════════════════════════════════
export function buildActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'assistant') return '';
  const isLast = msgIndex === state.chatHistory.length - 1;

  let html = '<div class="chat-action-bar">';
  if (isLast) {
    html += `<button class="chat-action-btn" onclick="regenerateLastMessage()" title="Regenerate response">\u21BB Regenerate</button>`;
  }
  html += `<button class="chat-action-btn" onclick="copyMessage(${msgIndex})" id="chat-copy-btn-${msgIndex}" title="Copy to clipboard">\uD83D\uDCCB Copy</button>`;
  html += '</div>';

  // Context used section
  if (msg.context && msg.context.length > 0) {
    html += `<div class="chat-context-toggle" onclick="toggleContextDetails(${msgIndex})">`;
    html += `<span class="chat-toggle-arrow" id="chat-ctx-arrow-${msgIndex}">\u25B8</span> Context used (${msg.context.length} area${msg.context.length !== 1 ? 's' : ''})`;
    html += '</div>';
    html += `<div class="chat-context-details" id="chat-ctx-details-${msgIndex}" style="display:none">`;
    for (const area of msg.context) {
      html += `<span class="chat-context-item">\u2713 ${escapeHTML(area.label)}${area.detail ? ' (' + escapeHTML(area.detail) + ')' : ''}</span>`;
    }
    html += '</div>';
  }

  // Sources section
  if (msg.sources && msg.sources.length > 0) {
    html += `<div class="chat-sources-toggle" onclick="toggleSourcesDetails(${msgIndex})">`;
    html += `<span class="chat-toggle-arrow" id="chat-src-arrow-${msgIndex}">\u25B8</span> Sources (${msg.sources.length} paper${msg.sources.length !== 1 ? 's' : ''})`;
    html += '</div>';
    html += renderSourcesSection(msg.sources, msgIndex);
  } else if (msg.sourcesPending) {
    html += '<div class="chat-sources-loading"><span class="chat-sources-shimmer"></span> Finding relevant papers\u2026</div>';
  }

  return html;
}

export function renderSourcesSection(sources, msgIndex) {
  let html = `<div class="chat-sources-details" id="chat-src-details-${msgIndex}" style="display:none">`;
  for (const s of sources) {
    const linkUrl = (s.url && /^https?:/.test(s.url)) ? s.url.replace(/"/g, '&quot;') : '#';
    html += `<div class="chat-source-item">`;
    html += `<a href="${linkUrl}" target="_blank" rel="noopener" class="chat-source-title">\uD83D\uDCC4 ${escapeHTML(s.title)}</a>`;
    const meta = [];
    if (s.authors) meta.push(escapeHTML(s.authors));
    if (s.year) meta.push(s.year);
    if (s.citations > 0) meta.push(`${s.citations} cite${s.citations !== 1 ? 's' : ''}`);
    if (meta.length > 0) html += `<div class="chat-source-meta">${meta.join(' \u00b7 ')}</div>`;
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════
export function regenerateLastMessage() {
  if (state.chatHistory.length < 2) return;
  if (_chatAbortController) return; // streaming in progress
  // Pop the last assistant message
  state.chatHistory.pop();
  // Get the last user message
  const lastUserMsg = state.chatHistory[state.chatHistory.length - 1];
  if (!lastUserMsg || lastUserMsg.role !== 'user') return;
  // Re-fill input and re-send
  const input = document.getElementById('chat-input');
  if (input) input.value = lastUserMsg.content;
  // Remove the user message too (sendChatMessage will re-add it)
  state.chatHistory.pop();
  saveChatHistory();
  renderChatMessages();
  sendChatMessage();
}

export function copyMessage(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg) return;
  const btn = document.getElementById(`chat-copy-btn-${msgIndex}`);
  if (!navigator.clipboard) { if (btn) { btn.innerHTML = '\u2717 Not supported'; setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copy'; }, 1500); } return; }
  navigator.clipboard.writeText(msg.content).then(() => {
    if (btn) {
      btn.innerHTML = '\u2713 Copied!';
      setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copy'; }, 1500);
    }
  }).catch(() => {
    if (btn) { btn.innerHTML = '\u2717 Failed'; setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copy'; }, 1500); }
  });
}

export function toggleContextDetails(msgIndex) {
  const details = document.getElementById(`chat-ctx-details-${msgIndex}`);
  const arrow = document.getElementById(`chat-ctx-arrow-${msgIndex}`);
  if (!details) return;
  const open = details.style.display !== 'none';
  details.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.textContent = open ? '\u25B8' : '\u25BE';
}

export function toggleSourcesDetails(msgIndex) {
  const details = document.getElementById(`chat-src-details-${msgIndex}`);
  const arrow = document.getElementById(`chat-src-arrow-${msgIndex}`);
  if (!details) return;
  const open = details.style.display !== 'none';
  details.style.display = open ? 'none' : 'block';
  if (arrow) arrow.textContent = open ? '\u25B8' : '\u25BE';
}

// ═══════════════════════════════════════════════
// LEGACY STORAGE KEY (for migration detection)
// ═══════════════════════════════════════════════
export function getChatStorageKey() {
  return `labcharts-${state.currentProfile}-chat`;
}

// ═══════════════════════════════════════════════
// PERSONALITY
// ═══════════════════════════════════════════════
const PERSONA_ICONS = ['🧠', '🎭', '🔮', '🌿', '⚡', '🦊', '🧬', '🌊', '🔥', '🏛️'];

export function pickPersonaIcon(name) {
  if (!name || !name.trim()) return '✏️';
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash) + name.charCodeAt(i);
  return PERSONA_ICONS[Math.abs(hash) % PERSONA_ICONS.length];
}

export function getCustomPersonalities() {
  const raw = localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`) || '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // Single object with promptText → wrap as array
    if (parsed && typeof parsed === 'object' && 'promptText' in parsed) {
      return [{ ...parsed, id: parsed.id || 'custom_migrated' }];
    }
  } catch {}
  // Legacy plain string
  return [{ id: 'custom_migrated', name: 'Custom Personality', icon: '✏️', promptText: raw, evidenceBased: false }];
}

export function saveCustomPersonalities(arr) {
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`, JSON.stringify(arr));
}

// Compat shim — returns the custom personality matching current selection, or first, or blank
export function getCustomPersonality() {
  const customs = getCustomPersonalities();
  if (state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_')) {
    const match = customs.find(p => p.id === state.currentChatPersonality);
    if (match) return match;
  }
  if (customs.length > 0) return customs[0];
  return { name: 'Custom Personality', icon: '✏️', promptText: '', evidenceBased: false };
}

export function getActivePersonality() {
  // Check if current personality is a custom one
  if (state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_')) {
    const customs = getCustomPersonalities();
    const cp = customs.find(p => p.id === state.currentChatPersonality);
    if (cp) {
      return {
        id: cp.id,
        name: cp.name,
        icon: cp.icon,
        description: 'Custom personality',
        greeting: 'Ask me about your lab results, trends, or what specific biomarkers mean.',
        promptAddition: null
      };
    }
    // Custom was deleted — fall through to default
  }
  return CHAT_PERSONALITIES.find(p => p.id === state.currentChatPersonality) || CHAT_PERSONALITIES[0];
}

export function getCustomPersonalityText() {
  return getCustomPersonality().promptText;
}

export async function setChatPersonality(id) {
  const prev = state.currentChatPersonality;
  if (prev === id) {
    // Collapse bar if same personality clicked
    const bar = document.querySelector('.chat-personality-bar');
    if (bar) bar.classList.remove('open');
    return;
  }
  _editingPersonalityId = null;
  // Switch personality in-place — keep current conversation so users can
  // get different perspectives in the same thread
  state.currentChatPersonality = id;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, id);
  // Update thread metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    thread.personality = id;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    saveChatThreadIndex();
  }
  if (state.chatHistory.length === 0) {
    renderChatMessages(); // re-render empty state with new personality greeting
  }
  renderThreadList();
  updateChatHeaderTitle();
  updatePersonalityBar();
  const personality = getActivePersonality();
  showNotification(`Switched to ${personality.name}`, 'info');
  const bar = document.querySelector('.chat-personality-bar');
  if (bar) bar.classList.remove('open');
}

export function loadChatPersonality() {
  const saved = localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`);
  if (!saved) { state.currentChatPersonality = 'default'; return; }
  // Accept built-in personalities
  if (CHAT_PERSONALITIES.some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
  // Accept custom personalities
  if (saved.startsWith('custom_') && getCustomPersonalities().some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
  // Legacy 'custom' → migrate to custom_migrated if it exists
  if (saved === 'custom') {
    const customs = getCustomPersonalities();
    if (customs.length > 0) { state.currentChatPersonality = customs[0].id; localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, customs[0].id); return; }
  }
  state.currentChatPersonality = 'default';
}

export function updateChatHeaderTitle() {
  const el = document.querySelector('.chat-header-title');
  if (!el) return;
  // Show all persona names when 2+ have responded in this thread
  const names = [];
  const seen = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName && !seen.has(m.personalityName)) {
      seen.add(m.personalityName);
      names.push((m.personalityIcon || '') + ' ' + m.personalityName);
    }
  }
  if (names.length >= 2) {
    el.textContent = names.join(' & ');
  } else {
    const p = getActivePersonality();
    el.textContent = p.name;
  }
  updateChatHeaderModel();
}

export function updateChatHeaderModel() {
  const el = document.querySelector('.chat-header-model');
  if (!el) return;
  el.textContent = hasAIProvider() ? getActiveModelDisplay() : '';
}

export function updatePersonalityBar() {
  const currentEl = document.querySelector('.chat-personality-current');
  if (currentEl) {
    const p = getActivePersonality();
    currentEl.querySelector('.chat-personality-current-icon').textContent = p.icon;
    currentEl.querySelector('.chat-personality-current-name').textContent = p.name;
  }
  // Update active states on built-in buttons
  document.querySelectorAll('.chat-personality-opt[data-personality="default"], .chat-personality-opt[data-personality="house"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.personality === state.currentChatPersonality);
  });
  // Build custom section dynamically
  const section = document.getElementById('chat-personality-custom-section');
  if (!section) return;
  const customs = getCustomPersonalities();
  const isCustomActive = state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_');
  const showEditor = _editingPersonalityId === 'new' || (isCustomActive && _editingPersonalityId === state.currentChatPersonality);
  let html = '<div class="chat-personality-divider">Custom</div>';
  for (const cp of customs) {
    const isActive = cp.id === state.currentChatPersonality;
    html += `<div class="chat-personality-opt-wrapper">
      <button class="chat-personality-opt${isActive ? ' active' : ''}" data-personality="${escapeHTML(cp.id)}" onclick="setChatPersonality('${escapeHTML(cp.id)}')">
        <span class="chat-personality-opt-icon">${cp.icon}</span>
        <div class="chat-personality-opt-info">
          <span class="chat-personality-opt-name">${escapeHTML(cp.name)}</span>
          <span class="chat-personality-opt-desc">Custom personality</span>
        </div>
        <span class="chat-personality-opt-check">&#10003;</span>
      </button>
      <button class="chat-personality-edit" onclick="event.stopPropagation(); editCustomPersonality('${escapeHTML(cp.id)}')" title="Edit personality">&#9998;</button>
      <button class="chat-personality-delete" onclick="event.stopPropagation(); deleteCustomPersonality('${escapeHTML(cp.id)}')" title="Delete personality">&times;</button>
    </div>`;
  }
  html += '<button class="chat-personality-add-btn" onclick="startNewCustomPersonality()">+ New Personality</button>';
  html += `<div class="chat-personality-custom-area" style="display:${showEditor ? 'block' : 'none'}">
    <div class="chat-personality-custom-header">
      <input type="text" id="chat-personality-custom-name" class="chat-personality-custom-name-input" placeholder="e.g. A longevity researcher" maxlength="60" oninput="markPersonalityDirty()">
      <button id="chat-personality-generate-btn" class="chat-personality-generate-btn" onclick="generateCustomPersonality()">Generate</button>
    </div>
    <textarea class="chat-personality-custom-textarea" placeholder="Describe how you want the AI to communicate, or type a name above and click Generate..." oninput="autoResizePersonaTextarea(); markPersonalityDirty()"></textarea>
    <div class="chat-personality-custom-footer">
      <span class="chat-personality-disclaimer">Custom personas are for personal use. Don't impersonate real individuals without their consent.</span>
      <button class="chat-personality-custom-save" onclick="saveCustomPersonality()" disabled>Save</button>
    </div>
  </div>`;
  section.innerHTML = html;
  // Populate editor
  if (isCustomActive && _editingPersonalityId !== 'new') {
    const cp = getCustomPersonality();
    const textarea = section.querySelector('.chat-personality-custom-textarea');
    const nameInput = document.getElementById('chat-personality-custom-name');
    if (textarea) { textarea.value = cp.promptText; autoResizePersonaTextarea(); }
    if (nameInput) nameInput.value = cp.name !== 'Custom Personality' ? cp.name : '';
    _editingPersonalityId = state.currentChatPersonality;
    snapshotPersonalityClean();
  } else if (_editingPersonalityId === 'new') {
    snapshotPersonalityClean();
  }
}

export function togglePersonalityBar() {
  const options = document.querySelector('.chat-personality-options');
  const bar = document.querySelector('.chat-personality-bar');
  if (options && bar) {
    bar.classList.toggle('open');
  }
}

// Track which custom personality is being edited (ID, 'new', or null)
let _editingPersonalityId = null;
let _generatedPersonaIcon = null;

// Dirty state tracking for custom personality
let _personaCleanState = null;

function _getPersonaCurrentState() {
  const nameInput = document.getElementById('chat-personality-custom-name');
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  return {
    name: nameInput ? nameInput.value : '',
    text: textarea ? textarea.value : ''
  };
}

export function snapshotPersonalityClean() {
  _personaCleanState = _getPersonaCurrentState();
  const saveBtn = document.querySelector('.chat-personality-custom-save');
  if (saveBtn) saveBtn.disabled = true;
}

export function markPersonalityDirty() {
  const saveBtn = document.querySelector('.chat-personality-custom-save');
  if (!saveBtn || !_personaCleanState) { if (saveBtn) saveBtn.disabled = false; return; }
  const cur = _getPersonaCurrentState();
  const dirty = cur.name !== _personaCleanState.name || cur.text !== _personaCleanState.text;
  saveBtn.disabled = !dirty;
}

export function autoResizePersonaTextarea() {
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
}

export function saveCustomPersonality() {
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  const nameInput = document.getElementById('chat-personality-custom-name');
  if (!textarea) return;
  const name = (nameInput ? nameInput.value.trim() : '') || 'Custom Personality';
  const icon = _generatedPersonaIcon || pickPersonaIcon(name);
  _generatedPersonaIcon = null;
  const promptText = textarea.value.trim();
  const customs = getCustomPersonalities();
  let id;
  if (_editingPersonalityId && _editingPersonalityId !== 'new') {
    // Update existing
    id = _editingPersonalityId;
    const idx = customs.findIndex(p => p.id === id);
    if (idx >= 0) customs[idx] = { ...customs[idx], name, icon, promptText };
  } else {
    // Create new
    id = 'custom_' + Date.now().toString(36);
    customs.push({ id, name, icon, promptText });
  }
  saveCustomPersonalities(customs);
  _editingPersonalityId = id;
  state.currentChatPersonality = id;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, id);
  snapshotPersonalityClean();
  updatePersonalityBar();
  updateChatHeaderTitle();
  showNotification('Custom personality saved', 'success');
}

export function startNewCustomPersonality() {
  _editingPersonalityId = 'new';
  updatePersonalityBar();
}

export function editCustomPersonality(id) {
  _editingPersonalityId = id;
  // Select the persona if not already active
  if (state.currentChatPersonality !== id) {
    setChatPersonality(id);
  }
  updatePersonalityBar();
}

export function deleteCustomPersonality(id) {
  const customs = getCustomPersonalities();
  const cp = customs.find(p => p.id === id);
  const name = cp ? cp.name : 'personality';
  showConfirmDialog(`Delete "${name}"? This cannot be undone.`, () => {
    const updated = customs.filter(p => p.id !== id);
    saveCustomPersonalities(updated);
    if (state.currentChatPersonality === id) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      _editingPersonalityId = null;
    }
    updatePersonalityBar();
    updateChatHeaderTitle();
    renderChatMessages();
  });
}

export async function generateCustomPersonality() {
  if (!hasAIProvider()) {
    showNotification('AI provider not configured. Open Settings first.', 'info');
    return;
  }
  const nameInput = document.getElementById('chat-personality-custom-name');
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  const genBtn = document.getElementById('chat-personality-generate-btn');
  if (!nameInput || !textarea) return;
  const name = nameInput.value.trim();
  if (!name) {
    showNotification('Enter a name first (e.g. "A longevity researcher")', 'info');
    nameInput.focus();
    return;
  }
  // Loading state
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = 'Generating\u2026'; }
  textarea.value = '';
  textarea.placeholder = `Generating ${name} persona\u2026`;

  try {
    const systemPrompt = `You are a persona designer for a health/blood work AI chat assistant called getbased. The user will give you a name — a real person, fictional character, or archetype. Create a thorough, vivid persona profile that the AI should fully embody when discussing lab results and health data.

Write in second person ("You are..."). Output a rich persona description covering ALL of the following:

1. **Identity & Background**: Who this persona is — their professional history, credentials, intellectual lineage, what shaped their worldview. What are they known for? What's their origin story?
2. **Communication Style**: Exact tone, vocabulary, formality level. Specific signature phrases, verbal tics, metaphors, or rhetorical patterns they'd use. How do they open conversations? How do they deliver bad news vs good news?
3. **Medical & Health Philosophy**: Their core framework for interpreting lab data. What do they emphasize that mainstream medicine overlooks? What conventional advice do they challenge or dismiss? What biomarkers excite them and why?
4. **Analytical Approach**: How they connect dots between markers. Do they focus on ratios, trends, context, root causes? What patterns do they look for first? How do they weigh reference ranges vs optimal ranges?
5. **Lifestyle & Optimization Lens**: What lifestyle factors do they always ask about? Diet, light exposure, sleep, environment, hormones — what's their hierarchy? What interventions do they champion?
6. **Character & Personality**: Temperament, humor style, patience level. How they handle disagreement, uncertainty, or when a patient pushes back. What makes them passionate or frustrated?
7. **Signature Recommendations**: Specific tests, supplements, protocols, or lifestyle changes they'd commonly suggest. What's their go-to advice?
8. **Unconventional Views**: Where do their views diverge from mainstream medical consensus? How do they naturally acknowledge this in conversation — using their own voice, not disclaimers? (e.g. "Conventional endocrinology won't tell you this, but..." or "The literature is catching up to what we've known for years...")

Be extremely specific — include actual phrases, real concepts they'd reference, genuine intellectual positions. This persona should feel unmistakably like talking to the real person, not a generic impression. Aim for 400-500 words. Do NOT include any disclaimers or accuracy warnings — just the pure persona.

End the persona with this exact paragraph (copy it verbatim, do not modify):
"When your views diverge from mainstream medical consensus, acknowledge it naturally in your own voice and style — never with generic disclaimers, never breaking character. Your perspective is the point."

IMPORTANT: On the very first line, output ONLY a single emoji that best captures this specific person's identity or what they're most known for — not just their profession. Think about what makes them unique (e.g. ☀️ for someone known for sun exposure protocols, 🧊 for a cold therapy advocate, 🍖 for a carnivore diet proponent). Then a blank line, then the persona description.`;

    const { text } = await callClaudeAPI({
      system: systemPrompt,
      messages: [{ role: 'user', content: `Create a comprehensive persona for: ${name}` }],
      maxTokens: 2048,
      onStream(text) {
        textarea.value = text;
        autoResizePersonaTextarea();
      }
    });
    // Extract AI-picked emoji from first line
    const lines = text.split('\n');
    const firstLine = lines[0].trim();
    const emojiMatch = firstLine.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?(\u200D(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?))*)/u);
    if (emojiMatch && emojiMatch[0] && firstLine.length <= 4) {
      _generatedPersonaIcon = emojiMatch[0];
      // Strip emoji line from prompt text
      const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
      textarea.value = rest;
    } else {
      textarea.value = text;
    }
    autoResizePersonaTextarea();
    markPersonalityDirty();
    textarea.placeholder = 'Describe how you want the AI to communicate, or type a name above and click Generate...';
  } catch (err) {
    textarea.placeholder = 'Describe how you want the AI to communicate, or type a name above and click Generate...';
    showNotification(`Generation failed: ${err.message}`, 'error');
  }
  if (genBtn) { genBtn.disabled = false; genBtn.textContent = 'Generate'; }
}

// ═══════════════════════════════════════════════
// CHAT HISTORY (now thread-aware)
// ═══════════════════════════════════════════════
export async function loadChatHistory() {
  if (!state.currentThreadId) {
    state.chatHistory = [];
    renderChatMessages();
    return;
  }
  try {
    const key = getChatThreadKey(state.currentThreadId);
    const stored = await encryptedGetItem(key);
    state.chatHistory = stored ? JSON.parse(stored) : [];
  } catch { state.chatHistory = []; }
  renderChatMessages();
}

export async function saveChatHistory() {
  if (!state.currentThreadId) return;
  // No message limit per thread (API still sends last 10)
  const key = getChatThreadKey(state.currentThreadId);
  // Strip transient sourcesPending flag — must never reach storage
  const value = JSON.stringify(state.chatHistory, (k, v) => k === 'sourcesPending' ? undefined : v);
  if (getEncryptionEnabled()) {
    await encryptedSetItem(key, value);
  } else {
    localStorage.setItem(key, value);
  }
  // Update thread index metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    thread.updatedAt = new Date().toISOString();
    thread.messageCount = state.chatHistory.length;
    thread.personality = state.currentChatPersonality;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    saveChatThreadIndex();
    renderThreadList();
  }
}

export function clearChatHistory() {
  state.chatHistory = [];
  if (state.currentThreadId) {
    localStorage.removeItem(getChatThreadKey(state.currentThreadId));
    // Update thread metadata
    const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
    if (thread) {
      thread.messageCount = 0;
      thread.updatedAt = new Date().toISOString();
      saveChatThreadIndex();
      renderThreadList();
    }
  }
  renderChatMessages();
  updateChatHeaderTitle();
  updateDiscussButton();
  showNotification('Chat history cleared', 'info');
}

// ═══════════════════════════════════════════════
// MESSAGE RENDERING
// ═══════════════════════════════════════════════

function _getNoDataPrompts() {
  const data = getActiveData();
  const hasLabs = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate);
  if (hasLabs) return null;
  const cardKeys = ['healthGoals', 'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment'];
  const filledCount = cardKeys.filter(k => {
    if (k === 'healthGoals') return (state.importedData.healthGoals || []).length > 0;
    return hasCardContent(state.importedData[k]);
  }).length;
  if (filledCount === 0) {
    return [
      'What should I tell you about myself first?',
      'Why do the context cards matter?',
      'What blood tests are worth getting?',
      'Where do I start with optimizing my health?'
    ];
  }
  return [
    'Based on my profile, what blood tests should I get?',
    'What panels would help with my health goals?',
    'What should I tell my doctor to test for?',
    'Which markers are most relevant to my lifestyle?'
  ];
}

export function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // ── Onboarding flow: conversational chat bubbles guide through setup ──
  if (state.chatHistory.length === 0) {
    const personality = getActivePersonality();
    const hasData = state.importedData?.entries?.length > 0;
    const currentP = getProfiles().find(p => p.id === state.currentProfile);
    const hasProfile = currentP?.name && currentP.name !== 'Default' && state.profileSex;

    // Stage 1: No profile — ask name/sex/DOB/location
    if (!hasProfile) {
      const pName = (currentP?.name && currentP.name !== 'Default') ? currentP.name : '';
      const pSex = state.profileSex || '';
      const pDob = state.profileDob || '';
      const pLoc = getProfileLocation(state.currentProfile);
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>Hey! 👋 I'll be your AI health analyst — I help you understand blood work, track trends, and spot what matters. First, tell me a bit about yourself:</p>
          <div class="chat-onboard-form">
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Name</label>
              <input type="text" class="chat-onboard-input" id="chat-onboard-name" placeholder="your name" value="${escapeHTML(pName)}" onchange="window.saveChatProfile()">
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Sex</label>
              <div class="chat-onboard-sex">
                <button class="welcome-sex-btn${pSex === 'male' ? ' active' : ''}" onclick="window.setChatProfileSex('male')">Male</button>
                <button class="welcome-sex-btn${pSex === 'female' ? ' active' : ''}" onclick="window.setChatProfileSex('female')">Female</button>
              </div>
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Born</label>
              <input type="date" class="chat-onboard-input" id="chat-onboard-dob" value="${escapeHTML(pDob)}" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}">
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Location</label>
              <input type="text" class="chat-onboard-input" id="chat-onboard-country" placeholder="e.g. Germany" value="${escapeHTML(pLoc.country || '')}" oninput="window.saveChatLocation()">
            </div>
            <div id="chat-onboard-lat" style="font-size:12px;margin:2px 0 0 52px"></div>
            <div style="font-size:11px;color:var(--text-muted);margin:2px 0 0 52px;line-height:1.3">Latitude affects vitamin D, circadian rhythm, and seasonal health patterns.</div>
            <button class="chat-onboard-next" id="chat-onboard-next" onclick="window.saveChatProfile(true)" disabled>Continue →</button>
          </div>
        </div>`;
      _updateOnboardNextBtn();
      if (pLoc.country) saveChatLocation(); // show latitude for pre-filled country
      updateDiscussButton();
      return;
    }

    // AI paused — show re-enable prompt instead of setup guide
    if (isAIPaused()) {
      const name = currentP?.name || 'there';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>${escapeHTML(name)}, AI features are currently paused. Turn them back on to chat, get insights, and import PDFs with AI.</p>
          <div style="margin-top:12px">
            <button class="import-btn import-btn-primary" onclick="window._resumeAI()">Enable AI</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // Stage 2: Profile set, no AI — connect provider (full list)
    const providerSkipped = localStorage.getItem(`labcharts-onboard-provider-skipped-${state.currentProfile}`);
    if (!hasAIProvider() && !providerSkipped) {
      const name = currentP?.name || 'there';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>Nice to meet you, ${escapeHTML(name)}! I need an AI brain to analyze your labs. Pick a provider — OpenRouter is the easiest to get started:</p>
          <div class="chat-setup-providers">
            <div class="chat-setup-provider">
              <strong>OpenRouter</strong> <span class="chat-setup-rec">(Recommended)</span><br>
              <span class="chat-setup-detail">One key, 200+ models (Claude, GPT, Gemini, etc.). Free tier available.</span><br>
              <button class="or-oauth-btn" style="margin-top:8px" onclick="startOpenRouterOAuth()">Connect with OpenRouter</button>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">or <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('openrouter')},300)" style="color:var(--accent)">paste a key manually</a></div>
            </div>
            <div class="chat-setup-provider">
              <strong>Anthropic</strong><br>
              <span class="chat-setup-detail">Direct access to Claude models.</span><br>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get your key &rarr;</a>
            </div>
            <div class="chat-setup-provider">
              <strong>Venice</strong><br>
              <span class="chat-setup-detail">Privacy-focused cloud. Access to Claude, GPT, and open models.</span><br>
              <a href="https://venice.ai/settings/api" target="_blank" rel="noopener">Get your key &rarr;</a>
            </div>
            <div class="chat-setup-provider">
              <strong>Local AI</strong><br>
              <span class="chat-setup-detail">Run models locally with Ollama, LM Studio, or any OpenAI-compatible server.</span><br>
              <a href="https://ollama.com" target="_blank" rel="noopener">Download Ollama &rarr;</a>
            </div>
          </div>
          <p style="font-size:13px">Got a key from one of these? Paste it here:</p>
          <button class="chat-setup-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">Open AI Settings</button>
          <div style="text-align:center;margin-top:12px">
            <a href="#" onclick="event.preventDefault();window.skipProviderSetup()" style="color:var(--text-muted);font-size:12px">Skip for now — I'll set this up later</a>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // Stage 3+: API connected — guide through cards and import
    const filled = _countFilledCards();
    const name = currentP?.name || 'there';

    const isFemale = state.profileSex === 'female';
    const mc = state.importedData?.menstrualCycle;
    const hasCycle = mc?.periods?.length > 0 || mc?.cycleLength || mc?.cycleStatus;
    const supps = state.importedData.supplements || [];
    const extrasDone = localStorage.getItem(`labcharts-onboard-extras-done-${state.currentProfile}`);

    // Stage 3-extras: Cycle + supplements (dedicated step, shown once before cards/import)
    if (!hasData && !extrasDone) {
      const cycleSection = (isFemale && !hasCycle) ? `<div class="chat-onboard-cycle-hint">
            <p>🩸 Do you currently have a menstrual cycle? This helps me interpret hormones, iron, and inflammation — they shift significantly with cycle phase.</p>
            <div class="chat-onboard-cycle-options" id="chat-onboard-cycle-options">
              <button class="ctx-btn-option" onclick="window.showCyclePeriodEntry()">Yes — I get regular periods</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('perimenopause')">They're irregular / perimenopause</button>
              <button class="ctx-btn-option" onclick="window.showCycleNoMensesOptions()">No — not currently menstruating</button>
            </div>
            <div class="chat-onboard-cycle-options" id="chat-onboard-cycle-no-menses" style="display:none">
              <p style="font-size:13px;margin:0 0 6px;color:var(--text-muted)">What's the reason? This helps me interpret your labs correctly.</p>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('postmenopause')">Menopause</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('pregnant')">Pregnant</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('breastfeeding')">Breastfeeding</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('absent')">Other reason</button>
            </div>
            <div class="chat-onboard-cycle-form" id="chat-onboard-cycle-entry" style="display:none">
              <p style="font-size:13px;margin:8px 0 4px">When did your last period start and end? (day of month)</p>
              <div class="chat-onboard-cycle-dates">
                <label class="chat-onboard-label">Started</label>
                <input type="number" class="chat-onboard-input chat-onboard-day" id="chat-onboard-period-start" min="1" max="31" placeholder="?" oninput="window._updatePeriodBtn()">
                <label class="chat-onboard-label">ended</label>
                <input type="number" class="chat-onboard-input chat-onboard-day" id="chat-onboard-period-end" min="1" max="31" placeholder="?" oninput="window._updatePeriodBtn()">
              </div>
              <div id="chat-onboard-period-preview" style="font-size:12px;color:var(--text-muted);margin:4px 0"></div>
              <button class="chat-onboard-next" id="chat-onboard-period-btn" onclick="window.saveChatPeriod()" disabled>Save</button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">You can always change this later in the <a href="#" onclick="event.stopPropagation();closeChatPanel();window.openMenstrualCycleEditor?.()" style="color:var(--accent)">cycle editor</a>.</div>
          </div>` : '';
      const suppList = supps.map((s, i) => `<div class="chat-onboard-supp-item"><span>${escapeHTML(s.name)}${s.dosage ? ' — ' + escapeHTML(s.dosage) : ''} <span style="color:var(--text-muted);font-size:11px">(${s.type})</span></span><button class="chat-onboard-supp-remove" onclick="window.removeChatSupplement(${i})" title="Remove">&times;</button></div>`).join('');
      const suppSection = `<div class="chat-onboard-supps">
            <p>💊 Are you taking any supplements or medications? These can significantly affect your lab results.</p>
            <div id="chat-onboard-supp-list">${suppList}</div>
            <div class="chat-onboard-supp-form">
              <input type="text" class="chat-onboard-input" id="chat-onboard-supp-name" placeholder="Name (e.g. Creatine, Metformin)" style="flex:2" onkeydown="if(event.key==='Enter'){event.preventDefault();window.addChatSupplement()}">
              <input type="text" class="chat-onboard-input" id="chat-onboard-supp-dose" placeholder="Dosage (e.g. 5g/day)" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();window.addChatSupplement()}">
              <select class="chat-onboard-input" id="chat-onboard-supp-type" style="flex:0 0 auto;width:auto">
                <option value="supplement">Supplement</option>
                <option value="medication">Medication</option>
              </select>
              <button class="chat-onboard-supp-add" onclick="window.addChatSupplement()">+</button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Press + or Enter to add. You can always edit these later on the dashboard.</div>
          </div>`;
      const genetics = state.importedData.genetics;
      const hasGenetics = genetics && Object.keys(genetics.snps || {}).length > 0;
      let dnaSection;
      if (hasGenetics) {
        const fx = genetics.effects || {};
        const dots = [];
        if (genetics.apoe) dots.push(`APOE: <strong>${escapeHTML(genetics.apoe)}</strong>`);
        if (fx.significant > 0) dots.push(`\uD83D\uDD34 ${fx.significant} significant`);
        if (fx.moderate > 0) dots.push(`\uD83D\uDFE1 ${fx.moderate} moderate`);
        if (fx.normal > 0) dots.push(`\uD83D\uDFE2 ${fx.normal} normal`);
        const dotsHtml = dots.length > 0 ? `<div style="font-size:13px;line-height:1.8">${dots.join(' &nbsp;\u00B7&nbsp; ')}</div>` : '';
        dnaSection = `<div class="chat-onboard-dna" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <p style="margin:0 0 6px">\uD83E\uDDEC <strong>${Object.keys(genetics.snps).length} SNPs imported</strong> from ${escapeHTML(genetics.source)}</p>
            ${dotsHtml}
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">I'll factor these into all your lab interpretations.</div>
          </div>`;
      } else {
        dnaSection = `<div class="chat-onboard-dna" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <p style="margin:0 0 8px">\uD83E\uDDEC Have you ever done a DNA test? If you have the raw data file, it helps me understand <em>why</em> your labs look the way they do \u2014 even when your lifestyle is dialed in.</p>
            <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
              <button class="ctx-btn-option" onclick="document.getElementById('dna-onboard-input').click()">Upload DNA raw data</button>
            </div>
            <input type="file" id="dna-onboard-input" accept=".txt,.csv" style="display:none" onchange="if(this.files[0]){window.handleDNAFile(this.files[0]);this.value=''}">
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5">Supports Ancestry, 23andMe, MyHeritage, FTDNA, Living DNA.<br>Processed locally \u2014 your DNA file never leaves your device.</div>
          </div>`;
      }
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai" style="width:88%">
          <p>${hasAIProvider() ? 'Great, we\'re connected! 🎉' : 'Nice!'} A couple of quick things that help me give better advice:</p>
          ${cycleSection}
          ${suppSection}
          ${dnaSection}
          <div class="chat-onboard-actions">
            <button class="chat-onboard-cta" onclick="window.skipOnboardingExtras()">Continue →</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3a: All 9 cards filled, no data — full picture
    if (filled >= 9 && !hasData) {
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>${escapeHTML(name)}, you filled everything in — I have a really complete picture of your lifestyle now. ${hasAIProvider() ? 'Even without lab data, I can already help:' : 'Import your labs or connect an AI provider to get personalized insights.'}</p>
          <div class="chat-onboard-actions">
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('Based on my full profile, what blood tests should I get and why?')">What tests should I get?</button>
                 <button class="chat-prompt-btn" onclick="useChatPrompt('What can you tell about my health from my lifestyle info?')">Analyze my lifestyle</button>`
              : `<button class="chat-onboard-cta" onclick="closeChatPanel()">📄 Import a lab PDF</button>
                 <button class="chat-prompt-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">⚙️ Connect AI to get recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3b: No data, some cards filled — show progress, encourage more
    if (!hasData && filled > 0) {
      const remaining = 9 - filled;
      const progressPct = Math.round((filled / 9) * 100);
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>${filled >= 6 ? `Almost there, ${escapeHTML(name)}!` : filled >= 3 ? `Nice progress, ${escapeHTML(name)}!` : `Good start, ${escapeHTML(name)}!`} You've filled ${filled} of 9 cards.</p>
          <div class="chat-onboard-progress"><div class="chat-onboard-progress-bar" style="width:${progressPct}%"></div></div>
          <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">The more I know about your lifestyle, the better I can interpret your results and recommend what to test. Everything is optional.</p>
          <div class="chat-onboard-actions">
            <button class="chat-onboard-cta" onclick="closeChatPanel();sessionStorage.setItem('welcome-details-open','1');document.querySelector('.welcome-context-details')?.setAttribute('open','');document.querySelector('.welcome-context-details')?.scrollIntoView({behavior:'smooth'})">📋 Continue — ${remaining} card${remaining !== 1 ? 's' : ''} left</button>
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('Based on what you know about me so far, what blood tests should I get?')">Skip ahead — recommend tests</button>`
              : `<button class="chat-prompt-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">⚙️ Connect AI to get recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3c: No data, no cards — initial prompt
    if (!hasData) {
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>You're ready to go, ${escapeHTML(name)}! Here's how to get the most out of this:</p>
          <p style="font-size:13px;margin:4px 0"><strong>Have lab results?</strong> Drop a PDF on the page — I'll extract everything and build your dashboard with trend charts, flags, and insights.</p>
          <p style="font-size:13px;margin:4px 0"><strong>No labs yet?</strong> Tell me about your lifestyle and I'll recommend what to test first.</p>
          <div class="chat-onboard-actions">
            <button class="chat-onboard-cta" onclick="closeChatPanel()">📄 Import a lab PDF</button>
            <button class="chat-onboard-cta" onclick="closeChatPanel();sessionStorage.setItem('welcome-details-open','1');document.querySelector('.welcome-context-details')?.setAttribute('open','');document.querySelector('.welcome-context-details')?.scrollIntoView({behavior:'smooth'})">📋 Fill in my lifestyle cards</button>
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('I don\\'t have any labs yet. Based on my profile, what blood tests should I get and why?')">Just tell me what to test</button>`
              : `<button class="chat-prompt-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">⚙️ Connect AI to get recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // Stage 4: Has data, few context cards — nudge lifestyle
    if (filled < 3) {
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>I can see your lab results — nice! 👋 I can already analyze these, but if you fill in a few lifestyle cards I'll give you much more personalized insights.</p>
          <div class="chat-onboard-actions">
            <button class="chat-prompt-btn" onclick="closeChatPanel();document.querySelector('.profile-context-cards')?.scrollIntoView({behavior:'smooth'})">📋 Fill in lifestyle cards</button>
            <button class="chat-prompt-btn" onclick="useChatPrompt('What are my most concerning results?')">Analyze my results now</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }
    const noDataPrompts = _getNoDataPrompts();
    const prompts = noDataPrompts || [
      'What are my most concerning results?',
      'How has my bloodwork changed over time?',
      'Are there any patterns in my flagged markers?',
      'Explain my thyroid panel',
      'What should I test next?'
    ];
    container.innerHTML = `<div class="chat-empty">
      <div class="chat-empty-icon">${personality.icon}</div>
      <div>${escapeHTML(personality.greeting)}</div>
      <div class="chat-prompts">
        ${prompts.map(p => `<button class="chat-prompt-btn" onclick="useChatPrompt('${escapeHTML(p)}')">${escapeHTML(p)}</button>`).join('\n        ')}
      </div>
    </div>`;
    updateDiscussButton();
    return;
  }
  let html = '';
  let lastPersonaName = null;
  for (let i = 0; i < state.chatHistory.length; i++) {
    const msg = state.chatHistory[i];
    const cls = msg.role === 'user' ? 'chat-user' : 'chat-ai';
    // "Joined" system messages
    if (msg.joined) {
      html += `<div class="chat-persona-joined">${msg.joinIcon || ''} ${escapeHTML(msg.joinName || '')} joined the discussion</div>`;
      continue;
    }
    // Hidden auto messages (instruction sent to API but not shown)
    if (msg.hidden) continue;
    // Show persona label when personality changes between AI messages
    if (msg.role === 'assistant' && msg.personalityName && msg.personalityName !== lastPersonaName) {
      html += `<div class="chat-persona-label">${msg.personalityIcon || ''} ${escapeHTML(msg.personalityName)}</div>`;
    }
    if (msg.role === 'assistant') lastPersonaName = msg.personalityName || null;
    const autoClass = msg.auto ? ' chat-msg-auto' : '';
    const stoppedNote = msg.stopped ? '<div class="chat-stopped-note">[stopped]</div>' : '';
    let imageBadge = '';
    if (msg.hasImages) {
      if (msg.thumbnails && msg.thumbnails.length > 0) {
        imageBadge = '<div class="chat-image-thumbs">' + msg.thumbnails.map(t =>
          `<img src="${t}" class="chat-image-thumb" alt="attached image" onclick="openImageLightbox(this.src)">`
        ).join('') + '</div>';
      } else {
        imageBadge = `<div class="chat-image-badge">\uD83D\uDDBC ${msg.imageCount} image${msg.imageCount !== 1 ? 's' : ''} attached</div>`;
      }
    }
    html += `<div class="chat-msg ${cls}${autoClass}">${imageBadge}${renderMarkdown(msg.content)}${stoppedNote}`;
    if (msg.role === 'assistant') {
      if (msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens)) {
        const mId = msg.modelId || getActiveModelId();
        const mProvider = msg.modelId ? (msg.modelId.includes('/') ? 'openrouter' : getAIProvider()) : getAIProvider();
        const cost = calculateCost(mProvider, mId, msg.usage.inputTokens, msg.usage.outputTokens);
        const totalTokens = (msg.usage.inputTokens || 0) + (msg.usage.outputTokens || 0);
        const mName = msg.modelDisplay || getActiveModelDisplay();
        html += `<div class="chat-cost-footnote">${escapeHTML(mName)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens</div>`;
      }
      html += buildActionBar(i);
    }
    html += '</div>';
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
  updateDiscussButton();
  updateChatHeaderTitle();
  _updateChatInputState();
}

export function useChatPrompt(text) {
  if (!hasAIProvider()) {
    showNotification('Connect an AI provider first — open Settings → AI to set one up.', 'info');
    return;
  }
  const input = document.getElementById('chat-input');
  if (input) { input.value = text; sendChatMessage(); }
}

// ═══════════════════════════════════════════════
// MARKDOWN
// ═══════════════════════════════════════════════
export function applyInlineMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safe = /^(https?:|mailto:)/.test(url) ? url.replace(/"/g, '&quot;') : '#';
      return `<a href="${safe}" target="_blank" rel="noopener">${label}</a>`;
    });
}

export function renderMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      if (lang) {
        // Language-tagged: render as code
        const escaped = codeLines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        blocks.push(`<pre class="chat-code-block"><code>${escaped}</code></pre>`);
      } else {
        // No language tag: render as styled callout (AI often uses ``` for non-code structured text)
        blocks.push(`<div class="chat-callout">${codeLines.map(l => applyInlineMarkdown(l)).join('<br>')}</div>`);
      }
      continue;
    }

    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push('<hr class="chat-hr">');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<div class="chat-h${level}">${applyInlineMarkdown(headingMatch[2])}</div>`);
      i++;
      continue;
    }

    // Blockquote (> lines)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote class="chat-blockquote">${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Table (pipe-delimited: | header | ... then |---| separator then | data | rows)
    if (/^\s*\|.+\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:]*-+/.test(lines[i + 1])) {
      const headerCells = line.split('|').slice(1, -1).map(c => applyInlineMarkdown(c.trim()));
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\s*\|.+\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(c => applyInlineMarkdown(c.trim())));
        i++;
      }
      let tableHtml = '<div class="chat-table-wrap"><table class="chat-table"><thead><tr>' + headerCells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      for (const row of rows) tableHtml += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
      tableHtml += '</tbody></table></div>';
      blocks.push(tableHtml);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(applyInlineMarkdown(lines[i].replace(/^\s*[-*+]\s+/, '')));
        i++;
      }
      blocks.push(`<ul class="chat-list">${items.map(it => `<li>${it}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(applyInlineMarkdown(lines[i].replace(/^\s*\d+[.)]\s+/, '')));
        i++;
      }
      blocks.push(`<ol class="chat-list">${items.map(it => `<li>${it}</li>`).join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i]) &&
      !(/^\s*\|.+\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:]*-+/.test(lines[i + 1]))) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<div class="chat-para">${applyInlineMarkdown(paraLines.join(' '))}</div>`);
    }
  }

  return blocks.join('');
}

// ═══════════════════════════════════════════════
// PANEL OPEN/CLOSE
// ═══════════════════════════════════════════════
export function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
  if (panel.classList.contains('open')) {
    closeChatPanel();
  } else {
    openChatPanel();
  }
}

export async function openChatPanel(prefillMessage) {
  const panel = document.getElementById('chat-panel');
  const backdrop = document.getElementById('chat-backdrop');
  panel.classList.add('open');
  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.add('hidden');
  // Dismiss current nudge stage (but not 'profile' — user must complete the form)
  const currentNudge = localStorage.getItem('labcharts-chat-nudge');
  if (currentNudge && currentNudge !== 'profile') {
    localStorage.setItem(`labcharts-chat-nudge-dismissed-${state.currentProfile}`, currentNudge);
    setChatNudge(null);
  }
  loadChatPersonality();
  updateChatHeaderTitle();
  updatePersonalityBar();
  // Sync sources toggle
  const srcCb = document.getElementById('chat-sources-checkbox');
  if (srcCb) srcCb.checked = getChatSourcesEnabled();
  // Load threads and ensure active thread
  loadChatThreads();
  ensureActiveThread();
  restoreRailState();
  renderThreadList();
  await loadChatHistory();
  // Restore discussion continue prompt if this thread had an active discussion
  const activeThread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (activeThread && activeThread.discussionPersonas) {
    showDiscussContinuePrompt(activeThread.discussionPersonas, activeThread.discussionOriginalPersonality);
  }
  _updateChatInputState();
  if (prefillMessage) {
    const input = document.getElementById('chat-input');
    if (input) { input.value = prefillMessage; input.focus(); }
  } else {
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }
}

function _updateChatInputState() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const noAI = !hasAIProvider();
  if (input) {
    input.disabled = noAI;
    input.placeholder = noAI ? (isAIPaused() ? 'AI features are paused' : 'Connect an AI provider in Settings to chat') : 'Ask about your lab results...';
  }
  if (sendBtn) sendBtn.disabled = noAI;
}

export function closeChatPanel() {
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.remove('hidden');
}

// ═══════════════════════════════════════════════
// CHAT NUDGE (unread badge on FAB)
// ═══════════════════════════════════════════════

/**
 * Show/hide the unread badge + gentle pulse on the chat FAB.
 * Stages:
 *   'profile' — no name/sex set yet (first visit)
 *   'api'     — no AI provider connected
 *   'data'    — API connected but no lab data imported
 *   'context' — data imported, nudge to fill context cards
 *   null      — clear the nudge
 */
export function setChatNudge(stage) {
  const fab = document.getElementById('chat-fab');
  if (!fab) return;
  let badge = fab.querySelector('.chat-fab-badge');
  if (stage) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-fab-badge';
      fab.appendChild(badge);
    }
    fab.classList.add('chat-fab-nudge');
    localStorage.setItem('labcharts-chat-nudge', stage);
  } else {
    if (badge) badge.remove();
    fab.classList.remove('chat-fab-nudge');
    localStorage.removeItem('labcharts-chat-nudge');
  }
}

/** Check state and show appropriate nudge if user hasn't dismissed it. */
export function updateChatNudge() {
  const dismissed = localStorage.getItem(`labcharts-chat-nudge-dismissed-${state.currentProfile}`);
  const hasData = state.importedData?.entries?.length > 0;
  const currentP = getProfiles().find(p => p.id === state.currentProfile);
  const hasProfile = currentP?.name && currentP.name !== 'Default' && state.profileSex;

  if (!hasProfile) {
    // Stage 0: no profile — always nudge (can't dismiss)
    setChatNudge('profile');
  } else if (!hasAIProvider()) {
    if (dismissed !== 'api') setChatNudge('api');
    else setChatNudge(null);
  } else if (!hasData) {
    if (dismissed !== 'data') setChatNudge('data');
    else setChatNudge(null);
  } else {
    const filledCards = ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'healthGoals']
      .filter(k => {
        const v = state.importedData?.[k];
        return v && typeof v === 'object' && Object.values(v).some(f => f != null && f !== '' && !(Array.isArray(f) && f.length === 0));
      }).length;
    if (filledCards < 3 && dismissed !== 'context') setChatNudge('context');
    else setChatNudge(null);
  }
}

// ═══════════════════════════════════════════════
// CHAT ONBOARDING PROFILE FORM HELPERS
// ═══════════════════════════════════════════════

function _updateOnboardNextBtn() {
  const btn = document.getElementById('chat-onboard-next');
  if (!btn) return;
  const name = document.getElementById('chat-onboard-name')?.value?.trim();
  const sex = state.profileSex;
  btn.disabled = !(name && sex);
}

export function setChatProfileSex(sex) {
  document.querySelectorAll('.chat-onboard-form .welcome-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.chat-onboard-form .welcome-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
  setProfileSex(state.currentProfile, sex);
  state.profileSex = sex;
  _updateOnboardNextBtn();
}

var _chatLocTimer = null;
export function saveChatLocation() {
  const country = document.getElementById('chat-onboard-country')?.value?.trim();
  if (country == null) return;
  setProfileLocation(state.currentProfile, country, '');
  const el = document.getElementById('chat-onboard-lat');
  if (!el) return;
  if (!country) { el.textContent = ''; return; }

  // Check AI cache first
  const cacheKey = (country + '|').toLowerCase();
  const cached = getLocationCache()[cacheKey];
  if (cached !== undefined) {
    const band = latitudeToBand(cached);
    el.style.color = 'var(--green)';
    el.textContent = '\u2713 ' + Math.abs(Math.round(cached)) + '\u00b0' + (cached >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band];
    return;
  }
  // Hardcoded fallback
  const latStr = getLatitudeFromLocation();
  if (latStr) {
    el.style.color = 'var(--green)';
    el.textContent = '\u2713 ' + latStr;
  } else if (hasAIProvider()) {
    el.style.color = 'var(--text-muted)';
    el.textContent = 'Detecting\u2026';
  } else {
    el.textContent = '';
  }
  // Debounced AI refinement
  if (_chatLocTimer) clearTimeout(_chatLocTimer);
  if (hasAIProvider()) {
    _chatLocTimer = setTimeout(async () => {
      await detectLatitudeWithAI(country, '');
      // Re-read cache after AI detection
      const lat = getLocationCache()[(country + '|').toLowerCase()];
      const latEl = document.getElementById('chat-onboard-lat');
      if (lat !== undefined && latEl) {
        const band = latitudeToBand(lat);
        latEl.style.color = 'var(--green)';
        latEl.textContent = '\u2713 ' + Math.abs(Math.round(lat)) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band];
      }
    }, 1500);
  }
}

export function saveChatProfile(advance) {
  const nameEl = document.getElementById('chat-onboard-name');
  const dobEl = document.getElementById('chat-onboard-dob');
  const name = nameEl?.value?.trim();
  const dob = dobEl?.value;
  if (name) renameProfile(state.currentProfile, name);
  if (dob) {
    const dobYear = parseInt(dob.slice(0, 4));
    if (dobYear >= 1900 && dobYear <= new Date().getFullYear()) {
      setProfileDob(state.currentProfile, dob); state.profileDob = dob;
    }
    // Silently ignore invalid DOB — user can fix before clicking Continue
  }
  saveChatLocation();
  window.renderProfileButton?.();
  _updateOnboardNextBtn();
  if (advance && name && state.profileSex) {
    // Profile complete — advance to next stage
    updateChatNudge();
    renderChatMessages();
  }
}

export function showCycleNoMensesOptions() {
  const options = document.getElementById('chat-onboard-cycle-options');
  const noMenses = document.getElementById('chat-onboard-cycle-no-menses');
  if (options) options.style.display = 'none';
  if (noMenses) noMenses.style.display = 'block';
}

export function showCyclePeriodEntry() {
  const options = document.getElementById('chat-onboard-cycle-options');
  const entry = document.getElementById('chat-onboard-cycle-entry');
  if (options) options.style.display = 'none';
  if (entry) entry.style.display = 'block';
}

export function saveCycleStatus(status) {
  if (!state.importedData.menstrualCycle) state.importedData.menstrualCycle = {};
  state.importedData.menstrualCycle.cycleStatus = status;
  if (!state.importedData.menstrualCycle.periods) state.importedData.menstrualCycle.periods = [];
  saveImportedData();
  const labels = { perimenopause: 'Perimenopause noted', postmenopause: 'Noted — postmenopause', pregnant: 'Noted — pregnant', breastfeeding: 'Noted — breastfeeding', absent: 'Noted — no active cycle' };
  showNotification(labels[status] || 'Cycle status saved', 'success');
  _refreshDashboardCycle();
  renderChatMessages();
}

function _inferPeriodDates(startDay, endDay) {
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth();
  if (startDay > now.getDate()) month--;
  if (month < 0) { month = 11; year--; }
  const pad = n => String(n).padStart(2, '0');
  const startDate = `${year}-${pad(month + 1)}-${pad(startDay)}`;
  let eMonth = month, eYear = year;
  if (endDay < startDay) { eMonth++; if (eMonth > 11) { eMonth = 0; eYear++; } }
  const endDate = `${eYear}-${pad(eMonth + 1)}-${pad(endDay)}`;
  return { startDate, endDate };
}

export function _updatePeriodBtn() {
  const startVal = document.getElementById('chat-onboard-period-start')?.value;
  const endVal = document.getElementById('chat-onboard-period-end')?.value;
  const btn = document.getElementById('chat-onboard-period-btn');
  const preview = document.getElementById('chat-onboard-period-preview');
  const startDay = parseInt(startVal);
  const endDay = parseInt(endVal);
  if (btn) btn.disabled = !(startDay && endDay);
  if (preview && startDay && endDay) {
    const { startDate, endDate } = _inferPeriodDates(startDay, endDay);
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const days = Math.max(1, Math.round((e - s) / 86400000));
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (days <= 10) {
      preview.textContent = `→ ${fmt(s)} – ${fmt(e)} (${days} day${days !== 1 ? 's' : ''})`;
      preview.style.color = 'var(--text-muted)';
    } else {
      preview.textContent = `→ ${fmt(s)} – ${fmt(e)} (${days} days) — that seems long, double-check?`;
      preview.style.color = 'var(--yellow)';
    }
  } else if (preview) {
    preview.textContent = '';
  }
}

export function saveChatPeriod() {
  const startDay = parseInt(document.getElementById('chat-onboard-period-start')?.value);
  const endDay = parseInt(document.getElementById('chat-onboard-period-end')?.value);
  if (!startDay || !endDay) return;
  const { startDate, endDate } = _inferPeriodDates(startDay, endDay);
  const periodDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));
  if (!state.importedData.menstrualCycle) state.importedData.menstrualCycle = {};
  const mc = state.importedData.menstrualCycle;
  if (!mc.periods) mc.periods = [];
  mc.periods.push({ startDate, endDate, flow: 'moderate' });
  mc.cycleStatus = 'regular';
  if (!mc.cycleLength) mc.cycleLength = 28;
  mc.periodLength = periodDays;
  saveImportedData();
  showNotification('Cycle tracking set up!', 'success');
  _refreshDashboardCycle();
  renderChatMessages();
}

export function addChatSupplement() {
  const nameEl = document.getElementById('chat-onboard-supp-name');
  const doseEl = document.getElementById('chat-onboard-supp-dose');
  const typeEl = document.getElementById('chat-onboard-supp-type');
  const name = nameEl?.value?.trim();
  if (!name) { nameEl?.focus(); return; }
  if (!state.importedData.supplements) state.importedData.supplements = [];
  state.importedData.supplements.push({
    name,
    dosage: doseEl?.value?.trim() || '',
    type: typeEl?.value || 'supplement',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null
  });
  saveImportedData();
  _refreshDashboardSupps();
  renderChatMessages();
}

export function removeChatSupplement(idx) {
  if (!state.importedData.supplements?.[idx]) return;
  state.importedData.supplements.splice(idx, 1);
  saveImportedData();
  _refreshDashboardSupps();
  renderChatMessages();
}

function _refreshDashboardSupps() {
  const el = document.querySelector('.supp-timeline-section');
  if (el && window.renderSupplementsSection) el.outerHTML = window.renderSupplementsSection();
}

function _refreshDashboardCycle() {
  // Ensure the lifestyle details section is open so the cycle section is visible
  const details = document.querySelector('.welcome-context-details');
  if (details && !details.open) { details.setAttribute('open', ''); sessionStorage.setItem('welcome-details-open', '1'); }
  const el = document.querySelector('.cycle-section');
  if (el && window.renderMenstrualCycleSection) {
    el.outerHTML = window.renderMenstrualCycleSection(window.getActiveData());
  } else if (!el && state.profileSex === 'female' && window.renderMenstrualCycleSection) {
    // Cycle section doesn't exist yet — insert it after context cards
    const supps = document.querySelector('.supp-timeline-section');
    if (supps) supps.insertAdjacentHTML('beforebegin', window.renderMenstrualCycleSection(window.getActiveData()));
  }
}

export function skipProviderSetup() {
  localStorage.setItem(`labcharts-onboard-provider-skipped-${state.currentProfile}`, '1');
  renderChatMessages();
}

export function skipOnboardingExtras() {
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
  // Ensure the lifestyle details section is open so cycle/supplements are visible
  sessionStorage.setItem('welcome-details-open', '1');
  // Re-render dashboard to reflect cycle + supplement changes from onboarding
  if (window.navigate) window.navigate('dashboard');
  renderChatMessages();
}

/** Called by context-cards.js after saving a card. Nudges or advances the onboarding. */
function _countFilledCards() {
  return ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'healthGoals']
    .filter(k => {
      const v = state.importedData?.[k];
      return v && typeof v === 'object' && Object.values(v).some(f => f != null && f !== '' && !(Array.isArray(f) && f.length === 0));
    }).length;
}

export function onContextCardSaved() {
  const filled = _countFilledCards();
  const hasData = state.importedData?.entries?.length > 0;
  if (!hasData) {
    setChatNudge(filled >= 9 ? 'ready' : 'context');
  }
  // Re-render chat if open so progress bar / nudge updates
  const panel = document.getElementById('chat-panel');
  if (panel?.classList.contains('open') && state.chatHistory.length === 0) {
    renderChatMessages();
  }
}

// ═══════════════════════════════════════════════
// SEND BUTTON STATE
// ═══════════════════════════════════════════════
function setSendButtonMode(btn, mode) {
  if (!btn) return;
  if (mode === 'streaming') {
    btn.disabled = false;
    btn.innerHTML = '&#9632;'; // ■ stop square
    btn.classList.add('streaming');
  } else {
    btn.disabled = false;
    btn.innerHTML = '&#10148;'; // ➤ send arrow
    btn.classList.remove('streaming');
  }
}

// ═══════════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════════
export async function sendChatMessage() {
  if (!hasAIProvider()) {
    renderChatMessages(); // Re-render to show setup guide
    return;
  }
  // If currently streaming, abort and return (toggle behavior)
  if (_chatAbortController) {
    _chatAbortController.abort();
    _chatAbortController = null;
    return;
  }

  // Clear any pending discussion continue prompt
  removeDiscussContinuePrompt();
  delete state._discussionPersonas;
  delete state._discussionOriginalPersonality;
  // Clear persisted discussion state
  const curThread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (curThread && curThread.discussionPersonas) {
    delete curThread.discussionPersonas;
    delete curThread.discussionOriginalPersonality;
    saveChatThreadIndex();
  }

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const container = document.getElementById('chat-messages');
  const text = input.value.trim();
  const hasImages = _pendingAttachments.length > 0;
  if (!text && !hasImages) return;

  // Capture attachments before clearing (they're ephemeral)
  const attachments = hasImages ? [..._pendingAttachments] : [];

  // Ensure we have a thread
  if (!state.currentThreadId) {
    createNewThread();
  }

  // Auto-name thread from first user message
  const isFirstMessage = state.chatHistory.length === 0;

  // Add user message — store tiny thumbnails for display, NOT full base64
  const userMsg = { role: 'user', content: text || '(image)' };
  if (hasImages) {
    userMsg.hasImages = true;
    userMsg.imageCount = attachments.length;
    userMsg.thumbnails = attachments.map(a => a.thumbUrl).filter(Boolean);
  }
  state.chatHistory.push(userMsg);
  input.value = '';
  input.style.height = '';
  clearAttachments();
  renderChatMessages();

  if (isFirstMessage) {
    autoNameThread(state.currentThreadId, text);
  }

  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  // Switch to stop mode
  _chatAbortController = new AbortController();
  setSendButtonMode(sendBtn, 'streaming');

  // Snapshot context areas before sending
  const contextSnapshot = getContextSummary();
  const sourcesEnabled = getChatSourcesEnabled();

  try {
    const labContext = buildLabContext();
    const personality = getActivePersonality();
    let personalityPrompt = '';
    if (personality.id && personality.id.startsWith('custom_')) {
      const cp = getCustomPersonality();
      if (cp.promptText) {
        personalityPrompt = `\n\nPersona: ${cp.promptText}`;
      }
    } else if (personality.promptAddition) {
      personalityPrompt = '\n\n' + personality.promptAddition;
    }
    let searchInstruction = '';
    if (sourcesEnabled) {
      searchInstruction = '\n\nAfter your response, on its own line output SEARCH_TERMS: followed by 2-3 concise medical/scientific search terms separated by commas. Example:\nSEARCH_TERMS: vitamin D deficiency, immune function, 25-hydroxyvitamin D';
    }
    // Check if other personas have responded in this thread
    const currentPersonaName = personality.name;
    const otherPersonas = new Set();
    for (const m of state.chatHistory) {
      if (m.role === 'assistant' && m.personalityName && m.personalityName !== currentPersonaName) {
        otherPersonas.add(m.personalityName);
      }
    }
    let multiPersonaInstruction = '';
    if (otherPersonas.size > 0) {
      multiPersonaInstruction = `\n\nThis conversation includes responses from other AI personalities (${[...otherPersonas].join(', ')}). Messages marked [Response from ...] were written by a different persona — treat them as a separate analyst's opinion, not your own. You may agree or disagree with their analysis, but never claim you wrote their responses.`;
    }
    const systemPrompt = CHAT_SYSTEM_PROMPT + '\n\nCurrent lab data:\n' + labContext + personalityPrompt + multiPersonaInstruction + searchInstruction;

    // Send last 30 messages for context — tag messages from other personas
    const apiMessages = state.chatHistory.filter(m => !m.joined && m.role).slice(-30).map(m => {
      if (m.role === 'assistant' && m.personalityName && m.personalityName !== currentPersonaName) {
        return { role: m.role, content: `[Response from ${m.personalityName}]\n${m.content}` };
      }
      return { role: m.role, content: m.content };
    });

    // Inject vision content into the last user message if images were attached
    if (attachments.length > 0 && apiMessages.length > 0) {
      const lastUserIdx = apiMessages.length - 1;
      const provider = getAIProvider();
      const imageBlocks = attachments.map(att => formatImageBlock(att.base64, att.mediaType, provider));
      apiMessages[lastUserIdx] = {
        role: 'user',
        content: buildVisionContent(imageBlocks, apiMessages[lastUserIdx].content, provider)
      };
    }

    // Show persona label if personality changed from last AI message
    const lastAiMsg = [...state.chatHistory].reverse().find(m => m.role === 'assistant');
    if (!lastAiMsg || lastAiMsg.personalityName !== personality.name) {
      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      container.appendChild(labelEl);
    }

    // Capture model info before API call (user may switch models mid-conversation)
    const _msgModelId = getActiveModelId();
    const _msgModelDisplay = getActiveModelDisplay();
    const _msgProvider = getAIProvider();

    // Create AI message placeholder
    const aiMsgEl = document.createElement('div');
    aiMsgEl.className = 'chat-msg chat-ai';
    aiMsgEl.style.whiteSpace = 'pre-wrap';

    // Typewriter: trickle buffered text at a steady rate for smooth appearance
    const typewriter = createTypewriter(aiMsgEl, typingEl, container);

    const { text: fullText, usage } = await callClaudeAPI({
      system: systemPrompt,
      messages: apiMessages,
      maxTokens: 4096,
      signal: _chatAbortController ? _chatAbortController.signal : undefined,
      onStream(text) { typewriter.update(text); }
    });

    // Final render with full markdown
    typewriter.stop();
    aiMsgEl.style.whiteSpace = '';
    if (typingEl.parentNode) typingEl.remove();
    if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);

    // Parse search terms if sources enabled
    let displayText = fullText;
    let searchTerms = null;
    if (sourcesEnabled) {
      const parsed = parseSearchTerms(fullText);
      displayText = parsed.cleanText;
      searchTerms = parsed.terms;
      // Fallback: if AI didn't output SEARCH_TERMS, derive from user's question
      if (!searchTerms && text.length > 10) {
        searchTerms = [text.slice(0, 120)];
      }
    }

    aiMsgEl.innerHTML = renderMarkdown(displayText);
    // Cost footnote
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      const cost = calculateCost(_msgProvider, _msgModelId, usage.inputTokens, usage.outputTokens);
      const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
      const footnote = document.createElement('div');
      footnote.className = 'chat-cost-footnote';
      footnote.textContent = `${_msgModelDisplay} \u00b7 ${formatCost(cost)} \u00b7 ${totalTokens.toLocaleString()} tokens`;
      aiMsgEl.appendChild(footnote);
    }

    // Build assistant message object with context snapshot
    const assistantMsg = { role: 'assistant', content: displayText, context: contextSnapshot, personalityName: personality.name, personalityIcon: personality.icon, modelId: _msgModelId, modelDisplay: _msgModelDisplay };
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
      trackUsage(_msgProvider, _msgModelId, usage.inputTokens, usage.outputTokens);
    }
    if (searchTerms) assistantMsg.sourcesPending = true;
    state.chatHistory.push(assistantMsg);

    // Append action bar (with possible sources placeholder)
    const msgIndex = state.chatHistory.length - 1;
    const actionBarHtml = buildActionBar(msgIndex);
    const actionBarContainer = document.createElement('div');
    actionBarContainer.innerHTML = actionBarHtml;
    while (actionBarContainer.firstChild) aiMsgEl.appendChild(actionBarContainer.firstChild);

    container.scrollTop = container.scrollHeight;

    // Fetch OpenAlex sources async (capture thread ID for correct save target)
    if (searchTerms) {
      const sourceThreadId = state.currentThreadId;
      searchOpenAlex(searchTerms).then(sources => {
        delete assistantMsg.sourcesPending;
        if (sources.length > 0) {
          assistantMsg.sources = sources;
        }
        // Update DOM — guard against stale reference (re-render may have detached node)
        if (aiMsgEl.isConnected) {
          const loadingEl = aiMsgEl.querySelector('.chat-sources-loading');
          if (loadingEl) loadingEl.remove();
          if (sources.length > 0) {
            const srcToggle = document.createElement('div');
            srcToggle.className = 'chat-sources-toggle';
            srcToggle.setAttribute('onclick', `toggleSourcesDetails(${msgIndex})`);
            srcToggle.innerHTML = `<span class="chat-toggle-arrow" id="chat-src-arrow-${msgIndex}">\u25B8</span> Sources (${sources.length} paper${sources.length !== 1 ? 's' : ''})`;
            aiMsgEl.appendChild(srcToggle);
            const srcDetails = document.createElement('div');
            srcDetails.innerHTML = renderSourcesSection(sources, msgIndex);
            while (srcDetails.firstChild) aiMsgEl.appendChild(srcDetails.firstChild);
          }
          container.scrollTop = container.scrollHeight;
        } else if (state.currentThreadId === sourceThreadId) {
          // DOM was detached but still on same thread — re-render to pick up sources
          renderChatMessages();
        }
        // Only save to original thread (user may have switched threads during fetch)
        if (state.currentThreadId === sourceThreadId) {
          saveChatHistory();
        }
      }).catch(() => {
        // Network/API error — clean up shimmer, save without sources
        delete assistantMsg.sourcesPending;
        if (aiMsgEl.isConnected) {
          const loadingEl = aiMsgEl.querySelector('.chat-sources-loading');
          if (loadingEl) loadingEl.remove();
        }
        if (state.currentThreadId === sourceThreadId) {
          saveChatHistory();
        }
      });
    }

    // Always save immediately — sourcesPending is stripped from serialization by saveChatHistory
    saveChatHistory();
  } catch (err) {
    if (typingEl.parentNode) typingEl.remove();

    // Abort: save partial streamed text as a normal message
    if (err.name === 'AbortError') {
      // Read partial text from the DOM (typewriter accumulates into textContent)
      const partialText = aiMsgEl?.textContent?.trim() || '';
      if (partialText) {
        if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
        aiMsgEl.style.whiteSpace = '';
        aiMsgEl.innerHTML = renderMarkdown(partialText) + '<div class="chat-stopped-note">[stopped]</div>';
        const personality = getActivePersonality();
        state.chatHistory.push({ role: 'assistant', content: partialText, personalityName: personality.name, personalityIcon: personality.icon, stopped: true });
        saveChatHistory();
      }
    } else {
      const errEl = document.createElement('div');
      errEl.className = 'chat-msg chat-ai';
      errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(err.message)}</span>`;
      container.appendChild(errEl);
    }
  }

  _chatAbortController = null;
  setSendButtonMode(sendBtn, 'idle');
  updateDiscussButton();
  updateChatHeaderTitle();
  container.scrollTop = container.scrollHeight;
}

export function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

export function askAIAboutMarker(markerId) {
  const marker = state.markerRegistry[markerId];
  if (!marker) return;
  const data = getActiveData();
  const dates = marker.singlePoint ? [marker.singleDateLabel || 'N/A'] : data.dateLabels;
  const valuesText = marker.values
    .map((v, i) => {
      if (v === null) return null;
      let text = `${dates[i]}: ${formatValue(v)} ${marker.unit}`;
      if (marker.phaseLabels && marker.phaseLabels[i]) {
        const pr = marker.phaseRefRanges[i];
        text += ` (${marker.phaseLabels[i]} phase, ref ${formatValue(pr.min)}\u2013${formatValue(pr.max)})`;
      }
      return text;
    })
    .filter(Boolean).join(', ');
  const latestIdx = getLatestValueIndex(marker.values);
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const status = latestIdx !== -1 ? getStatus(marker.values[latestIdx], lr.min, lr.max) : 'no data';
  let prompt = `Tell me about my ${marker.name} results. Values: ${valuesText}. Reference range: ${marker.refMin}\u2013${marker.refMax} ${marker.unit}${marker.optimalMin != null ? `. Optimal range: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}. Current status: ${status}.`;
  if (marker.phaseLabels) prompt += ' Note: reference ranges shown are phase-specific for the menstrual cycle.';
  const nonNull = marker.values.filter(v => v !== null);
  if (nonNull.length >= 2) {
    const prev = nonNull[nonNull.length - 2];
    const last = nonNull[nonNull.length - 1];
    if (prev !== 0) {
      const pctChange = ((last - prev) / prev * 100).toFixed(1);
      const dir = last > prev ? 'up' : last < prev ? 'down' : 'stable';
      prompt += ` Trend: ${dir} ${Math.abs(parseFloat(pctChange))}% from previous.`;
    }
  }
  prompt += ' What does this mean and should I be concerned about anything?';
  window.closeModal();
  openChatPanel(prompt);
}

export function askAIAboutCorrelations() {
  if (state.selectedCorrelationMarkers.length < 2) return;
  const data = getActiveData();
  const parts = state.selectedCorrelationMarkers.map(key => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return null;
    const valuesText = marker.values
      .map((v, i) => v !== null ? `${data.dateLabels[i]}: ${formatValue(v)} ${marker.unit}` : null)
      .filter(Boolean).join(', ');
    const mr = getEffectiveRange(marker);
    const latestIdx = getLatestValueIndex(marker.values);
    const status = latestIdx !== -1 ? getStatus(marker.values[latestIdx], mr.min, mr.max) : 'no data';
    return `- ${marker.name}: ${valuesText} (ref: ${marker.refMin}\u2013${marker.refMax} ${marker.unit}${marker.optimalMin != null ? `, optimal: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}, status: ${status})`;
  }).filter(Boolean);
  const names = state.selectedCorrelationMarkers.map(key => {
    const [catKey, markerKey] = key.split('.');
    return data.categories[catKey]?.markers[markerKey]?.name || key;
  });
  const prompt = `Analyze the correlation between these biomarkers: ${names.join(', ')}.\n\nHere are my values:\n${parts.join('\n')}\n\nHow do these markers relate to each other? Are there any patterns, imbalances, or concerns based on their combined trends?`;
  openChatPanel(prompt);
}

// ═══════════════════════════════════════════════
// DISCUSS (multi-persona debate)
// ═══════════════════════════════════════════════
export function getThreadPersonaCount() {
  const names = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName) names.add(m.personalityName);
  }
  return names.size;
}

export function updateDiscussButton() {
  const btn = document.getElementById('chat-discuss-btn');
  if (!btn) return;
  const hasAssistant = state.chatHistory && state.chatHistory.some(m => m.role === 'assistant');
  if (!hasAssistant) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  const count = getThreadPersonaCount();
  btn.style.opacity = count >= 2 ? '1' : '0.5';
  btn.title = count >= 2
    ? 'Continue the debate'
    : 'Add another persona for a second opinion';
}

function collectDiscussionPersonas() {
  // Walk history backwards to find the 2 most recently active personas
  const seenIds = new Set();
  const personas = [];
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    const m = state.chatHistory[i];
    if (m.role === 'assistant' && m.personalityName) {
      let pid = null;
      const builtIn = CHAT_PERSONALITIES.find(p => p.name === m.personalityName);
      if (builtIn) pid = builtIn.id;
      else {
        const customs = getCustomPersonalities();
        const cp = customs.find(p => p.name === m.personalityName);
        if (cp) pid = cp.id;
      }
      if (pid && !seenIds.has(pid)) {
        seenIds.add(pid);
        personas.unshift({ id: pid, name: m.personalityName, icon: m.personalityIcon });
        if (personas.length === 2) break;
      }
    }
  }
  return personas;
}

const DEFAULT_DISCUSS_PROMPT = 'Respond to the other analyst\'s points above. Where do you agree or disagree? Add any insights they may have missed.';

async function runDiscussionRound(personas, steerPrompt, opts = {}) {
  const container = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!container) return;

  _chatAbortController = new AbortController();
  setSendButtonMode(sendBtn, 'streaming');

  const promptText = steerPrompt || DEFAULT_DISCUSS_PROMPT;

  // Check if any persona has already responded in this thread
  const hasExistingDebate = state.chatHistory.some(m => m.role === 'assistant' && m.personalityName);

  try {
    for (let pi = 0; pi < personas.length; pi++) {
      if (_chatAbortController.signal.aborted) break;
      const persona = personas[pi];

      state.currentChatPersonality = persona.id;

      // First persona in a fresh debate gets an open prompt, not a rebuttal prompt
      const isFirstEver = !hasExistingDebate && pi === 0;
      const msgText = isFirstEver
        ? (steerPrompt || 'Share your analysis and interpretation of these lab results.')
        : promptText;
      const autoMsg = { role: 'user', content: msgText, auto: true, hidden: !!opts.hideAutoMsg };
      state.chatHistory.push(autoMsg);
      renderChatMessages();
      saveChatHistory();

      const typingEl = document.createElement('div');
      typingEl.className = 'typing-indicator';
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(typingEl);
      container.scrollTop = container.scrollHeight;

      const labContext = buildLabContext();
      const personality = getActivePersonality();
      let personalityPrompt = '';
      if (personality.id && personality.id.startsWith('custom_')) {
        const cp = getCustomPersonality();
        if (cp.promptText) {
          personalityPrompt = `\n\nPersona: ${cp.promptText}`;
        }
      } else if (personality.promptAddition) {
        personalityPrompt = '\n\n' + personality.promptAddition;
      }
      const otherNames = new Set();
      for (const m of state.chatHistory) {
        if (m.role === 'assistant' && m.personalityName && m.personalityName !== personality.name) {
          otherNames.add(m.personalityName);
        }
      }
      let multiPersonaInstruction = '';
      if (otherNames.size > 0) {
        multiPersonaInstruction = `\n\nThis conversation includes responses from other AI personalities (${[...otherNames].join(', ')}). Messages marked [Response from ...] were written by a different persona — treat them as a separate analyst's opinion, not your own. You may agree or disagree with their analysis, but never claim you wrote their responses.`;
      }
      const systemPrompt = CHAT_SYSTEM_PROMPT + '\n\nCurrent lab data:\n' + labContext + personalityPrompt + multiPersonaInstruction;

      const apiMessages = state.chatHistory.filter(m => !m.joined && m.role).slice(-30).map(m => {
        if (m.role === 'assistant' && m.personalityName && m.personalityName !== personality.name) {
          return { role: m.role, content: `[Response from ${m.personalityName}]\n${m.content}` };
        }
        return { role: m.role, content: m.content };
      });

      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      container.appendChild(labelEl);

      const _dMsgModelId = getActiveModelId();
      const _dMsgModelDisplay = getActiveModelDisplay();
      const _dMsgProvider = getAIProvider();

      const aiMsgEl = document.createElement('div');
      aiMsgEl.className = 'chat-msg chat-ai';
      aiMsgEl.style.whiteSpace = 'pre-wrap';

      const typewriter = createTypewriter(aiMsgEl, typingEl, container);

      const { text: fullText, usage } = await callClaudeAPI({
        system: systemPrompt,
        messages: apiMessages,
        maxTokens: 4096,
        signal: _chatAbortController.signal,
        onStream(text) { typewriter.update(text); }
      });

      typewriter.stop();
      aiMsgEl.style.whiteSpace = '';
      if (typingEl.parentNode) typingEl.remove();
      if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
      aiMsgEl.innerHTML = renderMarkdown(fullText);

      if (usage && (usage.inputTokens || usage.outputTokens)) {
        const cost = calculateCost(_dMsgProvider, _dMsgModelId, usage.inputTokens, usage.outputTokens);
        const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
        const footnote = document.createElement('div');
        footnote.className = 'chat-cost-footnote';
        footnote.textContent = `${_dMsgModelDisplay} \u00b7 ${formatCost(cost)} \u00b7 ${totalTokens.toLocaleString()} tokens`;
        aiMsgEl.appendChild(footnote);
      }

      const assistantMsg = { role: 'assistant', content: fullText, personalityName: personality.name, personalityIcon: personality.icon, modelId: _dMsgModelId, modelDisplay: _dMsgModelDisplay };
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
        trackUsage(_dMsgProvider, _dMsgModelId, usage.inputTokens, usage.outputTokens);
      }
      state.chatHistory.push(assistantMsg);
      saveChatHistory();
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Partial text handled by DOM already
    } else {
      const errEl = document.createElement('div');
      errEl.className = 'chat-msg chat-ai';
      errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(err.message)}</span>`;
      container.appendChild(errEl);
    }
  }

  _chatAbortController = null;
  setSendButtonMode(sendBtn, 'idle');
}

function showDiscussContinuePrompt(personas, originalPersonality) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  // Remove any existing continue prompt
  const existing = container.querySelector('.chat-discuss-continue');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.className = 'chat-discuss-continue';
  prompt.innerHTML = '<input type="text" class="chat-discuss-steer" id="chat-discuss-steer" autocomplete="off" placeholder="Steer the debate (optional)..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();continueDiscussion()}">' +
    '<div class="chat-discuss-continue-actions">' +
    '<button class="chat-discuss-continue-btn" onclick="continueDiscussion()">Continue</button>' +
    '<button class="chat-discuss-done-btn" onclick="endDiscussion()">Done</button>' +
    '</div>';
  container.appendChild(prompt);
  container.scrollTop = container.scrollHeight;
  // Focus the steer input
  const steerInput = prompt.querySelector('.chat-discuss-steer');
  if (steerInput) steerInput.focus();

  // Stash state for continue/done
  state._discussionPersonas = personas;
  state._discussionOriginalPersonality = originalPersonality;

  // Persist discussion state to thread metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    thread.discussionPersonas = personas;
    thread.discussionOriginalPersonality = originalPersonality;
    saveChatThreadIndex();
  }
}

export function removeDiscussContinuePrompt() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const el = container.querySelector('.chat-discuss-continue');
  if (el) el.remove();
}

function cleanupDiscussionState() {
  removeDiscussContinuePrompt();
  const picker = document.querySelector('.discuss-persona-picker');
  if (picker) picker.remove();
  delete state._discussionPersonas;
  delete state._discussionOriginalPersonality;

  // Clear persisted discussion state from thread metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread && thread.discussionPersonas) {
    delete thread.discussionPersonas;
    delete thread.discussionOriginalPersonality;
    saveChatThreadIndex();
  }
}

export async function continueDiscussion() {
  // Read steer input before removing the prompt
  const steerInput = document.getElementById('chat-discuss-steer');
  const steerText = steerInput ? steerInput.value.trim() : '';
  removeDiscussContinuePrompt();
  const personas = state._discussionPersonas;
  const originalPersonality = state._discussionOriginalPersonality;
  if (!personas || personas.length < 2) return;

  await runDiscussionRound(personas, steerText || null);
  _finishDiscussionRound(personas, originalPersonality);
}

export function endDiscussion() {
  const orig = state._discussionOriginalPersonality;
  cleanupDiscussionState();
  if (orig) {
    state.currentChatPersonality = orig;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  updateDiscussButton();
}

export async function startDiscussion() {
  if (_chatAbortController) return; // already streaming

  if (getThreadPersonaCount() >= 2) {
    // Already have 2+ personas — run another round
    const personas = collectDiscussionPersonas();
    if (personas.length < 2) return;
    return _runDiscussion(personas);
  }

  // Only 1 persona — show picker to add a second
  showDiscussPersonaPicker();
}

function showDiscussPersonaPicker() {
  const allPersonas = [
    ...CHAT_PERSONALITIES.map(p => ({ id: p.id, name: p.name, icon: p.icon })),
    ...getCustomPersonalities().map(p => ({ id: p.id, name: p.name, icon: p.icon || '✏️' }))
  ];
  if (allPersonas.length < 2) return;

  // Remove existing picker
  const existing = document.querySelector('.discuss-persona-picker');
  if (existing) { existing.remove(); return; }

  const container = document.querySelector('.chat-input-area');
  if (!container) return;

  // Find which persona is already active in this thread
  const activePersonaIds = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName) {
      const bp = CHAT_PERSONALITIES.find(p => p.name === m.personalityName);
      if (bp) activePersonaIds.add(bp.id);
      else {
        const cp = getCustomPersonalities().find(p => p.name === m.personalityName);
        if (cp) activePersonaIds.add(cp.id);
      }
    }
  }
  const hasActive = activePersonaIds.size > 0;
  const needsOne = hasActive && activePersonaIds.size < 2;

  const picker = document.createElement('div');
  picker.className = 'discuss-persona-picker';
  picker.innerHTML = `
    <div class="discuss-picker-header">${needsOne ? 'Add another persona to the debate' : 'Pick two personas to debate'}</div>
    <div class="discuss-picker-list">
      ${allPersonas.map(p => {
        const isActive = activePersonaIds.has(p.id);
        const checked = isActive ? ' checked' : '';
        const locked = isActive && needsOne;
        return `<label class="discuss-picker-item${locked ? ' locked' : ''}">
        <input type="checkbox" value="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}" data-icon="${escapeHTML(p.icon)}"${checked}${locked ? ' disabled' : ''} data-locked="${locked ? '1' : ''}">
        <span>${p.icon} ${escapeHTML(p.name)}</span>
      </label>`;
      }).join('')}
    </div>
    <button class="discuss-picker-start"${needsOne ? '' : ' disabled'} onclick="startDiscussionFromPicker()">${needsOne ? 'Add to Discussion' : 'Start Debate'}</button>`;

  function updatePickerState() {
    const lockedCount = picker.querySelectorAll('input[data-locked="1"]').length;
    const checkedCount = picker.querySelectorAll('input:checked:not([data-locked="1"])').length;
    const total = lockedCount + checkedCount;
    const startBtn = picker.querySelector('.discuss-picker-start');
    startBtn.disabled = total !== 2;
    // Limit to 2 total
    if (total >= 2) {
      picker.querySelectorAll('input:not(:checked):not([data-locked="1"])').forEach(cb => cb.disabled = true);
    } else {
      picker.querySelectorAll('input:not([data-locked="1"])').forEach(cb => cb.disabled = false);
    }
  }
  picker.addEventListener('change', updatePickerState);
  updatePickerState();

  container.insertBefore(picker, container.firstChild);
}

export async function startDiscussionFromPicker() {
  const picker = document.querySelector('.discuss-persona-picker');
  if (!picker) return;
  // Collect locked (already in thread) and newly checked personas
  const lockedInputs = picker.querySelectorAll('input[data-locked="1"]');
  const checkedInputs = picker.querySelectorAll('input:checked:not([data-locked="1"])');
  const allSelected = [...lockedInputs, ...checkedInputs];
  if (allSelected.length !== 2) return;

  const lockedIds = new Set(Array.from(lockedInputs).map(cb => cb.value));
  const allPersonas = allSelected.map(cb => ({
    id: cb.value,
    name: cb.dataset.name,
    icon: cb.dataset.icon
  }));
  // Only the NEW persona (not locked) responds — they're joining the conversation
  const newPersonas = allPersonas.filter(p => !lockedIds.has(p.id));
  picker.remove();

  if (newPersonas.length > 0) {
    // Adding a second persona — only they respond (one turn)
    return _runSingleTurn(newPersonas[0], allPersonas);
  }
  // Shouldn't happen, but fallback
  return _runDiscussion(allPersonas);
}

function _finishDiscussionRound(personas, originalPersonality) {
  state.currentChatPersonality = originalPersonality;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, originalPersonality);
  updateDiscussButton();
  updateChatHeaderTitle();
  if (!_chatAbortController) {
    showDiscussContinuePrompt(personas, originalPersonality);
  }
}

async function _runSingleTurn(persona, allPersonas) {
  const originalPersonality = state.currentChatPersonality;
  state.chatHistory.push({ joined: true, joinName: persona.name, joinIcon: persona.icon });
  const joinPrompt = 'You\'ve just joined this conversation. Review the discussion above and weigh in with your perspective.';
  await runDiscussionRound([persona], joinPrompt, { hideAutoMsg: true });
  _finishDiscussionRound(allPersonas, originalPersonality);
}

async function _runDiscussion(personas) {
  const originalPersonality = state.currentChatPersonality;
  await runDiscussionRound(personas);
  _finishDiscussionRound(personas, originalPersonality);
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS (for onclick handlers)
// ═══════════════════════════════════════════════
function _resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  _updateChatInputState();
}

Object.assign(window, {
  _resumeAI,
  buildLabContext,
  getChatStorageKey,
  getChatThreadsKey,
  getChatThreadKey,
  getActivePersonality,
  getCustomPersonalities,
  saveCustomPersonalities,
  getCustomPersonality,
  getCustomPersonalityText,
  pickPersonaIcon,
  generateCustomPersonality,
  autoResizePersonaTextarea,
  markPersonalityDirty,
  snapshotPersonalityClean,
  setChatPersonality,
  loadChatPersonality,
  updateChatHeaderTitle,
  updateChatHeaderModel,
  updatePersonalityBar,
  togglePersonalityBar,
  saveCustomPersonality,
  startNewCustomPersonality,
  deleteCustomPersonality,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  renderChatMessages,
  useChatPrompt,
  applyInlineMarkdown,
  renderMarkdown,
  toggleChatPanel,
  openChatPanel,
  closeChatPanel,
  sendChatMessage,
  handleChatKeydown,
  startDiscussion,
  startDiscussionFromPicker,
  continueDiscussion,
  endDiscussion,
  editCustomPersonality,
  removeDiscussContinuePrompt,
  updateDiscussButton,
  getThreadPersonaCount,
  askAIAboutMarker,
  askAIAboutCorrelations,
  // Thread functions
  loadChatThreads,
  saveChatThreadIndex,
  ensureActiveThread,
  createNewThread,
  switchToThread,
  deleteThread,
  renameThread,
  renameThreadPrompt,
  autoNameThread,
  pruneOldThreads,
  renderThreadList,
  filterThreadList,
  toggleThreadRail,
  // Action bar functions
  getContextSummary,
  buildActionBar,
  regenerateLastMessage,
  copyMessage,
  toggleContextDetails,
  toggleSourcesDetails,
  isGroupInAIContext,
  setGroupInAIContext,
  getChatSourcesEnabled,
  setChatSourcesEnabled,
  searchOpenAlex,
  parseSearchTerms,
  renderSourcesSection,
  // Image attachments
  addImageAttachment,
  toggleHDMode,
  openImageLightbox,
  removeImageAttachment,
  clearAttachments,
  updateAttachButtonVisibility,
  initChatImageHandlers,
  setChatNudge,
  updateChatNudge,
  setChatProfileSex,
  saveChatProfile,
  saveChatLocation,
  saveChatPeriod,
  addChatSupplement,
  removeChatSupplement,
  skipProviderSetup,
  skipOnboardingExtras,
  showCycleNoMensesOptions,
  showCyclePeriodEntry,
  saveCycleStatus,
  _updatePeriodBtn,
  onContextCardSaved,
});
