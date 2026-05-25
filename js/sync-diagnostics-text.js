// sync-diagnostics-text.js - plain-text Diagnose snapshot formatting.

// Render the diagnostics object as plain text - meant for the Copy button
// in showSyncDiagnose, so a user can paste the device's state into chat /
// support without retyping. Mirrors the modal's structure exactly.
export function _evoluDiagnosticsText(d) {
  const lines = [
    `Sync diagnose @ ${new Date().toISOString()}`,
    `Sync enabled: ${d.syncEnabled ? 'yes' : 'no'}`,
    `Relay: ${d.relay || '-'}`,
    `Owner ID: ${d.ownerId || '- (not initialized)'}`,
    `Mnemonic prefix: ${d.mnemonicPrefix || '-'}`,
    `Active profile: ${d.activeProfileId || '?'}`,
    `In-memory state: sunSessions=${d.activeImported.sunSessions} lightDevices=${d.activeImported.lightDevices}`,
    `Rows in this device's local Evolu DB:`,
  ];
  if (!d.rows.length) {
    lines.push('  (none)');
  } else {
    lines.push('  profileId         del  syncedAtMs       sun  dev  size       fmt   src');
    for (const r of d.rows) {
      const pid = String(r.profileId || '?').padEnd(17);
      const del = r.isDeleted ? 'yes' : 'no ';
      const ts = String(r.syncedAtMs).padEnd(16);
      const sun = String(r.sun).padStart(3);
      const dev = String(r.dev).padStart(3);
      const size = String(r.bytes + 'b').padStart(9);
      const fmt = String(r.format || '?').padEnd(5);
      const src = String(r.profileIdSource || '?');
      lines.push(`  ${pid} ${del}  ${ts} ${sun}  ${dev}  ${size}  ${fmt} ${src}`);
    }
  }
  if (d.rowsError) lines.push(`Rows read error: ${d.rowsError}`);
  const t = d.deltaTelemetry;
  if (t) {
    const s = t.summary;
    const pct = (s.ratio * 100).toFixed(1);
    lines.push('');
    lines.push(`Phase 1 dual-write health (last ${s.count} pushes):`);
    lines.push(`  blob total: ${s.totalBlobBytes}b · delta total: ${s.totalDeltaBytes}b · ops: ${s.totalOps}`);
    lines.push(`  ratio (delta:blob): ${pct}%  ${s.ratio < 0.05 ? '(healthy — Phase 2 cutover safe)' : '(still high — keep baking)'}`);
    if (t.pushes.length > 0) {
      lines.push('  recent pushes:');
      lines.push('    when                blob       delta      ops  arrays');
      for (const p of t.pushes.slice(-6).reverse()) {
        const when = new Date(p.at).toISOString().slice(11, 19) + 'Z';
        const blob = String((p.blobBytes || 0) + 'b').padStart(9);
        const delta = String((p.totalDeltaBytes || 0) + 'b').padStart(9);
        const ops = String(p.totalOps || 0).padStart(3);
        const arrs = Object.entries(p.perArray || {})
          .filter(([, v]) => (v.ins + v.upd + v.tom) > 0)
          .map(([k, v]) => `${k}(${v.ins}/${v.upd}/${v.tom})`).join(' ');
        lines.push(`    ${when}        ${blob}  ${delta}  ${ops}  ${arrs || '-'}`);
      }
      lines.push('    (arrays column: name(insert/update/tombstone))');
    }
    const pullArrays = Object.keys(t.pull.perArray || {});
    if (pullArrays.length > 0) {
      lines.push(`  pull-side rows (latest merge ${t.pull.mergedAt ? new Date(t.pull.mergedAt).toISOString() : '-'}):`);
      for (const name of pullArrays.sort()) {
        const v = t.pull.perArray[name];
        lines.push(`    ${name.padEnd(20)} live=${v.live} tombstones=${v.tombstones}`);
      }
      lines.push('    (compare across devices - diverging counts = relay replication lag)');
    }
  }
  const r = d.cutoverReadiness;
  if (r) {
    lines.push('');
    lines.push(`Phase 2 cutover readiness: ${r.ready ? 'READY ✓' : `BLOCKED — ${r.blockerCount} surface(s) missing rows`}`);
    lines.push(`  ${r.surfaceCount} surfaces total`);
    const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
    if (blockers.length > 0) {
      lines.push(`  ⚠ BLOCKERS — surfaces with local data but no per-row push:`);
      for (const [name, v] of blockers) {
        lines.push(`    ${name.padEnd(20)} shape=${v.shape} local=${v.localCount} rows=${v.rowCount}`);
      }
    }
    const ok = Object.entries(r.surfaces).filter(([, v]) => v.status === 'ok');
    if (ok.length > 0) {
      lines.push(`  ✓ ok (${ok.length}): ${ok.map(([n]) => n).join(', ')}`);
    }
  }
  return lines.join('\n');
}
