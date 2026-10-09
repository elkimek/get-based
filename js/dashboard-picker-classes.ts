/** Picker utilities preserve the shared classes used by delegated filtering and Body Sources. */
const styles = (...rules: string[]): string => rules.join(' ');
const inheritedFont = styles(
  'gb:picker-ui:[font-family:inherit] gb:picker-ui:[font-style:inherit] gb:picker-ui:[font-variant:inherit]',
  'gb:picker-ui:[font-weight:inherit] gb:picker-ui:[font-stretch:inherit] gb:picker-ui:[line-height:inherit]',
);
const classes: Record<string, string> = {
  'dashboard-widget-picker': 'gb:picker-ui:[width:min(94vw,720px)] gb:picker-ui:[max-height:min(86vh,760px)]',
  'dashboard-biometric-picker': 'gb:picker-ui:[display:flex] gb:picker-ui:[flex-direction:column]',
  'dashboard-widget-picker-section': 'gb:picker-ui:[display:grid] gb:picker-ui:[gap:8px] gb:picker-ui:[margin:14px_0]',
  'dashboard-biometric-picker-section': styles(
    'gb:picker-compound:[min-height:0] gb:picker-compound:[flex:1_1_auto]',
    'gb:picker-compound:[display:flex] gb:picker-compound:[flex-direction:column]',
  ),
  'dashboard-widget-picker-label': styles(
    'gb:picker-ui:[font-family:var(--font-mono)] gb:picker-ui:[font-size:11px] gb:picker-ui:[font-weight:800]',
    'gb:picker-ui:[color:var(--text-muted)] gb:picker-ui:[text-transform:uppercase]',
  ),
  'dashboard-widget-picker-search': styles(
    inheritedFont, 'gb:picker-ui:[width:100%] gb:picker-ui:[padding:10px_12px]',
    'gb:picker-ui:[border:1px_solid_var(--border)] gb:picker-ui:[border-radius:var(--radius-sm)]',
    'gb:picker-ui:[background:var(--bg-card)] gb:picker-ui:[color:var(--text-primary)] gb:picker-ui:[font-size:13px]',
    'gb:picker-ui:focus:[outline:2px_solid_var(--accent)] gb:picker-ui:focus:[outline-offset:2px]',
  ),
  'dashboard-widget-picker-grid': styles(
    'gb:picker-ui:[display:grid] gb:picker-ui:[grid-template-columns:1fr] gb:picker-ui:[gap:10px] gb:picker-ui:[margin:14px_0]',
  ),
  'dashboard-widget-picker-source': 'gb:picker-ui:[display:grid] gb:picker-ui:[gap:6px]',
  'dashboard-picker-source-grid': 'gb:picker-compound:[margin:0_0_12px]',
  'dashboard-marker-widget-grid': 'gb:picker-ui:[max-height:340px] gb:picker-ui:[overflow:auto] gb:picker-ui:[padding-right:4px]',
  'dashboard-biometric-widget-grid': 'gb:picker-ui:[max-height:340px] gb:picker-ui:[overflow:auto] gb:picker-ui:[padding-right:4px]',
  'dashboard-biometric-picker-grid': styles(
    'gb:picker-compound:[min-height:0] gb:picker-compound:[flex:1_1_auto] gb:picker-compound:[max-height:none]',
    'gb:picker-compound:[overflow-y:auto] gb:picker-compound:[overscroll-behavior:contain]',
  ),
  'dashboard-biometric-picker-actions': 'gb:picker-compound:[flex:0_0_auto] gb:picker-compound:[margin-top:14px]',
  'dashboard-widget-picker-card': styles(
    inheritedFont, 'gb:picker-ui:[font-size:inherit]',
    'gb:picker-ui:[display:flex] gb:picker-ui:[flex-direction:column] gb:picker-ui:[align-items:flex-start] gb:picker-ui:[gap:4px]',
    'gb:picker-ui:[width:100%] gb:picker-ui:[padding:14px] gb:picker-ui:[border-radius:var(--radius)]',
    'gb:picker-ui:[background:var(--bg-card)] gb:picker-ui:[border:1px_solid_var(--border)] gb:picker-ui:[color:var(--text-primary)]',
    'gb:picker-ui:[text-align:left] gb:picker-ui:[cursor:pointer] gb:picker-ui:[transition:background_0.15s,border-color_0.15s]',
    'gb:picker-ui:[&[hidden]]:[display:none]',
    'gb:picker-ui:picker-hover:[background:var(--bg-hover)] gb:picker-ui:picker-hover:[border-color:var(--accent)]',
    'gb:picker-ui:focus-visible:[outline:2px_solid_var(--accent)] gb:picker-ui:focus-visible:[outline-offset:2px]',
  ),
  'dashboard-widget-picker-title': 'gb:picker-ui:[font-size:14px] gb:picker-ui:[font-weight:700]',
  'dashboard-widget-picker-sub': 'gb:picker-ui:[font-size:12px] gb:picker-ui:[color:var(--text-muted)] gb:picker-ui:[line-height:1.4]',
  'dashboard-widget-picker-action': 'gb:picker-ui:[margin-top:4px] gb:picker-ui:[font-size:12px] gb:picker-ui:[color:var(--accent)] gb:picker-ui:[font-weight:700]',
  'dashboard-widget-picker-empty': styles(
    'gb:picker-ui:[padding:14px] gb:picker-ui:[border:1px_dashed_var(--border)] gb:picker-ui:[border-radius:var(--radius)]',
    'gb:picker-ui:[color:var(--text-muted)] gb:picker-ui:[font-size:13px]',
  ),
};

export function dashboardPickerClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
