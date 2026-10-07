import type { ChatThread } from '../types/chat-data.js';
import type { ChatThreadGroup, ChatThreadNavigationState, ChatThreadRow } from './chat-thread-navigation-contract.js';

export function threadProjectNames(threads: readonly ChatThread[]): string[] {
  return [...new Set(threads.map(thread => String(thread.projectName || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function formatThreadDate(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function projectThreadNavigation(threads: readonly ChatThread[], activeId: string | null, sort: string, query: string,
  projects: string[], personalities: Readonly<Record<string, string>>, now = new Date()): ChatThreadNavigationState {
  const normalized = query.trim().toLowerCase();
  const rows: ChatThreadRow[] = threads.slice().sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
    : sort === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt))
    .filter(thread => !normalized || thread.name.toLowerCase().includes(normalized))
    .map(thread => ({ id: thread.id, name: thread.name, date: formatThreadDate(new Date(thread.updatedAt), now),
      icon: thread.personalityIcon || personalities[thread.personality || 'default'] || personalities.default || '',
      personalityName: thread.personalityName || '', messageCount: Number.isFinite(Number(thread.messageCount)) ? Math.max(0, Math.trunc(Number(thread.messageCount))) : 0,
      pinned: thread.pinned === true, projectName: thread.projectName || '', active: thread.id === activeId }));
  const groups: ChatThreadGroup[] = [];
  function group(id: string, label: string, items: ChatThreadRow[], icon: ChatThreadGroup['icon'] = null, projectName: string | null = null): void {
    if (items.length) groups.push({ id, label, icon, projectName, threads: items });
  }
  if (normalized) group('filtered', '', rows);
  else {
    group('pinned', 'Pinned', rows.filter(thread => thread.pinned), 'pin');
    for (const project of projects) group('project:' + project, project, rows.filter(thread => !thread.pinned && thread.projectName === project), 'folder', project);
    const ungrouped = rows.filter(thread => !thread.pinned && !thread.projectName);
    if (sort !== 'recent') group('conversations', 'Conversations', ungrouped);
    else {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const updated = new Map(threads.map(thread => [thread.id, Number.isFinite(new Date(thread.updatedAt).getTime()) ? new Date(thread.updatedAt).getTime() : 0]));
      group('today', 'Today', ungrouped.filter(thread => updated.get(thread.id)! >= today.getTime()));
      group('yesterday', 'Yesterday', ungrouped.filter(thread => updated.get(thread.id)! >= yesterday.getTime() && updated.get(thread.id)! < today.getTime()));
      group('earlier', 'Earlier', ungrouped.filter(thread => updated.get(thread.id)! < yesterday.getTime()));
    }
  }
  return { query, projects: [...projects], groups, empty: rows.length === 0 };
}
