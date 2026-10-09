// Public summary and compatibility-lens surfaces own their scoped presentation.
const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string, string> = {
  'biology-scores-widget': styles(
    "gb:biology-summary:[display:grid] gb:biology-summary:[gap:16px]",
  ),
  'biology-scores-hero': styles(
    "gb:biology-summary:[display:flex] gb:biology-summary:[align-items:flex-start] gb:biology-summary:[justify-content:space-between]",
    "gb:biology-summary:[gap:16px] gb:biology-summary:[padding:16px] gb:biology-summary:[border:1px_solid_color-mix(in_srgb,_var(--accent)_22%,_var(--border))]",
    "gb:biology-summary:[border-radius:var(--radius)] gb:biology-summary:[background:radial-gradient(circle_at_top_left,_color-mix(in_srgb,_var(--accent)_13%,_transparent),_transparent_38%),_color-mix(in_srgb,_var(--bg-secondary)_72%,_transparent)] gb:biology-summary:summary-phone:[flex-direction:column]",
    "gb:biology-summary:summary-phone:[align-items:stretch]",
  ),
  'biology-score-kicker': styles(
    "gb:biology-summary:[font-family:var(--font-mono)] gb:biology-summary:[font-size:10px] gb:biology-summary:[font-weight:800]",
    "gb:biology-summary:[letter-spacing:0.08em] gb:biology-summary:[text-transform:uppercase] gb:biology-summary:[color:var(--accent)]",
  ),
  'biology-score-input-label': styles(
    "gb:biology-summary:[font-family:var(--font-mono)] gb:biology-summary:[font-size:10px] gb:biology-summary:[font-weight:800]",
    "gb:biology-summary:[letter-spacing:0.08em] gb:biology-summary:[text-transform:uppercase] gb:biology-summary:[color:var(--text-muted)]",
    "gb:biology-summary:[margin-right:2px]",
  ),
  'biology-summary-lead': styles(
    "gb:biology-summary:[margin:4px_0_0] gb:biology-summary:[color:var(--text-primary)] gb:biology-summary:[font-size:14px]",
    "gb:biology-summary:[line-height:1.45]",
  ),
  'biology-scores-count': styles(
    "gb:biology-summary:[flex:0_0_auto] gb:biology-summary:[padding:6px_10px] gb:biology-summary:[border-radius:999px]",
    "gb:biology-summary:[border:1px_solid_var(--border)] gb:biology-summary:[background:var(--bg-card)] gb:biology-summary:[color:var(--text-muted)]",
    "gb:biology-summary:[font-family:var(--font-mono)] gb:biology-summary:[font-size:11px] gb:biology-summary:[font-weight:800]",
  ),
  'biology-score-grid': styles(
    "gb:biology-summary:[display:grid] gb:biology-summary:[grid-template-columns:repeat(2,_minmax(0,_1fr))] gb:biology-summary:[gap:12px]",
    "gb:biology-summary:summary-tablet:[grid-template-columns:1fr]",
  ),
  'biology-score-card': styles(
    "gb:biology-summary:[min-width:0] gb:biology-summary:[display:grid] gb:biology-summary:[gap:10px]",
    "gb:biology-summary:[padding:14px] gb:biology-summary:[border-radius:var(--radius)] gb:biology-summary:[border:1px_solid_var(--border)]",
    "gb:biology-summary:[background:color-mix(in_srgb,_var(--bg-card)_78%,_transparent)] gb:biology-summary:[cursor:pointer] gb:biology-summary:[transition:background-color_0.12s_ease,_border-color_0.12s_ease,_box-shadow_0.12s_ease]",
    "gb:biology-summary:hover:[background:var(--bg-hover)] gb:biology-summary:hover:[border-color:var(--accent)] gb:biology-summary:hover:[box-shadow:0_0_0_2px_color-mix(in_srgb,_var(--accent)_22%,_transparent)]",
    "gb:biology-summary:hover:[outline:none] gb:biology-summary:focus-within:[background:var(--bg-hover)] gb:biology-summary:focus-within:[border-color:var(--accent)]",
    "gb:biology-summary:focus-within:[box-shadow:0_0_0_2px_color-mix(in_srgb,_var(--accent)_22%,_transparent)] gb:biology-summary:focus-within:[outline:none]",
  ),
  'biology-score-card-head': styles(
    "gb:biology-summary:[display:flex] gb:biology-summary:[align-items:flex-start] gb:biology-summary:[justify-content:space-between]",
    "gb:biology-summary:[gap:12px] gb:biology-summary:summary-phone:[flex-direction:column] gb:biology-summary:summary-phone:[align-items:stretch]",
  ),
  'biology-summary-title': styles(
    "gb:biology-summary:[margin:2px_0_0] gb:biology-summary:[font-family:var(--font-display)] gb:biology-summary:[font-size:15px]",
    "gb:biology-summary:[color:var(--text-primary)]",
  ),
  'biology-score-value': styles(
    "gb:biology-summary:[display:flex] gb:biology-summary:[align-items:baseline] gb:biology-summary:[gap:3px]",
    "gb:biology-summary:[font-family:var(--font-mono)] gb:biology-summary:[color:var(--text-muted)]",
  ),
  'biology-summary-number': styles(
    "gb:biology-summary:[color:var(--text-primary)] gb:biology-summary:[font-size:26px] gb:biology-summary:[line-height:1]",
    "gb:biology-summary:summary-phone:[font-size:32px]",
  ),
  'biology-summary-unit': styles(
    "gb:biology-summary:[font-size:11px]",
  ),
  'biology-score-summary': styles(
    "gb:biology-summary:[margin:0] gb:biology-summary:[min-height:38px] gb:biology-summary:[color:var(--text-muted)]",
    "gb:biology-summary:[font-size:12px] gb:biology-summary:[line-height:1.45] gb:biology-summary:[display:flex]",
    "gb:biology-summary:[align-items:center] gb:biology-summary:[gap:20px] gb:biology-summary:[padding:20px]",
    "gb:biology-summary:[cursor:pointer] gb:biology-summary:[list-style:none] gb:biology-summary:summary-narrow:[padding:16px_12px]",
    "gb:biology-summary:summary-narrow:[gap:12px] gb:biology-summary:summary-narrow:[align-items:flex-start]",
  ),
  'biology-score-rail': styles(
    "gb:biology-summary:[position:relative] gb:biology-summary:[height:7px] gb:biology-summary:[border-radius:999px]",
    "gb:biology-summary:[overflow:visible] gb:biology-summary:[border:1px_solid_color-mix(in_srgb,_var(--border)_80%,_transparent)] gb:biology-summary:[background:var(--bg-secondary)]",
  ),
  'biology-score-rail-fill': styles(
    "gb:biology-summary:[position:absolute] gb:biology-summary:[inset:0] gb:biology-summary:[border-radius:inherit]",
    "gb:biology-summary:[background:linear-gradient(90deg,_var(--red,_#ef4444),_var(--yellow,_#f59e0b)_50%,_var(--green,_#22c55e)_72%,_var(--green,_#22c55e))] gb:biology-summary:[opacity:0.82]",
  ),
  'biology-score-pin': styles(
    "gb:biology-summary:[position:absolute] gb:biology-summary:[top:50%] gb:biology-summary:[width:10px]",
    "gb:biology-summary:[height:16px] gb:biology-summary:[transform:translateY(-50%)] gb:biology-summary:[border-radius:999px]",
    "gb:biology-summary:[border:1px_solid_color-mix(in_srgb,_var(--bg-primary)_80%,_black)] gb:biology-summary:[background:var(--text-primary)] gb:biology-summary:[box-shadow:0_0_0_2px_color-mix(in_srgb,_var(--bg-card)_65%,_transparent)]",
  ),
  'biology-score-meta': styles(
    "gb:biology-summary:[display:grid] gb:biology-summary:[grid-template-columns:repeat(auto-fit,_minmax(118px,_max-content))] gb:biology-summary:[gap:8px_12px]",
    "gb:biology-summary:[align-items:start]",
  ),
  'biology-score-status': styles(
    "gb:biology-summary:[min-width:0] gb:biology-summary:[display:grid] gb:biology-summary:[gap:2px]",
    "gb:biology-summary:[padding-left:9px] gb:biology-summary:[border-left:2px_solid_var(--border)]",
  ),
  'biology-summary-status-label': styles(
    "gb:biology-summary:[font-family:var(--font-mono)] gb:biology-summary:[font-size:9px] gb:biology-summary:[font-weight:800]",
    "gb:biology-summary:[letter-spacing:0.08em] gb:biology-summary:[text-transform:uppercase] gb:biology-summary:[color:var(--text-muted)]",
  ),
  'biology-summary-status-value': styles(
    "gb:biology-summary:[font-size:12px] gb:biology-summary:[line-height:1.25] gb:biology-summary:[color:var(--text-primary)]",
  ),
  'biology-score-status-excellent': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--green,_#22c55e)]",
  ),
  'biology-score-status-high': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--green,_#22c55e)]",
  ),
  'biology-score-status-production': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--green,_#22c55e)]",
  ),
  'biology-score-status-good': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--accent)]",
  ),
  'biology-score-status-contextual': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--accent)]",
  ),
  'biology-score-status-strained': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--yellow,_#f59e0b)]",
  ),
  'biology-score-status-medium': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--yellow,_#f59e0b)]",
  ),
  'biology-score-status-experimental': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--yellow,_#f59e0b)]",
  ),
  'biology-score-status-poor': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--red,_#ef4444)]",
  ),
  'biology-score-status-concerning': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--red,_#ef4444)]",
  ),
  'biology-score-status-severe': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--red,_#ef4444)]",
  ),
  'biology-score-status-low': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--red,_#ef4444)]",
  ),
  'biology-score-status-mixed-dates': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--yellow,_#f59e0b)]",
  ),
  'biology-score-status-stale': styles(
    "gb:biology-summary:[&.biology-score-status]:[border-left-color:var(--yellow,_#f59e0b)]",
  ),
  'biology-score-inputs': styles(
    "gb:biology-summary:[display:grid] gb:biology-summary:[gap:7px]",
  ),
  'biology-summary-input-row': styles(
    "gb:biology-summary:[display:flex] gb:biology-summary:[align-items:baseline] gb:biology-summary:[flex-wrap:wrap]",
    "gb:biology-summary:[gap:6px_10px]",
  ),
  'biology-score-token': styles(
    "gb:biology-summary:[min-width:0] gb:biology-summary:[max-width:100%] gb:biology-summary:[display:inline-flex]",
    "gb:biology-summary:[align-items:baseline] gb:biology-summary:[padding:0] gb:biology-summary:[border:0]",
    "gb:biology-summary:[background:transparent] gb:biology-summary:[color:var(--text-primary)] gb:biology-summary:[font-family:inherit] gb:biology-summary:[font-weight:inherit] gb:biology-summary:[font-style:inherit]",
    "gb:biology-summary:[font-size:12px] gb:biology-summary:[line-height:1.35] gb:biology-summary:[overflow-wrap:anywhere]",
    "gb:biology-summary:[&+.biology-score-token]:before:[content:'·'] gb:biology-summary:[&+.biology-score-token]:before:[color:var(--text-muted)] gb:biology-summary:[&+.biology-score-token]:before:[margin-right:10px]",
  ),
  'biology-summary-marker': styles(
    "gb:biology-summary:[cursor:pointer] gb:biology-summary:[text-decoration:underline] gb:biology-summary:[text-decoration-color:color-mix(in_srgb,_var(--accent)_45%,_transparent)]",
    "gb:biology-summary:[text-underline-offset:3px] gb:biology-summary:hover:[color:var(--accent)] gb:biology-summary:hover:[outline:none]",
    "gb:biology-summary:focus-visible:[color:var(--accent)] gb:biology-summary:focus-visible:[outline:2px_solid_var(--accent)] gb:biology-summary:focus-visible:[outline-offset:2px]",
  ),
  'biology-score-token-muted': styles(
    "gb:biology-summary:[&.biology-score-token]:[color:var(--text-muted)]",
  ),
  'biology-scores-note': styles(
    "gb:biology-summary:[margin:0] gb:biology-summary:[color:var(--text-muted)] gb:biology-summary:[font-size:12px]",
    "gb:biology-summary:[line-height:1.45]",
  ),
  'biology-scores-lens': styles(
    "gb:biology-summary:[min-width:0] gb:biology-summary:[display:grid] gb:biology-summary:[gap:16px]",
  ),
  'biology-score-detail-stack': styles(
    "gb:biology-summary:[min-width:0] gb:biology-summary:[display:grid] gb:biology-summary:[gap:16px]",
  ),
  'biology-summary-jump': styles(
    "gb:biology-summary:[display:inline] gb:biology-summary:[padding:0] gb:biology-summary:[border:0]",
    "gb:biology-summary:[background:transparent] gb:biology-summary:[color:inherit] gb:biology-summary:[font:inherit]",
    "gb:biology-summary:[letter-spacing:inherit] gb:biology-summary:[text-align:inherit] gb:biology-summary:[cursor:pointer]",
  ),
  'biology-summary-control': styles(
    "gb:biology-summary:focus-visible:[outline:2px_solid_var(--accent)] gb:biology-summary:focus-visible:[outline-offset:2px]",
  ),
};
export function biologySummaryClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
