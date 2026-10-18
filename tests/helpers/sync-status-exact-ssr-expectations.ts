import type { SyncPopoverView } from '../../js/sync-status-rendering.js';

/** Immutable pre-migration fixture shape. Encoded fields become literal DTO fields. */
export interface OriginalSyncPopoverView extends Omit<SyncPopoverView, 'relay' | 'error' | 'events'> {
  relayHTML: string | null;
  error: { typeHTML: string; age: string } | null;
  events: { color: string; kindHTML: string; age: string; textHTML: string }[];
}
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
function decodeFixtureText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (_whole, entity: string) => entities[entity]!);
}
const escapeText = (value: string): string => value.replace(/[&<]/g, char => char === '&' ? '&amp;' : '&lt;');
export function literalSyncView(old: OriginalSyncPopoverView): SyncPopoverView {
  return { relayDot: old.relayDot, relayLabel: old.relayLabel,
    relay: old.relayHTML === null ? null : decodeFixtureText(old.relayHTML),
    push: old.push, pullLabel: old.pullLabel, quota: old.quota,
    error: old.error ? { type: decodeFixtureText(old.error.typeHTML), age: old.error.age } : null,
    events: old.events.map(event => ({ color: event.color, kind: event.kindHTML,
      age: event.age, text: decodeFixtureText(event.textHTML) })),
    stuckPush: old.stuckPush, debugControls: old.debugControls };
}
/**
 * Independent byte oracle: native mode must match every retained original byte.
 * Genuine mode adds the exact owned SSR graph and encodes literal event kinds.
 * Neither mode imports a renderer, reads component source, nor removes comments.
 */
export function expectedSyncPopover(old: OriginalSyncPopoverView, mode: 'native' | 'genuine'): string {
  const genuine = mode === 'genuine';
  const literal = (encoded: string): string => genuine ? escapeText(decodeFixtureText(encoded)) : encoded;
  const branch = (active: boolean, content: string): string => genuine
    ? (active ? '<!--[0-->' + content : '<!--[-1-->') + '<!--]-->' : active ? content : '';
  const events = old.events.map(event => '<div style="margin-bottom:3px"><span style="color:' + event.color
    + ';font-weight:600">' + (genuine ? escapeText(event.kindHTML) : event.kindHTML) + '</span> · ' + event.age
    + ' · <span style="font-family:monospace;font-size:10px">' + literal(event.textHTML) + '</span></div>').join('');
  const body = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${old.relayDot};display:inline-block"></span><span style="font-size:13px">${old.relayLabel}</span></div>
    ${branch(old.relayHTML !== null, '<div style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-bottom:8px;word-break:break-all">' + literal(old.relayHTML ?? '') + '</div>')}
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      <div>Push: ${genuine ? (old.push.danger ? '<!--[0-->' : '<!--[-1-->') : ''}${old.push.danger ? '<span style="color:var(--red)">' + old.push.text + '</span>' : old.push.text}${genuine ? '<!--]-->' : ''}</div>
      <div>Pull: ${old.pullLabel}</div>
      ${branch(old.quota !== null, old.quota ? '<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="width:6px;height:6px;border-radius:50%;background:' + old.quota.dot + ';display:inline-block"></span><span style="color:' + old.quota.color + '">' + old.quota.text + '</span></div>' : '')}
    </div>
    ${branch(old.error !== null, old.error ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">' + literal(old.error.typeHTML) + ' ' + old.error.age + '</div>' : '')}
    ${branch(old.events.length > 0, `
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);max-height:160px;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-weight:600;color:var(--text-secondary);flex:1">Recent activity</span>
        <button class="ctx-btn-option" style="font-size:10px;padding:2px 8px" data-sync-ui-action="copy-events" title="Copy events to clipboard">Copy</button>
      </div>
      ${genuine ? '<!--[-->' : ''}${events}${genuine ? '<!--]-->' : ''}
    </div>`)}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="ctx-btn-option" style="font-size:12px" data-sync-ui-action="sync-now">Sync now</button>
      ${branch(old.stuckPush, '<button class="ctx-btn-option" style="font-size:12px;color:var(--red);border-color:var(--red)" data-sync-ui-action="reload" title="Reloads the page to re-init the sync worker.">Reload</button>')}
      <button class="ctx-btn-option" style="font-size:12px" data-sync-ui-action="open-settings">Settings</button>
      <button class="ctx-btn-option" style="font-size:12px" data-sync-ui-action="show-diagnose">Sync status</button>
      ${branch(old.debugControls, `
        <button class="ctx-btn-option" style="font-size:12px${old.stuckPush ? ';color:var(--orange);border-color:var(--orange)' : ''}" data-sync-ui-action="force-resend" title="Bypasses the in-flight guard. Use when Sync now isn't reaching the relay (typically because a prior push got stuck and the worker still thinks it's running).">Force resend</button>
        <button class="ctx-btn-option" style="font-size:12px" data-sync-ui-action="clean-storage" title="Trim changeHistory to its 200-entry cap and clear cached AI model lists. Use when localStorage is full and pushes throw QuotaExceededError silently.">Clean storage</button>
        <button class="ctx-btn-option" style="font-size:12px" data-sync-ui-action="test-relay">Test relay</button>
      `)}
    </div>`;
  return genuine ? '<!--[--><!---->' + body + '<!--]-->' : body;
}
export function expectedSyncIndicator(nativeHTML: string | null): string | null {
  return nativeHTML ? '<!--[-->' + nativeHTML + '<!--]-->' : nativeHTML;
}
/** Test oracle only; production components no longer authenticate compiler output. */
export function requireExactSyncGraph(actual: string, expected: string): void {
  if (actual !== expected) throw new Error('Changed genuine Sync SSR graph');
}
