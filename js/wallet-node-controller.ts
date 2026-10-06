import type { WalletNodeView, WalletNodeState, WalletNodeRecovery, WalletNodeRow } from './wallet-node-contract.js';
import { canonicalRoutstrUrl } from './routstr-validation.js';
interface NodeDependencies {
  view(): WalletNodeView | null; open(mode: WalletNodeState['mode'], node?: string): WalletNodeView | null; close(view: WalletNodeView): void; isActive(): boolean;
  selected(): string; key(node: string): string; mint(): Promise<string>; balance(): Promise<unknown>; inventory(): Promise<unknown>;
  accepted(node: string): Promise<string[]>; discover(refresh: boolean): Promise<unknown>; activate(node: string): Promise<boolean>;
  connect(node: string, current: () => boolean): Promise<void>; captureFinish(node: string): (amount: number) => Promise<void>;
  deposit(node: string, amount: number, key: string, mint: string): Promise<unknown>; reset(node: string, key: string): Promise<unknown>;
  hasSeed(): Promise<unknown>; seed(continueAction: () => unknown): Promise<unknown>;
  refund(node: string, id?: string, token?: string, generation?: string, key?: string): Promise<unknown>;
  saved(node?: string): Promise<unknown>; tokenMint(token: string): Promise<unknown>; receive(token: string): Promise<unknown>;
  finishRefund(token: string): Promise<unknown>; recoverDeposit(node: string): Promise<unknown>; clearDeposit(): Promise<unknown>;
  refreshWallet(): unknown; refreshNode(): unknown; chooseMint(mint: string): Promise<void>;
  writeClipboard(token: string): Promise<void>; scheduleClear(clear: () => void): void;
  notify(text: string, tone: 'success' | 'info'): void;
}
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object') throw new Error('Invalid node response'); return value as Record<string, unknown>; };
function sats(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid amount'); return value; }
function recovery(value: unknown, node = ''): WalletNodeRecovery {
  const item = object(value);
  return { node: canonicalRoutstrUrl(typeof item.nodeUrl === 'string' ? item.nodeUrl : node), id: typeof item.recoveryId === 'string' ? item.recoveryId : '', generation: typeof item.generation === 'string' ? item.generation : '', token: typeof item.token === 'string' ? item.token : typeof item.recoveryToken === 'string' ? item.recoveryToken : '', mint: typeof item.mint === 'string' ? item.mint : '', createdAt: typeof item.createdAt === 'number' && Number.isSafeInteger(item.createdAt) && item.createdAt > 0 && item.createdAt <= 8640000000000000 ? item.createdAt : 0 };
}
function nodeRows(value: unknown): { discovered: number; nodes: WalletNodeRow[] } {
  if (!Array.isArray(value)) throw new Error('Invalid node catalog'); const nodes = new Map<string, WalletNodeRow>();
  for (const raw of value) {
    const item = object(raw); if (!item.online) continue;
    const url = canonicalRoutstrUrl(Array.isArray(item.urls) ? item.urls[0] : '');
    nodes.set(url, { url, name: typeof item.name === 'string' && item.name ? item.name : url.replace(/^https?:\/\//, ''), operator: typeof item.pubkey === 'string' && item.pubkey ? item.pubkey : 'unknown', models: typeof item.modelCount === 'number' ? sats(item.modelCount) : 0, tor: !!item.onion, privateTee: Array.isArray(item.models) && item.models.some(model => typeof model === 'object' && model && typeof model.id === 'string' && model.id.startsWith('tinfoil-')) });
  }
  return { discovered: value.length, nodes: [...nodes.values()] };
}
export function createWalletNodeController(deps: NodeDependencies) {
  let reading = 0; let busy = false; let copying = false; let loading: WalletNodeView | null = null;
  // Keep a received-but-uncommitted token privately available across view closure.
  const held = new Map<string, WalletNodeRecovery>();
  const current = (view: WalletNodeView) => deps.isActive() && view.isCurrent() && deps.view() === view;
  const status = (view: WalletNodeView, text: string, tone: 'secondary' | 'danger' | 'success' = 'secondary') => { if (current(view)) view.setState({ ...view.getState(), status: { text, tone } }); };
  const context = (view: WalletNodeView) => { const selected = deps.selected(); const session = view.readSession(); return () => current(view) && deps.selected() === selected && (!session || deps.key(session.node) === session.key); };
  function finishRead(view: WalletNodeView, request: number): void { if (request !== reading) return; loading = null; if (current(view)) view.setState({ ...view.getState(), pending: busy }); }
  async function browse(refresh = false): Promise<void> {
    const old = deps.view(); if (!refresh && old?.getState().mode === 'browse' && current(old)) { deps.close(old); ++reading; return; }
    const view = deps.open('browse'); if (!view) return; const request = ++reading; loading = view; const owns = context(view);
    try { const catalog = nodeRows(await deps.discover(refresh)); if (request === reading && owns()) view.setState({ ...view.getState(), ...catalog, phase: catalog.nodes.length ? 'ready' : 'empty' }); }
    catch { if (request === reading) status(view, 'Node discovery unavailable. Refresh nodes to retry.', 'danger'); }
    finally { finishRead(view, request); }
  }
  async function depositForm(input: string): Promise<void> {
    const node = canonicalRoutstrUrl(input); const view = deps.open('deposit', node); if (!view) return;
    const request = ++reading; loading = view; view.setSession({ node, key: deps.key(node) }); const owns = context(view);
    try {
      const mint = await deps.mint(); if (!owns() || request !== reading) return;
      const [accepted, rawBalance] = await Promise.all([deps.accepted(node), deps.balance()]); const balance = sats(rawBalance);
      if (!owns() || request !== reading || mint !== await deps.mint() || !owns() || request !== reading) return;
      if (accepted.length && !accepted.includes(mint)) {
        const inventory = await deps.inventory(); if (!Array.isArray(inventory)) throw new Error('Invalid mint inventory');
        const entries = accepted.map(mint => { const row = inventory.find(raw => object(raw).mint === mint); return { mint, balance: row ? sats(object(row).balance) : null }; });
        if (owns() && request === reading) view.setState({ ...view.getState(), mint, balance, accepted: entries, phase: 'mints' });
      } else view.setState({ ...view.getState(), mint, balance, phase: balance ? 'ready' : 'empty' });
    } catch { if (request === reading) { if (current(view)) view.setState({ ...view.getState(), phase: 'error' }); status(view, 'Could not check this node’s accepted mints. Try again.', 'danger'); } }
    finally { finishRead(view, request); }
  }
  async function operation(view: WalletNodeView, task: () => Promise<void>): Promise<void> {
    if (!current(view) || busy || view.getState().pending) return; busy = true; view.setState({ ...view.getState(), pending: true });
    try { await task(); }
    finally { busy = false; const latest = deps.view(); if (latest && current(latest)) latest.setState({ ...latest.getState(), pending: loading === latest }); }
  }
  async function connect(input: string): Promise<void> {
    const view = deps.view(); if (!view) return; const node = canonicalRoutstrUrl(input); const owns = context(view);
    await operation(view, async () => { try { if (!await deps.activate(node) || !owns()) return; await deps.connect(node, () => current(view)); } catch { status(view, 'Node selection unavailable. Saved sessions and recovery records are preserved.', 'danger'); } });
  }
  async function showDepositRecovery(view: WalletNodeView): Promise<void> {
    const token = await deps.recoverDeposit(view.getState().node); if (!current(view) || typeof token !== 'string' || !token) return;
    const mint = await deps.tokenMint(token); if (!current(view)) return;
    const node = view.getState().node; view.clearPrivateFields(); view.setRecoveries([{ node, mint: typeof mint === 'string' ? mint : '', token, id: '', generation: '', createdAt: 0 }]);
    view.setState({ ...view.getState(), mode: 'recovery', phase: 'ready' }); status(view, 'Deposit outcome unconfirmed. Its recovery record is retained.', 'danger');
  }
  async function deposit(requested?: number): Promise<void> {
    const view = deps.view(); if (!view || view.getState().mode !== 'deposit') return;
    await operation(view, async () => {
      const draft = view.readAmount(); const amount = requested ?? (/^\d+$/.test(draft) ? Number(draft) : NaN); const session = view.readSession(); const mint = view.getState().mint;
      if (!Number.isSafeInteger(amount) || amount < 1) { status(view, 'Enter a valid whole amount', 'danger'); return; }
      if (!session || !mint) { status(view, 'Reopen the node controls to check this account and mint.', 'danger'); return; }
      const owns = context(view); const finish = deps.captureFinish(session.node);
      try {
        const accepted = await deps.accepted(session.node); if (!owns() || (requested === undefined && draft !== view.readAmount())) return;
        if (mint !== await deps.mint() || !owns() || deps.key(session.node) !== session.key) { status(view, 'Wallet mint or node session changed. Reopen deposit before continuing.', 'danger'); return; }
        if (accepted.length && !accepted.includes(mint)) { status(view, 'Select a mint accepted by this node before depositing. Your other balances remain available.', 'danger'); return; }
        if (!await deps.activate(session.node) || !owns()) { status(view, 'Node verified — AI not activated'); return; }
        status(view, 'Depositing ' + amount.toLocaleString() + ' sats…');
        const result = object(await deps.deposit(session.node, amount, session.key, mint));
        if (typeof result.api_key !== 'string' || !/^sk-[A-Za-z0-9_-]+$/.test(result.api_key)) throw new Error('Invalid deposit result');
        deps.refreshWallet(); deps.refreshNode(); await finish(amount);
        if (current(view)) { view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'paid' }); status(view, 'Node deposit confirmed.', 'success'); }
      } catch (error) {
        deps.refreshWallet();
        if (objectError(error).nodeSessionRejected) { if (current(view)) view.setState({ ...view.getState(), phase: 'rejected' }); status(view, 'The node rejected this saved session. Wallet funds were not moved.', 'danger'); return; }
        status(view, 'Node deposit outcome unconfirmed. Check recovery before retrying.', 'danger');
        try { await showDepositRecovery(view); } catch { status(view, 'Deposit outcome unconfirmed. Recovery unavailable; its record is retained.', 'danger'); }
      }
    });
  }
  async function resetSession(): Promise<void> {
    const view = deps.view(); const session = view?.readSession(); if (!view || !session) return;
    await operation(view, async () => {
      const owns = context(view);
      try { if (!owns() || deps.key(session.node) !== session.key) return; await deps.reset(session.node, session.key); deps.notify('Previous node session preserved. Your next deposit creates a new session.', 'success'); if (current(view)) await depositForm(session.node); }
      catch { status(view, 'Session reset unavailable. Previous keys and pending deposits are preserved.', 'danger'); }
    });
  }
  async function enrich(record: WalletNodeRecovery): Promise<WalletNodeRecovery> {
    if (!record.token) return record; try { const mint = await deps.tokenMint(record.token); return { ...record, mint: typeof mint === 'string' ? mint : record.mint }; } catch { return record; }
  }
  async function saved(node?: string): Promise<void> {
    const filter = node === undefined ? undefined : canonicalRoutstrUrl(node); const view = deps.open('refunds', filter); if (!view) return;
    const request = ++reading; loading = view; const owns = context(view);
    try {
      const raw = await deps.saved(filter); if (!Array.isArray(raw)) throw new Error('Invalid refunds');
      const records = raw.map(item => recovery(item));
      for (const pending of held.values()) { if (filter && pending.node !== filter) continue; const index = records.findIndex(record => record.id === pending.id && record.generation === pending.generation); if (index < 0) records.push(pending); else if (!records[index]!.token) records[index] = pending; }
      const enriched = await Promise.all(records.map(enrich));
      if (request === reading && owns()) { view.setRecoveries(enriched); view.setState({ ...view.getState(), phase: enriched.length ? 'ready' : 'empty' }); }
    } catch { if (request === reading) status(view, 'Saved refunds unavailable. Recovery records remain preserved.', 'danger'); }
    finally { finishRead(view, request); }
  }
  async function withdraw(input: string, id?: string, token?: string, generation?: string): Promise<void> {
    if (busy || !deps.isActive()) return;
    const node = canonicalRoutstrUrl(input); const view = deps.open('refund', node); if (!view) return;
    view.setSession({ node, key: deps.key(node) }); view.setState({ ...view.getState(), pending: false, phase: 'ready' }); const owns = context(view); const expectedKey = id ? undefined : deps.key(node);
    let resume = false; let acceptedRecord: WalletNodeRecovery | null = null;
    await operation(view, async () => {
      try {
        if (!await deps.hasSeed()) { if (owns()) await deps.seed(() => { if (!owns()) return; if (busy) { resume = true; return; } return withdraw(node, id, token, generation); }); return; }
        if (!owns()) return; status(view, 'Checking node refund…');
        const refund = await enrich(recovery(await deps.refund(node, id, token, generation, expectedKey), node));
        if (!refund.token) throw new Error('Invalid refund token'); acceptedRecord = refund; held.set(refund.id + refund.generation, refund);
        const received = sats(object(await deps.receive(refund.token)).received); await deps.finishRefund(refund.token); held.delete(refund.id + refund.generation);
        deps.refreshWallet(); deps.refreshNode(); deps.notify('Withdrawn ⚡ ' + received.toLocaleString() + ' sats to wallet', 'success');
        if (current(view)) { view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'paid' }); status(view, 'Node refund received in your wallet.', 'success'); }
      } catch (error) {
        const fields = objectError(error); let record: WalletNodeRecovery | null = null;
        try { record = recovery({ ...fields, nodeUrl: node, ...(id ? { recoveryId: id, generation, token: token || (fields.recoveryId === id && fields.generation === generation ? fields.recoveryToken : '') } : {}) }, node); } catch {}
        const retained = record?.id ? held.get(record.id + record.generation) : null; record = acceptedRecord || retained || record;
        if (record?.token) held.set(record.id + record.generation, record);
        if (current(view) && record && (record.id || record.token)) view.setRecoveries([record]);
        status(view, 'Node refund outcome unconfirmed. Keep its recovery token and retry this saved record.', 'danger');
      }
    });
    if (resume && owns()) await withdraw(node, id, token, generation);
  }
  async function retry(index: number): Promise<void> { const view = deps.view(); const record = view?.readRecovery(index); if (view && record && current(view)) await withdraw(record.node, record.id, record.token, record.generation); }
  async function copy(index: number): Promise<void> {
    const view = deps.view(); const record = view?.readRecovery(index); if (!view || !record?.token || !current(view) || copying || busy) return; copying = true;
    try { await deps.writeClipboard(record.token); deps.scheduleClear(() => { void deps.writeClipboard('').catch(() => {}); }); if (current(view) && view.readRecovery(index) === record) status(view, 'Token copied (clears in 60s)', 'success'); }
    catch { status(view, 'Clipboard copy failed. Select the token text to copy it manually.', 'danger'); }
    finally { copying = false; }
  }
  async function reclaim(index: number): Promise<void> {
    const view = deps.view(); const record = view?.readRecovery(index); if (!view || !record?.token || view.getState().mode !== 'recovery') return;
    await operation(view, async () => { try { sats(object(await deps.receive(record.token)).received); await deps.clearDeposit(); deps.refreshWallet(); if (current(view)) { view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'paid' }); status(view, 'Deposit token recovered to wallet.', 'success'); } } catch { status(view, 'Recovery unconfirmed. Keep this token until the mint verifies its state.', 'danger'); } });
  }
  return { browse, depositForm, connect, deposit, resetSession, saved, withdraw, retry, copy, reclaim };
}
function objectError(error: unknown): Record<string, unknown> { return error && typeof error === 'object' ? error as Record<string, unknown> : {}; }
