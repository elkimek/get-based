// @ts-check
// Visible stages and elapsed time; the provider does not expose a percentage.
const activeProgress = new WeakMap();
const stages = {
  preparing: ['Preparing selected records', 'Collecting the data selected for this report.'],
  approval: ['Waiting for AI approval', 'Return to Create a report to review any required AI disclosure and data-sharing approval.'],
  generating: ['AI is generating your overview', 'Your selected AI connection is generating the opening overview for this report.'],
  rendering: ['Formatting report preview', 'Arranging the selected results and summaries.'],
};
const progressStyles = `.report-generation-progress{width:100%;flex:0 0 100%;padding:4px 0;color:var(--text-primary,#172c29);font:14px/1.5 system-ui,sans-serif}.report-progress-head{display:flex;justify-content:space-between;gap:16px}.report-progress-time{color:var(--text-muted,#576963);white-space:nowrap}.report-progress-bar{height:5px;border-radius:8px;background:var(--border,#e3eae7);overflow:hidden;margin:9px 0}.report-progress-bar span{display:block;width:35%;height:100%;border-radius:8px;background:var(--accent,#227a66);animation:report-progress-slide 1.4s ease-in-out infinite alternate}.report-progress-help{color:var(--text-muted,#576963);margin:0;font-size:12px}@keyframes report-progress-slide{from{transform:translateX(0)}to{transform:translateX(185%)}}@media(prefers-reduced-motion:reduce){.report-progress-bar span{animation:none}}`;

function createProgress(doc, parent) {
  const style = doc.createElement('style');
  style.textContent = progressStyles;
  const root = doc.createElement('div');
  root.className = 'report-generation-progress';
  root.setAttribute('role', 'status');
  const head = doc.createElement('div');
  head.className = 'report-progress-head';
  const label = doc.createElement('strong');
  const elapsed = doc.createElement('span');
  elapsed.className = 'report-progress-time';
  elapsed.setAttribute('aria-live', 'off');
  head.append(label, elapsed);
  const bar = doc.createElement('div');
  bar.className = 'report-progress-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Report generation in progress');
  bar.append(doc.createElement('span'));
  const help = doc.createElement('p');
  help.className = 'report-progress-help';
  root.append(style, head, bar, help);
  parent.prepend(root);
  return { root, label, elapsed, help };
}

/** @param {any} overlay @param {Window | null} [preview] */
export function startReportProgress(overlay, preview = null) {
  cancelReportProgress(overlay);
  const displays = [createProgress(overlay.ownerDocument, overlay.querySelector('.report-builder-actions'))];
  if (preview) {
    const doc = preview.document;
    doc.title = 'Preparing your report';
    doc.body.style.cssText = 'margin:10vh auto;padding:24px;max-width:560px;background:#f8faf9';
    const heading = doc.createElement('h1');
    heading.textContent = 'Preparing your report';
    heading.style.cssText = 'font:600 26px system-ui,sans-serif;color:#172c29';
    const hint = doc.createElement('p');
    hint.textContent = 'Your preview will appear here automatically. You can return to Create a report while it prepares.';
    hint.style.cssText = 'font:14px/1.6 system-ui,sans-serif;color:#576963';
    doc.body.append(heading, hint);
    const area = doc.createElement('div');
    doc.body.append(area);
    displays.push(createProgress(doc, area));
  }
  const started = Date.now();
  let stage = 'preparing';
  let stopped = false;
  const render = () => {
    if (stopped) return;
    const seconds = Math.floor((Date.now() - started) / 1000);
    for (const display of displays) {
      display.label.textContent = stages[stage][0];
      display.elapsed.textContent = `${seconds}s elapsed`;
      display.help.textContent = stages[stage][1] + (stage === 'generating' && seconds >= 15 ? ' This is taking a little longer; you can keep this tab open.' : '');
    }
  };
  const timer = setInterval(render, 1000);
  const progress = {
    stage(value) { if (stages[value]) { stage = value; render(); } },
    stop() { stopped = true; clearInterval(timer); displays.forEach(display => display.root.remove()); activeProgress.delete(overlay); },
    cancel() { progress.stop(); if (preview && !preview.closed) preview.close(); },
  };
  activeProgress.set(overlay, progress);
  render();
  return progress;
}

export function cancelReportProgress(overlay) {
  activeProgress.get(overlay)?.cancel();
}
