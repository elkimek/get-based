const pct = value => `${Number(value).toFixed(2)}%`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderCoverageMarkdown(report) {
  return [
    '# Production execution coverage', '',
    `Commit: ${report.commit}${report.workingTreeDirty ? ' (working tree modified)' : ''}`, '',
    `Functions: **${pct(report.globalFnPct)}**. Source bytes: **${pct(report.globalPct)}**.`,
    'Function execution is not branch coverage or complete user-workflow coverage.', '',
    '| Feature | Files | Called / functions | Function coverage | Byte coverage |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.features.map(row => `| ${row.name} | ${row.files} | ${row.fnCalled} / ${row.fnTotal} | ${pct(row.fnPct)} | ${pct(row.bytePct)} |`),
    '', `Unmapped executed collector ranges: ${report.rows.reduce((n, row) => n + row.unmappedCalledFunctions.length, 0)}. See JSON for details.`,
    'Full file results are retained in the production-coverage artifact (JSON and HTML).', '',
  ].join('\n');
}

export function renderCoverageHtml(report) {
  const rows = report.rows.map(row => `<tr><td>${escapeHtml(row.file)}</td><td>${row.fnCalled} / ${row.fnTotal}</td><td>${pct(row.fnPct)}</td><td>${pct(row.pct)}</td><td>${escapeHtml(row.uncalledFns.join(', '))}</td></tr>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Production coverage</title>
<style>body{font:16px system-ui;margin:2rem;color:#18212b}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #ccc;vertical-align:top}td:last-child{max-width:35rem;overflow-wrap:anywhere}pre{white-space:pre-wrap}th{position:sticky;top:0;background:#fff}</style>
<h1>Production execution coverage</h1><pre>${escapeHtml(renderCoverageMarkdown(report))}</pre>
<table><thead><tr><th>File</th><th>Called / functions</th><th>Functions</th><th>Source bytes</th><th>Uncalled functions</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}
