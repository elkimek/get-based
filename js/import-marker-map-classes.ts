/** Marker mapping owns these utilities; import buttons and modal chrome retain their shared styles. */
const styles = (...rules: string[]): string => rules.join(' ');
const inheritedFont = styles(
  'gb:import-map-ui:[font-family:inherit] gb:import-map-ui:[font-style:inherit] gb:import-map-ui:[font-variant:inherit]',
  'gb:import-map-ui:[font-weight:inherit] gb:import-map-ui:[font-stretch:inherit] gb:import-map-ui:[line-height:inherit]',
);
const panel = styles(
  'gb:import-map-ui:[overflow:auto] gb:import-map-ui:[border:1px_solid_var(--border)]',
  'gb:import-map-ui:[border-radius:var(--radius-sm)] gb:import-map-ui:[background:var(--bg-primary)]',
);
const button = styles(
  inheritedFont, 'gb:import-map-ui:[width:100%] gb:import-map-ui:[border:0]',
  'gb:import-map-ui:[border-radius:var(--radius-sm)] gb:import-map-ui:[background:transparent]',
  'gb:import-map-ui:[cursor:pointer] gb:import-map-ui:[text-align:left]',
);
const classes: Record<string, string> = {
  'import-map-modal-overlay': 'gb:import-map-ui:[z-index:3300]',
  'import-marker-map-modal': styles(
    'gb:import-map-strong:[width:min(960px,94vw)] gb:import-map-strong:[max-width:960px] gb:import-map-strong:[padding:0]',
    'gb:import-map-strong:import-map-phone:[width:calc(100vw_-_12px)] gb:import-map-strong:import-map-phone:[max-width:none]',
  ),
  'import-map-modal-body': styles(
    'gb:import-map-ui:[display:grid] gb:import-map-ui:[gap:12px] gb:import-map-ui:[padding:16px]',
    'gb:import-map-ui:import-map-phone:[padding:12px]',
  ),
  'import-map-context': styles(
    'gb:import-map-ui:[display:grid] gb:import-map-ui:[gap:4px] gb:import-map-ui:[padding-bottom:10px]',
    'gb:import-map-ui:[border-bottom:1px_solid_var(--border)]',
  ),
  'import-map-context-label': 'gb:import-map-ui:[&:is(span)]:[color:var(--text-muted)]',
  'import-map-context-range': 'gb:import-map-ui:[&:is(small)]:[color:var(--text-muted)]',
  'import-map-context-value': 'gb:import-map-ui:[&:is(strong)]:[color:var(--text-primary)] gb:import-map-ui:[&:is(strong)]:[font-family:var(--font-mono)]',
  'import-map-search-wrap': 'gb:import-map-ui:[min-width:0]',
  'import-map-modal-search': styles(
    inheritedFont, 'gb:import-map-ui:[font-size:inherit] gb:import-map-ui:[width:100%]',
    'gb:import-map-ui:[min-height:38px] gb:import-map-ui:[padding:8px_10px] gb:import-map-ui:[border:1px_solid_var(--border)]',
    'gb:import-map-ui:[border-radius:var(--radius-sm)] gb:import-map-ui:[background:var(--bg-primary)] gb:import-map-ui:[color:var(--text-primary)]',
    'gb:import-map-ui:focus:[border-color:var(--accent)] gb:import-map-ui:focus:[outline:none]',
  ),
  'import-map-modal-grid': styles(
    'gb:import-map-ui:[display:grid] gb:import-map-ui:[grid-template-columns:minmax(160px,220px)_minmax(0,1fr)]',
    'gb:import-map-ui:[gap:12px] gb:import-map-ui:[min-height:420px]',
    'gb:import-map-ui:import-map-phone:[grid-template-columns:minmax(0,1fr)] gb:import-map-ui:import-map-phone:[min-height:0]',
  ),
  'import-map-categories': styles(
    panel, 'gb:import-map-ui:[display:flex] gb:import-map-ui:[flex-direction:column] gb:import-map-ui:[padding:6px]',
    'gb:import-map-ui:import-map-phone:[max-height:138px]',
  ),
  'import-map-category': styles(
    button, 'gb:import-map-ui:[display:flex] gb:import-map-ui:[justify-content:space-between] gb:import-map-ui:[gap:8px]',
    'gb:import-map-ui:[padding:9px_10px] gb:import-map-ui:[color:var(--text-secondary)] gb:import-map-ui:[font-size:12px]',
    'gb:import-map-ui:[&.active]:[background:var(--bg-hover)] gb:import-map-ui:[&.active]:[color:var(--text-primary)] gb:import-map-ui:[&.active]:[outline:none]',
    'gb:import-map-ui:import-map-hover:[background:var(--bg-hover)] gb:import-map-ui:import-map-hover:[color:var(--text-primary)] gb:import-map-ui:import-map-hover:[outline:none]',
    'gb:import-map-ui:focus:[background:var(--bg-hover)] gb:import-map-ui:focus:[color:var(--text-primary)] gb:import-map-ui:focus:[outline:none]',
  ),
  'import-map-results': styles(
    panel, 'gb:import-map-ui:[display:grid] gb:import-map-ui:[align-content:start] gb:import-map-ui:[padding:6px]',
    'gb:import-map-ui:import-map-phone:[max-height:46vh]',
  ),
  'import-map-result': styles(
    button, 'gb:import-map-ui:[font-size:inherit] gb:import-map-ui:[display:grid] gb:import-map-ui:[gap:6px]',
    'gb:import-map-ui:[padding:10px] gb:import-map-ui:[color:var(--text-primary)]',
    'gb:import-map-ui:import-map-hover:[background:color-mix(in_srgb,var(--accent)_14%,var(--bg-card))] gb:import-map-ui:import-map-hover:[outline:none]',
    'gb:import-map-ui:focus:[background:color-mix(in_srgb,var(--accent)_14%,var(--bg-card))] gb:import-map-ui:focus:[outline:none]',
    'gb:import-map-ui:[&.selected]:[background:color-mix(in_srgb,var(--accent)_14%,var(--bg-card))] gb:import-map-ui:[&.selected]:[outline:none]',
  ),
  'import-map-result-main': styles(
    'gb:import-map-ui:[display:flex] gb:import-map-ui:[align-items:baseline] gb:import-map-ui:[gap:8px] gb:import-map-ui:[flex-wrap:wrap]',
    'gb:import-map-ui:import-map-phone:[align-items:start]',
  ),
  'import-map-result-key': styles(
    'gb:import-map-ui:[&:is(code)]:[color:var(--text-muted)] gb:import-map-ui:[&:is(code)]:[font-family:var(--font-mono)]',
    'gb:import-map-ui:[&:is(code)]:[font-size:11px]',
  ),
  'import-map-result-meta': styles(
    'gb:import-map-ui:[display:flex] gb:import-map-ui:[flex-wrap:wrap] gb:import-map-ui:[gap:6px]',
    'gb:import-map-ui:[color:var(--text-muted)] gb:import-map-ui:[font-size:11px]',
  ),
  'import-map-result-badge': styles(
    'gb:import-map-ui:[&:is(span)]:[padding:2px_6px] gb:import-map-ui:[&:is(span)]:[border:1px_solid_var(--border)]',
    'gb:import-map-ui:[&:is(span)]:[border-radius:var(--radius-sm)]',
  ),
  'import-map-empty': 'gb:import-map-ui:[padding:18px] gb:import-map-ui:[color:var(--text-muted)]',
  'import-map-modal-actions': styles(
    'gb:import-map-ui:[display:flex] gb:import-map-ui:[justify-content:flex-end] gb:import-map-ui:[gap:8px]',
    'gb:import-map-ui:[padding:12px_16px_16px] gb:import-map-ui:[border-top:1px_solid_var(--border)]',
    'gb:import-map-ui:import-map-phone:[padding:12px] gb:import-map-ui:import-map-phone:[flex-wrap:wrap]',
  ),
  'import-map-action-button': 'gb:import-map-strong:import-map-phone:[flex:1_1_140px]',
};

export function importMarkerMapClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
