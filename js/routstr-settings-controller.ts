import { canonicalRoutstrUrl } from './url-safety.js';
import type { RoutstrRecoveryKind, RoutstrSettingsView } from './routstr-settings-contract.js';
export interface RoutstrSettingsDependencies {
  selected(): string; key(): string; isActive(): boolean;
  discover(): Promise<readonly { online: boolean | null; urls: string[]; name?: unknown }[]> | null; select(node: string): unknown;
  recover(kind: RoutstrRecoveryKind): Promise<unknown>; refund(): Promise<unknown>;
  receive(token: string): Promise<unknown>; clear(kind: RoutstrRecoveryKind): Promise<unknown>;
  refreshWallet(): Promise<unknown>; writeClipboard(text: string): Promise<void>; scheduleClear(clear: () => void): unknown;
}
export function createRoutstrSettingsController(deps: RoutstrSettingsDependencies) {
  const initialized = new WeakSet<RoutstrSettingsView>(); let busy = false;
  const current = (view: RoutstrSettingsView) => view.isCurrent() && deps.isActive();
  function updateRecovery(view: RoutstrSettingsView, kind: RoutstrRecoveryKind, text: string, danger = false): void {
    if (current(view)) view.setState({ ...view.getState(), recoveries: { ...view.getState().recoveries, [kind]: { ...view.getState().recoveries[kind], status: { text, tone: danger ? 'danger' : 'success' } } } });
  }
  async function discover(view: RoutstrSettingsView): Promise<void> {
    const selected = deps.selected(), key = deps.key(); if (selected || !current(view)) return;
    const owns = () => current(view) && deps.selected() === selected && deps.key() === key;
    try {
      const request = deps.discover(); if (!request) { if (owns()) view.setState({ ...view.getState(), nodeLabel: 'discovery unavailable' }); return; }
      const nodes = await request; if (!owns()) return;
      for (const node of nodes) {
        if (node.online !== true || !Array.isArray(node.urls)) continue;
        for (const url of node.urls) {
          let valid; try { valid = canonicalRoutstrUrl(url); } catch { continue; }
          deps.select(valid); view.setAccount({ node: valid, key: deps.key() }, typeof node.name === 'string' && node.name ? node.name : valid.replace(/^https?:\/\//, '')); return;
        }
      }
      view.setState({ ...view.getState(), nodeLabel: 'no nodes online' });
    } catch { if (owns()) view.setState({ ...view.getState(), nodeLabel: 'discovery failed' }); }
  }
  async function initialize(view: RoutstrSettingsView): Promise<void> {
    if (!current(view) || initialized.has(view)) return; initialized.add(view);
    await Promise.allSettled([discover(view), ...(['deposit','withdraw'] as const).map(async kind => {
      try { const token = await deps.recover(kind); if (current(view) && typeof token === 'string' && token) view.showRecovery(kind, token); }
      catch { /* The journal remains owned by wallet recovery; reopening can retry. */ }
    }), (async () => {
      try { const refund = await deps.refund() as { nodeUrl?: unknown } | null; if (!current(view) || typeof refund?.nodeUrl !== 'string') return;
        const node = canonicalRoutstrUrl(refund.nodeUrl); view.setState({ ...view.getState(), refundNode: node });
      } catch { /* Preserve independent saved refund records. */ }
    })()]);
  }
  async function copy(view: RoutstrSettingsView, kind: RoutstrRecoveryKind): Promise<void> {
    const token = view.readRecovery(kind); if (!current(view) || !token) return;
    try { await deps.writeClipboard(token); deps.scheduleClear(() => { void deps.writeClipboard('').catch(() => {}); });
      if (current(view) && view.readRecovery(kind) === token) view.setState({ ...view.getState(), recoveries: { ...view.getState().recoveries, [kind]: { ...view.getState().recoveries[kind], copied: true } } });
    } catch { updateRecovery(view, kind, 'Clipboard copy failed. Select and copy the token manually.', true); }
  }
  async function reclaim(view: RoutstrSettingsView, kind: RoutstrRecoveryKind): Promise<void> {
    const token = view.readRecovery(kind); if (!current(view) || !token || busy) return;
    busy = true; view.setState({ ...view.getState(), recoveries: { ...view.getState().recoveries, [kind]: { ...view.getState().recoveries[kind], pending: true } } });
    try {
      const fresh = await deps.recover(kind);
      if (!current(view)) return;
      if (fresh !== token || view.readRecovery(kind) !== token) { updateRecovery(view, kind, 'The saved recovery changed. Close and reopen Settings to review it.', true); return; }
      // Once accepted, domain receive/reconciliation finishes even if the view closes.
      await deps.receive(token); await deps.clear(kind);
      if (current(view) && view.readRecovery(kind) === token) { view.showRecovery(kind, ''); updateRecovery(view, kind, 'Recovered to your wallet.'); }
      await deps.refreshWallet();
    } catch { updateRecovery(view, kind, 'Recovery is still unconfirmed. The token and journal are preserved; check its original node or recipient before retrying.', true); }
    finally { busy = false; if (current(view)) view.setState({ ...view.getState(), recoveries: { ...view.getState().recoveries, [kind]: { ...view.getState().recoveries[kind], pending: false } } }); }
  }
  return { initialize, copy, reclaim };
}
