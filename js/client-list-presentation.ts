import type {ProfileRecord} from './profile.js';
import {renderHTML as overviewHTML} from './components/ClientListOverview.svelte.html.js';
import {renderHTML as menuHTML} from './components/ClientListMenuButton.svelte.html.js';

export type ClientListIconName = 'arrowLeft' | 'camera' | 'archive' | 'close' | 'edit' | 'export' | 'flag' | 'import' | 'more' | 'pin' | 'plus' | 'search' | 'share' | 'trash' | 'user';
export interface ClientListTagView {active: boolean; value: string | null; text: string}
export interface ClientListRowView {
  active: boolean; time: string; note: string; id: string; label: string;
  flagged: boolean; pinned: boolean; tags: readonly string[];
  selectId: string | null; editId: string | null; menuId: string | null; name: string;
  avatar: {kind: 'image'; source: string} | {kind: 'initial'; color: string; initial: string};
}
export interface ClientListOverviewView {
  activeCount: number; search: string; sort: string; status: string;
  showTags: boolean; tags: readonly ClientListTagView[]; clearTag: boolean;
  archivedCount: number; empty: boolean; rows: readonly ClientListRowView[]; archivedRows: readonly ClientListRowView[] | null;
}
export interface ClientListMenuButtonView {
  icon: ClientListIconName; label: string; action: string | null; profileId: string | null; danger: boolean;
}

/** Match native escapeHTML's nullish/String boundary; Svelte owns escaping. */
export function clientListText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
function safeAvatarSource(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('data:image/');
}
function actionValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
export function projectClientListTag(tag: unknown, active: boolean): ClientListTagView {
  const value = actionValue(tag);
  // Actual getAllTags snapshots are strings; nullish hostile tag still omits its data attr.
  return {active, value, text: clientListText(tag)};
}

/** Retain original preamble then template-interpolation read/coercion order. */
export function projectClientListRow(
  p: ProfileRecord, activeId: string | null, timeAgo: (timestamp: number | null | undefined) => string,
  avatarColor: (id: string) => string,
): ClientListRowView {
  const active = p.id === activeId;
  const timeAgoValue = timeAgo(p.lastUpdated);
  const notePreview = (p.notes || '').slice(0, 60).replace(/\n/g, ' ');
  const id = clientListText(p.id);
  const label = clientListText(p.name || 'client');
  const flagged = p.status === 'flagged';
  const pinned = Boolean(p.pinned);
  let tags: string[] = [];
  if (Array.isArray(p.tags) && p.tags.length) {
    tags = p.tags.map(tag => clientListText(tag));
  }
  const selectId = actionValue(p.id);
  let avatar: ClientListRowView['avatar'];
  if (p.avatar && safeAvatarSource(p.avatar)) {
    avatar = {kind: 'image', source: clientListText(p.avatar)};
  } else {
    const color = avatarColor(p.id);
    const initial = (p.name || '?')[0]!.toUpperCase();
    // Native template interpolations use the string hint and throw for Symbol results.
    avatar = {kind: 'initial', color: `${color}`, initial: `${initial}`};
  }
  const name = clientListText(p.name);
  const time = clientListText(timeAgoValue);
  const note = notePreview ? clientListText(notePreview) : '';
  const editId = actionValue(p.id);
  const menuId = actionValue(p.id);
  return {active, time, note, id, label, flagged, pinned, tags, selectId, editId, menuId, name, avatar};
}

export function renderClientListOverview(view: ClientListOverviewView): string {
  return overviewHTML({view});
}
export function renderClientListMenuButton(
  icon: ClientListIconName, label: unknown, action: unknown, profileId: unknown, danger: unknown,
): string {
  const view: ClientListMenuButtonView = {
    danger: Boolean(danger), action: actionValue(action), profileId: actionValue(profileId),
    icon, label: clientListText(label),
  };
  return menuHTML({view});
}
