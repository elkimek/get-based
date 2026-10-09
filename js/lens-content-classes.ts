const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string, string> = {
  'genome-import-details': 'gb:lens-content:[display:grid] gb:lens-content:[gap:10px]',
  'genetics-overview-grid': styles(
    'gb:lens-content:[display:grid] gb:lens-content:[grid-template-columns:repeat(auto-fit,minmax(132px,1fr))]',
    'gb:lens-content:[gap:8px] gb:lens-content:[margin-bottom:10px] gb:lens-small:[grid-template-columns:repeat(2,minmax(0,1fr))]',
  ),
  'genetics-overview-card': styles(
    'gb:lens-content:[display:flex] gb:lens-content:[flex-direction:column] gb:lens-content:[gap:2px] gb:lens-content:[min-width:0]',
    'gb:lens-content:[padding:9px_10px] gb:lens-content:[background:var(--bg-hover)] gb:lens-content:[border:1px_solid_var(--border)] gb:lens-content:[border-radius:var(--radius-sm)]',
  ),
  'genetics-overview-label': styles(
    'gb:lens-content:[font-size:10px] gb:lens-content:[font-weight:700] gb:lens-content:[text-transform:uppercase]',
    'gb:lens-content:[letter-spacing:0.04em] gb:lens-content:[color:var(--text-muted)]',
  ),
  'lens-genome-value': styles(
    'gb:lens-content:[min-width:0] gb:lens-content:[overflow-wrap:anywhere] gb:lens-content:[color:var(--text-primary)]',
    'gb:lens-content:[font-size:15px] gb:lens-content:[line-height:1.2]',
  ),
  'lens-genome-sub': 'gb:lens-content:[color:var(--text-secondary)] gb:lens-content:[font-size:11px] gb:lens-content:[line-height:1.35]',
  'db-genome-import-note': styles(
    'gb:lens-content:[display:grid] gb:lens-content:[gap:3px] gb:lens-content:[padding:10px_12px]',
    'gb:lens-content:[border:1px_solid_var(--border)] gb:lens-content:[border-radius:var(--radius-sm)] gb:lens-content:[background:color-mix(in_srgb,var(--bg-secondary)_60%,transparent)]',
  ),
  'lens-maternal-title': 'gb:lens-content:[color:var(--text-primary)] gb:lens-content:[font-size:13px]',
  'lens-maternal-line': 'gb:lens-content:[color:var(--text-secondary)] gb:lens-content:[font-size:12px] gb:lens-content:[line-height:1.4]',
  'dashboard-widget-inline-controls': styles(
    'gb:lens-content:[display:flex] gb:lens-content:[align-items:center] gb:lens-content:[gap:12px]',
    'gb:lens-content:[flex-wrap:wrap] gb:lens-content:[margin-bottom:12px]',
  ),
  'dashboard-action-btn': styles(
    'gb:lens-content:[padding:8px_12px] gb:lens-content:[border-radius:var(--radius-sm)] gb:lens-content:[border-width:1px] gb:lens-content:[border-style:solid]',
    'gb:lens-content:[font-family:inherit] gb:lens-content:[font-style:inherit] gb:lens-content:[line-height:inherit] gb:lens-content:[font-size:12px] gb:lens-content:[font-weight:600] gb:lens-content:[cursor:pointer]',
    'gb:lens-content:[transition:background_0.15s,border-color_0.15s,transform_0.05s] gb:lens-content:hover:[background:var(--bg-hover)] gb:lens-content:hover:[border-color:var(--accent)]',
    'gb:lens-content:active:[transform:translateY(1px)] gb:lens-content:focus-visible:[outline:2px_solid_var(--accent)] gb:lens-content:focus-visible:[outline-offset:2px]',
  ),
  'lens-action-secondary': 'gb:lens-content:[background:var(--bg-secondary)] gb:lens-content:[border-color:var(--border)] gb:lens-content:[color:var(--text-primary)]',
  'dashboard-action-btn-primary': 'gb:lens-content:[background:var(--accent)] gb:lens-content:[border-color:transparent] gb:lens-content:[color:var(--on-accent)]',
  'lens-header-affiliate': styles(
    'gb:lens-content:[flex-basis:100%] gb:lens-content:[margin-top:2px] gb:lens-content:[font-size:12px]',
    'gb:lens-content:[color:var(--text-muted)] gb:lens-content:[line-height:1.4]',
  ),
  'lens-affiliate-link': styles(
    'gb:lens-content:[color:var(--text-secondary)] gb:lens-content:[text-decoration:underline] gb:lens-content:[text-underline-offset:2px]',
    'gb:lens-content:[font-weight:600] gb:lens-content:hover:[color:var(--accent)]',
  ),
  'db-correlation-empty': styles(
    'gb:lens-content:[width:100%] gb:lens-content:[min-height:130px] gb:lens-content:[padding:18px] gb:lens-content:[border-radius:var(--radius-sm)]',
    'gb:lens-content:[border:1px_dashed_var(--border)] gb:lens-content:[background:transparent] gb:lens-content:[color:var(--text-primary)]',
    'gb:lens-content:[display:flex] gb:lens-content:[flex-direction:column] gb:lens-content:[align-items:flex-start] gb:lens-content:[justify-content:center]',
    'gb:lens-content:[gap:6px] gb:lens-content:[text-align:left] gb:lens-content:[font-family:inherit] gb:lens-content:[font-style:inherit] gb:lens-content:[line-height:inherit] gb:lens-content:[cursor:pointer]',
    'gb:lens-content:focus-visible:[outline:2px_solid_var(--accent)] gb:lens-content:focus-visible:[outline-offset:2px]',
  ),
  'lens-source-empty-copy': 'gb:lens-content:[color:var(--text-secondary)] gb:lens-content:[font-size:13px] gb:lens-content:[line-height:1.45]',
  'dashboard-widget-picker-grid': 'gb:lens-content:[display:grid] gb:lens-content:[grid-template-columns:1fr] gb:lens-content:[gap:10px] gb:lens-content:[margin:14px_0]',
  'dashboard-widget-picker-card': styles(
    'gb:lens-content:[display:flex] gb:lens-content:[flex-direction:column] gb:lens-content:[align-items:flex-start] gb:lens-content:[gap:4px]',
    'gb:lens-content:[width:100%] gb:lens-content:[padding:14px] gb:lens-content:[border-radius:var(--radius)] gb:lens-content:[background:var(--bg-card)]',
    'gb:lens-content:[border:1px_solid_var(--border)] gb:lens-content:[color:var(--text-primary)] gb:lens-content:[font:inherit] gb:lens-content:[text-align:left] gb:lens-content:[cursor:pointer]',
    'gb:lens-content:[transition:background_0.15s,border-color_0.15s] gb:lens-content:lens-content-hover:[background:var(--bg-hover)] gb:lens-content:lens-content-hover:[border-color:var(--accent)]',
    'gb:lens-content:focus-visible:[outline:2px_solid_var(--accent)] gb:lens-content:focus-visible:[outline-offset:2px]',
  ),
  'dashboard-widget-picker-title': 'gb:lens-content:[font-size:14px] gb:lens-content:[font-weight:700]',
  'dashboard-widget-picker-sub': 'gb:lens-content:[font-size:12px] gb:lens-content:[color:var(--text-muted)] gb:lens-content:[line-height:1.4]',
  'dashboard-widget-picker-action': 'gb:lens-content:[margin-top:4px] gb:lens-content:[font-size:12px] gb:lens-content:[color:var(--accent)] gb:lens-content:[font-weight:700]',
};
export function lensContentClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
