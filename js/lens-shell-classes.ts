// Shared lens chrome owns these utilities; body renderers keep their own styles.
const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string, string> = {
  'lens-widget-default-size': 'gb:lens-shell:[grid-column:span_12]',
  'dashboard-widgets': styles(
    "gb:lens-shell:[display:grid] gb:lens-shell:[grid-template-columns:repeat(12,_minmax(0,_1fr))] gb:lens-shell:[gap:18px]",
    "gb:lens-shell:[align-items:start] gb:lens-shell:[grid-auto-flow:dense]",
  ),
  'dashboard-widget': styles(
    "gb:lens-shell:[min-width:0] gb:lens-shell:[background:var(--bg-card)]",
    "gb:lens-shell:[border:1px_solid_var(--border)] gb:lens-shell:[border-radius:var(--radius)] gb:lens-shell:[padding:20px]",
    "gb:lens-shell:[box-shadow:var(--shadow)] gb:lens-shell:[transition:border-color_0.15s,_box-shadow_0.15s,_transform_0.15s] gb:lens-shell:hover:[border-color:color-mix(in_srgb,_var(--accent)_35%,_var(--border))]",
  ),
  'dashboard-widget-half': styles(
    "gb:lens-shell:[grid-column:span_6] gb:lens-shell:[@media(max-width:1100px)]:[grid-column:span_12]",
  ),
  'dashboard-widget-quarter': styles(
    "gb:lens-shell:[grid-column:span_3] gb:lens-shell:[@media(max-width:1100px)]:[grid-column:span_6] gb:lens-shell:[@media(max-width:640px)]:[grid-column:span_12]",
  ),
  'dashboard-widget-third': styles(
    "gb:lens-shell:[grid-column:span_4] gb:lens-shell:[@media(max-width:1100px)]:[grid-column:span_6] gb:lens-shell:[@media(max-width:640px)]:[grid-column:span_12]",
  ),
  'dashboard-widget-two-third': styles(
    "gb:lens-shell:[grid-column:span_8] gb:lens-shell:[@media(max-width:1100px)]:[grid-column:span_12]",
  ),
  'dashboard-widget-chrome': styles(
    "gb:lens-shell:[display:flex] gb:lens-shell:[align-items:center] gb:lens-shell:[gap:10px]",
    "gb:lens-shell:[margin-bottom:14px] gb:lens-shell:[min-width:0] gb:lens-shell:[@media(max-width:640px)]:[align-items:flex-start]",
  ),
  'dashboard-widget-heading': styles(
    "gb:lens-shell:[flex:1] gb:lens-shell:[min-width:0]",
  ),
  'dashboard-widget-title': styles(
    "gb:lens-shell:[font-family:var(--font-display)] gb:lens-shell:[font-size:14px] gb:lens-shell:[font-weight:700]",
    "gb:lens-shell:[text-transform:uppercase] gb:lens-shell:[color:var(--text-primary)] gb:lens-shell:[letter-spacing:0]",
  ),
  'dashboard-widget-description': styles(
    "gb:lens-shell:[margin-top:2px] gb:lens-shell:[font-family:var(--font-mono)] gb:lens-shell:[font-size:11px]",
    "gb:lens-shell:[color:var(--text-muted)] gb:lens-shell:[white-space:nowrap] gb:lens-shell:[overflow:hidden]",
    "gb:lens-shell:[text-overflow:ellipsis]",
  ),
  'dashboard-widget-tools': styles(
    "gb:lens-shell:[display:flex] gb:lens-shell:[align-items:center] gb:lens-shell:[gap:6px]",
    "gb:lens-shell:[flex-shrink:0] gb:lens-shell:[@media(max-width:640px)]:[width:100%] gb:lens-shell:[@media(max-width:640px)]:[justify-content:flex-start]",
    "gb:lens-shell:[@media(max-width:640px)]:[flex-wrap:wrap]",
  ),
  'dashboard-widget-tool': styles(
    "gb:lens-shell:[min-width:30px] gb:lens-shell:[height:30px] gb:lens-shell:[padding:0_9px]",
    "gb:lens-shell:[border-radius:var(--radius-sm)] gb:lens-shell:[border:1px_solid_var(--border)] gb:lens-shell:[background:var(--bg-secondary)]",
    "gb:lens-shell:[color:var(--text-primary)] gb:lens-shell:[font-size:12px] gb:lens-shell:[cursor:pointer]",
    "gb:lens-shell:hover:[&:not(:disabled)]:[border-color:var(--accent)] gb:lens-shell:hover:[&:not(:disabled)]:[background:var(--bg-hover)] gb:lens-shell:disabled:[opacity:0.45]",
    "gb:lens-shell:disabled:[cursor:default] gb:lens-shell:[font-family:inherit] gb:lens-shell:[font-weight:inherit]",
    "gb:lens-shell:[font-style:inherit] gb:lens-shell:focus-visible:[outline:2px_solid_var(--accent)] gb:lens-shell:focus-visible:[outline-offset:2px]",
  ),
  'dashboard-widget-body': styles(
    "gb:lens-shell:[min-width:0]",
  ),
  'dashboard-widget-inline-controls': styles(
    "gb:lens-shell:[display:flex] gb:lens-shell:[align-items:center] gb:lens-shell:[gap:12px]",
    "gb:lens-shell:[flex-wrap:wrap] gb:lens-shell:[margin-bottom:12px]",
  ),
  'lens-shell-inline-controls': styles(
    "gb:lens-shell:[margin-top:14px] gb:lens-shell:[column-gap:14px] gb:lens-shell:[row-gap:10px]",
  ),
  'dashboard-widget-empty': styles(
    "gb:lens-shell:[padding:12px_0] gb:lens-shell:[color:var(--text-muted)] gb:lens-shell:[font-size:13px]",
    "gb:lens-shell:[font-style:italic]",
  ),
  'biology-score-lens-row': styles(
    "gb:lens-shell:[grid-column:auto] gb:lens-shell:[min-width:0] gb:lens-shell:[--biology-panel-offset:0px]",
  ),
  'lens-shell-title': styles(
    "gb:lens-shell:[font-family:var(--font-display)] gb:lens-shell:[font-size:24px] gb:lens-shell:[@media(max-width:480px)]:[font-size:20px] gb:lens-shell:[font-weight:700]",
    "gb:lens-shell:[letter-spacing:-0.3px] gb:lens-shell:[display:flex] gb:lens-shell:[align-items:center]",
    "gb:lens-shell:[gap:10px]",
  ),
  'lens-shell-subtitle': styles(
    "gb:lens-shell:[color:var(--text-secondary)] gb:lens-shell:[font-size:14px] gb:lens-shell:[margin-top:4px]",
  ),
  'category-header': styles(
    "gb:lens-shell:[margin-bottom:24px]",
  ),
};
export function lensShellUtilities(name: string): string { return classes[name] || ''; }
export function lensShellClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${lensShellUtilities(name)}`).join(' ');
}

export function lensShellWidgetClasses(size: string, empty: boolean): string {
  const sized = ['half', 'quarter', 'third', 'two-third'].includes(size);
  return lensShellClasses(`dashboard-widget dashboard-widget-${size}${empty ? ' is-empty' : ''}${sized ? '' : ' lens-widget-default-size'}`);
}
