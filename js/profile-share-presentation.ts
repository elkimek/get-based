import {renderHTML as renderActiveHTML} from './components/ProfileShareActive.svelte.html.js';
import {renderHTML as renderCreateHTML} from './components/ProfileShareCreate.svelte.html.js';
import {renderHTML as renderResultHTML} from './components/ProfileShareResult.svelte.html.js';
import {renderHTML as renderLoadHTML} from './components/ProfileShareLoad.svelte.html.js';
import {renderHTML as renderShellHTML} from './components/ProfileShareShell.svelte.html.js';
import type {ShareRecord, ShareResultReader} from '../types/profile-share.js';

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);

type ActiveShareRecord<Expiry> = Pick<ShareRecord, 'id' | 'shareUrl'> & {expiresAt: Expiry};
export interface ActiveShareRow {readonly id: string; readonly expiry: string; readonly shareUrl: string; readonly deleteId: string}
export interface ActiveShareView {readonly rows: readonly ActiveShareRow[]; readonly profileId: string}
export interface CreateShareView {readonly profileName: string; readonly profileId: string; readonly secret: string; readonly active: ActiveShareView}
export interface ResultShareView {readonly profileName: string; readonly shareUrl: string; readonly password: string; readonly expiry: string; readonly active: ActiveShareView}
export interface LoadShareView {readonly id: string}
export type ShareBodyView =
  | Readonly<{kind: 'active'; view: ActiveShareView}>
  | Readonly<{kind: 'create'; view: CreateShareView}>
  | Readonly<{kind: 'result'; view: ResultShareView}>
  | Readonly<{kind: 'load'; view: LoadShareView}>;
export interface ShellShareView {readonly titleAttribute: string; readonly kicker: string; readonly title: string; readonly body: ShareBodyView}

export function projectActiveShare<Expiry>(records: ActiveShareRecord<Expiry>[], expiry: (value: Expiry) => string, profileId: () => unknown): ActiveShareView {
  // Original map completes every row before the section's profile-id coercion.
  const rows = records.map(record => {
    const id = text(record.id);
    const formattedExpiry = text(expiry(record.expiresAt));
    const shareUrl = text(record.shareUrl);
    const deleteId = text(record.id);
    return {id, expiry: formattedExpiry, shareUrl, deleteId};
  });
  return {rows, profileId: text(profileId())};
}
export function projectCreateShare(name: () => unknown, profileId: () => unknown, secret: unknown, active: () => ActiveShareView): CreateShareView {
  const profileName = text(name());
  const id = text(profileId());
  const password = text(secret);
  const activeView = active();
  return {profileName, profileId: id, secret: password, active: activeView};
}
export function projectResultShare(result: ShareResultReader, expiry: (value: ShareResultReader['expiresAt']) => string, active: () => ActiveShareView): ResultShareView {
  const profileName = text(result.profileName);
  const shareUrl = text(result.shareUrl);
  const password = text(result.password);
  const formattedExpiry = text(expiry(result.expiresAt));
  const activeView = active();
  return {profileName, shareUrl, password, expiry: formattedExpiry, active: activeView};
}
export function projectShareShell(title: unknown, kicker: unknown, body: ShareBodyView): ShellShareView {
  const titleAttribute = text(title);
  const kickerText = text(kicker);
  const titleText = text(title);
  if (!body || typeof body !== 'object' || !['active', 'create', 'result', 'load'].includes(body.kind))
    throw new TypeError('Profile share body must be a typed owner view');
  return {titleAttribute, kicker: kickerText, title: titleText, body};
}
export function renderActiveShare<Expiry>(records: ActiveShareRecord<Expiry>[], expiry: (value: Expiry) => string, profileId: () => unknown): string {
  return renderActiveHTML({view: projectActiveShare(records, expiry, profileId)});
}
export function renderCreateShare(name: () => unknown, profileId: () => unknown, secret: unknown, active: () => ActiveShareView): string {
  return renderCreateHTML({view: projectCreateShare(name, profileId, secret, active)});
}
export function renderResultShare(result: ShareResultReader, expiry: (value: ShareResultReader['expiresAt']) => string, active: () => ActiveShareView): string {
  return renderResultHTML({view: projectResultShare(result, expiry, active)});
}
export function renderLoadShare(id: unknown): string {
  return renderLoadHTML({view: {id: text(id)}});
}
export function renderShareShell(title: unknown, kicker: unknown, body: ShareBodyView): string {
  return renderShellHTML({view: projectShareShell(title, kicker, body)});
}
