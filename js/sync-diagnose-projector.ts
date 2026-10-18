import type { EvoluDiagnostics, EvoluDiagnosticRow } from './sync-diagnostics-snapshot.js';
import type { RelayHealthVerdict, RelayQuotaEstimate } from './sync-relay-health.js';

export interface SyncDiagnoseInput {
  diagnostics: EvoluDiagnostics;
  healthVerdict: RelayHealthVerdict | null | undefined;
  quota: RelayQuotaEstimate | null | undefined;
  isDebug: boolean;
  cutoverEnabled: boolean;
}
/** Preserve escapeHTML's input conversion, with escaping owned by Svelte. */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
/** Original template substitution, including its Symbol/ToPrimitive behavior. */
function literal(value: unknown): string { return `${value}`; }
function projectRows(rows: readonly EvoluDiagnosticRow[]) {
  if (!rows.length) return { empty: true, rows: [] };
  return { empty: false, rows: rows.map(r => {
    const profileId = text(r.profileId || '?');
    const payload = r.profileIdSource === 'payload';
    const format = r.format === 'gz' ? 'gz' : r.format === 'invalid' ? 'invalid' : 'plain';
    const deleted = !!r.isDeleted;
    return { profileId, payload, format, deleted, syncedAt: literal(r.syncedAtMs),
      sun: literal(r.sun), dev: literal(r.dev), bytes: literal(r.bytes) };
  }).filter(() => true) };
}
function projectHealth(healthVerdict: SyncDiagnoseInput['healthVerdict']) {
  const v = healthVerdict?.verdict || 'unknown';
  const isHealthy = v === 'healthy';
  const needsAttention = v === 'wedged';
  const tone = isHealthy ? 'success' : needsAttention ? 'danger' : 'neutral';
  const label = isHealthy ? 'Verified' : needsAttention ? 'Needs attention' : 'Waiting for verification';
  const detail = isHealthy
    ? `The relay confirmed a recent update from this device${healthVerdict?.at ? ` at ${new Date(healthVerdict.at).toISOString().slice(11, 19)} UTC` : ''}.`
    : needsAttention
      ? 'A recent update was not reflected by the relay. Try Sync now once; use recovery tools only if the warning remains.'
      : 'No failed update was detected. This becomes verified after this device sends a change.';
  return { label: text(label), tone, badge: isHealthy ? 'Connected' : needsAttention ? 'Check now' : 'Not yet tested', detail: text(detail) };
}
function projectStorage(q: SyncDiagnoseInput['quota']) {
  if (!q) return null;
  const mb = (q.bytes / (1024 * 1024)).toFixed(2);
  const capMb = (q.cap / (1024 * 1024)).toFixed(0);
  const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
  const note = q.level === 'red'
    ? 'Storage is almost full. Reduce it soon so new updates are not rejected.'
    : q.level === 'amber'
      ? 'Storage is filling up, but sync can continue. Reduce it when all devices are up to date.'
      : 'Plenty of relay storage is available.';
  const compact = q.level === 'red' || q.level === 'amber';
  const pct = literal(q.pct);
  const width = literal(Math.min(100, Math.max(0, q.pct)));
  return { mb, capMb, color, pct, width, note, compact };
}
function getSyncStatusSummary(d: EvoluDiagnostics, healthVerdict: RelayHealthVerdict | null | undefined, quota: RelayQuotaEstimate | null | undefined) {
  const verdict = healthVerdict?.verdict || 'unknown';
  if (!d.syncEnabled) {
    return { tone: 'neutral', eyebrow: 'Not active', title: 'Sync is off on this device', detail: 'Your data remains on this device. Turn sync on in Settings when you want to connect it to your other devices.' };
  }
  if (!d.ownerId || !d.mnemonicConfigured) {
    return { tone: 'warning', eyebrow: 'Setup incomplete', title: 'Finish setting up sync', detail: 'This device does not have a complete sync identity yet. Return to Cross-device sync settings to set up or join an identity.' };
  }
  if (verdict === 'wedged') {
    return { tone: 'danger', eyebrow: 'Action recommended', title: 'Sync needs attention', detail: 'This device saved an update locally, but the relay did not confirm that its state advanced. Try Sync now, then reopen this screen.' };
  }
  if (d.rowsReadFailed || d.rowParseFailureCount > 0) {
    return { tone: 'warning', eyebrow: 'Local check incomplete', title: 'Some sync records could not be checked', detail: 'Your data is still available, but the local sync database reported a reading problem. Copy the diagnostic report below if this persists.' };
  }
  if (quota?.level === 'red') {
    return { tone: 'danger', eyebrow: 'Storage nearly full', title: 'Sync works, but storage needs attention', detail: 'Choose Reduce storage soon so there is room for future changes.' };
  }
  if (quota?.level === 'amber') {
    return { tone: 'warning', eyebrow: 'Storage filling up', title: 'Sync is working', detail: 'Updates are reaching the relay. Storage is getting high, so plan a cleanup after every device is fully synced.' };
  }
  if (verdict === 'healthy') {
    return { tone: 'success', eyebrow: 'All checks passed', title: 'Sync looks healthy', detail: 'This device is configured, its recent update reached the relay, and relay storage has room available.' };
  }
  return { tone: 'neutral', eyebrow: 'Ready', title: 'No problem detected', detail: 'Sync is configured. Make a small change and press Sync now if you want this device to perform a fresh relay verification.' };
}
function projectSummary(d: EvoluDiagnostics, healthVerdict: SyncDiagnoseInput['healthVerdict'], quota: SyncDiagnoseInput['quota']) {
  const summary = getSyncStatusSummary(d, healthVerdict, quota);
  const relayLabel = healthVerdict?.verdict === 'healthy'
    ? 'Relay verified'
    : healthVerdict?.verdict === 'wedged' ? 'Relay needs attention' : 'Relay waiting';
  const storageLabel = quota ? `Storage ${quota.pct}%` : 'Storage unavailable';
  return { ...summary, icon: summary.tone === 'success' ? '✓' : summary.tone === 'danger' ? '!' : summary.tone === 'warning' ? '!' : 'i',
    syncLabel: d.syncEnabled ? 'Sync on' : 'Sync off', relayLabel, storageLabel };
}
function projectDevice(d: EvoluDiagnostics) {
  return d.ownerId && d.mnemonicConfigured ? 'Identity ready' : 'Setup incomplete';
}
function projectTelemetry(t: EvoluDiagnostics['deltaTelemetry'], isDebug: boolean) {
  if (!isDebug || !t || t.summary.count === 0) return null;
  const s = t.summary;
  const pct = (s.ratio * 100).toFixed(1);
  const healthy = s.ratio < 0.05;
  const ratioColor = healthy ? 'var(--green)' : 'var(--orange)';
  const recentRows = t.pushes.slice(-6).reverse().map(p => {
    const when = new Date(p.at).toISOString().slice(11, 19) + 'Z';
    const arrays = Object.entries(p.perArray || {})
      .filter(([, v]) => (v.ins + v.upd + v.tom) > 0)
      .map(([k, v]) => `${text(k)}(${v.ins}/${v.upd}/${v.tom})`).join(' ');
    return { when, blobBytes: literal(p.blobBytes), deltaBytes: literal(p.totalDeltaBytes), ops: literal(p.totalOps), arrays: arrays || '—' };
  });
  const pullArrays = Object.keys(t.pull.perArray || {}).sort();
  const pull = pullArrays.length === 0 ? null : {
    mergedAt: t.pull.mergedAt ? new Date(t.pull.mergedAt).toISOString().slice(11, 19) + 'Z' : '—',
    arrays: pullArrays.map(name => {
      const v = t.pull.perArray[name]!;
      return `${text(name)} live=${v.live} tomb=${v.tombstones}`;
    }).join(' · '),
  };
  return { count: literal(s.count), pct, ratioColor, blobBytes: literal(s.totalBlobBytes),
    deltaBytes: literal(s.totalDeltaBytes), ops: literal(s.totalOps), healthy, recentRows, pull };
}
function projectCutover(r: EvoluDiagnostics['cutoverReadiness'], isDebug: boolean, cutoverEnabled: boolean) {
  if (!isDebug || !r) return null;
  const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
  const okCount = Object.values(r.surfaces).filter(v => v.status === 'ok').length;
  const noDataCount = Object.values(r.surfaces).filter(v => v.status === 'no-data').length;
  const headerColor = r.ready ? 'var(--green)' : 'var(--orange)';
  const headerLabel = r.ready ? 'Ready ✓' : `${r.blockerCount} item${r.blockerCount === 1 ? '' : 's'} pending`;
  const blockerRows = blockers.map(([name, v]) => ({ name: text(name), shape: text(v.shape), local: literal(v.localCount), rows: literal(v.rowCount) }));
  const action = cutoverEnabled ? 'disable' : r.ready ? 'enable' : 'blocked';
  return { headerColor, headerLabel, action, enabled: cutoverEnabled,
    okCount: literal(okCount), surfaceCount: literal(r.surfaceCount), noDataCount: literal(noDataCount),
    pending: blockers.length > 0 ? ` · ${blockers.length} pending` : '', blockerRows };
}
/** All reads happen in original template evaluation order before rendering. */
export function projectSyncDiagnose({ diagnostics, healthVerdict, quota, isDebug, cutoverEnabled }: SyncDiagnoseInput) {
  const d = diagnostics;
  const rows = projectRows(d.rows);
  const rowParseFailureCount = Number.isSafeInteger(d.rowParseFailureCount) && d.rowParseFailureCount > 0 ? d.rowParseFailureCount : 0;
  const rowWarnings = [
    ...(rowParseFailureCount > 0 ? [`${rowParseFailureCount} row payload${rowParseFailureCount === 1 ? '' : 's'} could not be decoded.`] : []),
    ...(d.rowsReadFailed ? ['Row query failed.'] : []),
  ];
  const rowCount = Array.isArray(d.rows) ? d.rows.length : 0;
  const compactInStorageCard = quota?.level === 'amber' || quota?.level === 'red';
  const rotate = healthVerdict?.verdict === 'wedged';
  const technicalReason = healthVerdict?.verdict === 'wedged' && healthVerdict?.reason ? text(healthVerdict.reason) : null;
  const summary = projectSummary(d, healthVerdict, quota);
  const device = projectDevice(d);
  const health = projectHealth(healthVerdict);
  const storage = projectStorage(quota);
  const syncEnabled = d.syncEnabled ? 'Yes' : 'No';
  const mnemonic = d.mnemonicConfigured ? 'Configured' : 'Missing';
  const owner = text(d.ownerId || 'Not initialized');
  const activeProfile = text(d.activeProfileId || 'None');
  const relay = text(d.relay || 'Not configured');
  const sunSessions = literal(d.activeImported.sunSessions);
  const lightDevices = literal(d.activeImported.lightDevices);
  const telemetry = isDebug ? projectTelemetry(d.deltaTelemetry, isDebug) : null;
  const cutover = isDebug ? projectCutover(d.cutoverReadiness, isDebug, cutoverEnabled) : null;
  return { rows, hasWarnings: rowWarnings.length > 0, warning: rowWarnings.join(' '), rowCount: literal(rowCount),
    plural: rowCount === 1 ? '' : 's', compactInStorageCard, rotate, technicalReason, summary, device, health, storage,
    isDebug, syncEnabled, mnemonic, owner, activeProfile, relay, sunSessions, lightDevices, telemetry, cutover };
}
export type SyncDiagnoseView = ReturnType<typeof projectSyncDiagnose>;
