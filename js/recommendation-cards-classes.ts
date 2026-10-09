/** Only rec-next presentation is owned here; dashboard buttons and empty states keep shared owners. */
const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string, string> = {
  'rec-next-widget': 'gb:rec-ui:[display:grid] gb:rec-ui:[gap:10px]',
  'rec-next-list': 'gb:rec-ui:[display:grid] gb:rec-ui:[gap:10px]',
  'rec-next-card': styles(
    'gb:rec-ui:[border:1px_solid_var(--border)] gb:rec-ui:[border-radius:var(--radius-sm)]',
    'gb:rec-ui:[background:color-mix(in_srgb,var(--bg-secondary)_55%,transparent)]',
    'gb:rec-ui:[display:grid] gb:rec-ui:[gap:8px]',
    'gb:rec-ui:[&.is-saved]:[border-color:color-mix(in_srgb,var(--accent)_45%,var(--border))]',
  ),
  'rec-next-head': 'gb:rec-ui:[display:flex] gb:rec-ui:[align-items:baseline] gb:rec-ui:[gap:8px] gb:rec-ui:[flex-wrap:wrap]',
  'rec-next-title': 'gb:rec-ui:rec-title:[color:var(--text-primary)] gb:rec-ui:rec-title:[font-size:14px]',
  'rec-next-source': styles(
    'gb:rec-ui:[font-family:var(--font-mono)] gb:rec-ui:[font-size:10px] gb:rec-ui:[font-weight:800]',
    'gb:rec-ui:[color:var(--accent)] gb:rec-ui:[text-transform:uppercase]',
  ),
  'rec-next-reason': 'gb:rec-ui:[color:var(--text-secondary)] gb:rec-ui:[font-size:13px] gb:rec-ui:[line-height:1.45]',
  'rec-next-meta': 'gb:rec-ui:[color:var(--text-muted)] gb:rec-ui:[font-size:11px] gb:rec-ui:[font-family:var(--font-mono)]',
  'rec-next-primary': styles(
    'gb:rec-ui:[color:var(--green)] gb:rec-ui:[font-size:13px] gb:rec-ui:[padding:8px_10px]',
    'gb:rec-ui:[background:color-mix(in_srgb,var(--green)_8%,transparent)] gb:rec-ui:[border-radius:var(--radius-sm)]',
  ),
  'rec-next-primary-label': styles(
    'gb:rec-ui:[display:block] gb:rec-ui:[margin-bottom:2px] gb:rec-ui:[color:var(--text-muted)]',
    'gb:rec-ui:[font-family:var(--font-mono)] gb:rec-ui:[font-size:9px] gb:rec-ui:[font-weight:700]',
    'gb:rec-ui:[letter-spacing:0.04em] gb:rec-ui:[text-transform:uppercase]',
  ),
  'rec-next-actions': 'gb:rec-ui:[display:flex] gb:rec-ui:[align-items:center] gb:rec-ui:[gap:8px] gb:rec-ui:[flex-wrap:wrap]',
};

export function recommendationClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}

export function recommendationCardClasses(compact: boolean, saved: boolean): string {
  // Emit one padding utility so source order cannot invert the original compact override.
  return `${recommendationClasses('rec-next-card')}${compact ? ' rec-next-card-compact gb:rec-ui:[padding:10px]' : ' gb:rec-ui:[padding:12px]'}${saved ? ' is-saved' : ''}`;
}
