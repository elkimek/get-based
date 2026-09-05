// @ts-check
// Pure conversation-list rendering, separate from async storage and actions.
import { state } from './state.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { getThreadProjectNames } from './chat-thread-search.js';

const THREAD_ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const THREAD_ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
const THREAD_ICON_MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
const THREAD_ICON_FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3z"/></svg>';
const THREAD_ICON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6-3 1-4 4-1 5-2-2-4 4-1-1 4-4-2-2 5-1 4-4z"/></svg>';

/** @param {string} sort @param {string} [filter] */
export function renderChatThreadList(sort, filter) {
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  const sortSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('chat-thread-sort'));
  if (sortSelect) sortSelect.value = sort;
  const compareThreads = (a, b) => sort === 'name'
    ? a.name.localeCompare(b.name)
    : sort === 'oldest'
      ? a.updatedAt.localeCompare(b.updatedAt)
      : b.updatedAt.localeCompare(a.updatedAt);
  let threads = state.chatThreads.slice().sort(compareThreads);
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
  const projects = getThreadProjectNames();

  const renderThread = t => {
    const isActive = t.id === state.currentThreadId;
    const date = new Date(t.updatedAt);
    const dateStr = formatThreadDate(date);
    const icon = t.personalityIcon || personalityMap[t.personality] || personalityMap.default || '';
    const iconTitle = t.personalityName ? ` title="${escapeHTML(t.personalityName)}"` : '';
    const messageCount = Number.isFinite(Number(t.messageCount))
      ? Math.max(0, Math.trunc(Number(t.messageCount)))
      : 0;
    const moveTargets = projects
      .filter(projectName => projectName !== t.projectName)
      .map(projectName => `<button type="button" data-chat-thread-action="move-project" data-thread-id="${escapeAttr(t.id)}" data-project-name="${escapeAttr(projectName)}">${THREAD_ICON_FOLDER}<span>${escapeHTML(projectName)}</span></button>`);
    if (t.projectName) {
      moveTargets.push(`<button type="button" data-chat-thread-action="move-project" data-thread-id="${escapeAttr(t.id)}" data-project-name="">${THREAD_ICON_FOLDER}<span>No project</span></button>`);
    }
    const moveMenu = moveTargets.length
      ? `<div class="chat-thread-move-label">Move to project</div>${moveTargets.join('')}`
      : '';
    return `<div class="chat-thread-item${isActive ? ' active' : ''}${t.pinned ? ' pinned' : ''}" data-thread-id="${escapeAttr(t.id)}" aria-grabbed="false" title="Drag into a project">
      <button type="button" class="chat-thread-item-main" data-chat-thread-action="switch" aria-current="${isActive ? 'true' : 'false'}">
        <span class="chat-thread-item-name">${escapeHTML(t.name)}</span>
        <span class="chat-thread-item-meta">
          <span${iconTitle}>${escapeHTML(icon)}</span>
          <span>${dateStr}</span>
          <span>${messageCount} msg${messageCount !== 1 ? 's' : ''}</span>
        </span>
      </button>
      <details class="chat-thread-item-menu">
        <summary class="chat-thread-item-action" title="Conversation actions" aria-label="Actions for ${escapeHTML(t.name)}">${THREAD_ICON_MORE}</summary>
        <div class="chat-thread-item-menu-popover">
          <button type="button" data-chat-thread-action="pin" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_PIN}<span>${t.pinned ? 'Unpin' : 'Pin'}</span></button>
          <button type="button" data-chat-thread-action="rename" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_EDIT}<span>Rename</span></button>
          ${moveMenu}
          <button type="button" class="delete" data-chat-thread-action="delete" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_DELETE}<span>Delete</span></button>
        </div>
      </details>
    </div>`;
  };
  const renderGroup = (title, items, icon = '', projectName = /** @type {string | null} */ (null)) => items.length
    ? `<section class="chat-thread-group"${projectName !== null ? ` data-chat-project-drop="${escapeAttr(projectName)}"` : ''}><div class="chat-thread-group-title"><span class="chat-thread-group-label">${icon}${escapeHTML(title)}</span>${projectName !== null ? `<details class="chat-project-menu">
        <summary class="chat-project-action" aria-label="Actions for ${escapeAttr(title)}" title="Project actions">${THREAD_ICON_MORE}</summary>
        <div class="chat-project-menu-popover" role="menu">
          <button type="button" data-chat-project-action="rename" data-project-name="${escapeAttr(projectName)}" role="menuitem">${THREAD_ICON_EDIT}<span>Rename project</span></button>
          <button type="button" class="delete" data-chat-project-action="delete" data-project-name="${escapeAttr(projectName)}" role="menuitem">${THREAD_ICON_DELETE}<span>Delete project</span></button>
        </div>
      </details>` : ''}</div>${items.map(renderThread).join('')}</section>`
    : '';
  if (filter?.trim()) {
    list.innerHTML = threads.map(renderThread).join('');
    return;
  }
  const pinned = threads.filter(thread => thread.pinned === true);
  const remaining = threads.filter(thread => thread.pinned !== true);
  const groups = [];
  groups.push(renderGroup('Pinned', pinned, THREAD_ICON_PIN));
  for (const name of projects) {
    groups.push(renderGroup(name, remaining.filter(thread => thread.projectName === name), THREAD_ICON_FOLDER, name));
  }
  const ungrouped = remaining.filter(thread => !thread.projectName);
  if (sort !== 'recent') {
    groups.push(renderGroup('Conversations', ungrouped));
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const updatedTime = thread => {
      const time = new Date(thread.updatedAt).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    groups.push(renderGroup('Today', ungrouped.filter(thread => updatedTime(thread) >= today.getTime())));
    groups.push(renderGroup('Yesterday', ungrouped.filter(thread => {
      const updated = updatedTime(thread);
      return updated >= yesterday.getTime() && updated < today.getTime();
    })));
    groups.push(renderGroup('Earlier', ungrouped.filter(thread => updatedTime(thread) < yesterday.getTime())));
  }
  groups.push('<div class="chat-thread-unfiled-drop" data-chat-project-drop="">Drop here for no project</div>');
  list.innerHTML = groups.join('');
}

function formatThreadDate(date) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
