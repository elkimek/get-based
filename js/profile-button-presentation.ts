import type { StoredProfileRecord } from './profile-list-store.js';

export interface ProfileButtonView {
  badge: { kind: 'image'; source: string } | { kind: 'initial'; background: string; initial: string };
  name: string;
}

/** Same null/undefined and String boundary as native escaping; Svelte escapes the resulting text. */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Selection and the real profile service stay in nav; preserve its original read/coercion order. */
export function projectProfileButton(
  active: Pick<StoredProfileRecord, 'id' | 'name' | 'avatar'>,
  avatarColor: (id: string) => string,
): ProfileButtonView {
  let badge: ProfileButtonView['badge'];
  if (active.avatar) {
    badge = { kind: 'image', source: text(active.avatar) };
  } else {
    const background = avatarColor(active.id);
    const initial = text((active.name || '?')[0]!.toUpperCase());
    badge = { kind: 'initial', background, initial };
  }
  return { badge, name: text(active.name) };
}
