import { renderHTML as indicatorHTML } from './components/SyncIndicatorPresentation.svelte.html.js';
import { renderHTML as popoverHTML } from './components/SyncPopoverPresentation.svelte.html.js';

export interface SyncIndicatorView {
  state: 'disabled' | 'error' | 'offline' | 'syncing' | 'synced';
  title: string | undefined;
}
export interface SyncPushView { danger: boolean; text: string; }
export interface SyncEventView {
  color: string;
  kind: string;
  age: string;
  text: string;
}
export interface SyncQuotaView { dot: string; color: string; text: string; }
export interface SyncPopoverView {
  relayDot: string;
  relayLabel: string;
  relay: string | null;
  push: SyncPushView;
  pullLabel: string;
  quota: SyncQuotaView | null;
  error: { type: string; age: string } | null;
  events: SyncEventView[];
  stuckPush: boolean;
  notice?: string | null;
  reloadRequired?: boolean;
  debugControls: boolean;
}

/** Public synchronous serializers for the same genuine Svelte owners. */
export function renderSyncIndicatorView(view: SyncIndicatorView): string {
  return indicatorHTML({view});
}
export function renderSyncPopoverView(view: SyncPopoverView): string {
  return popoverHTML({view});
}
