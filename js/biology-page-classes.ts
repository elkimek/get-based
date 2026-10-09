const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string,string> = {
  'biology-scores-note': styles(
    'gb:biology-page:[margin:0] gb:biology-page:[color:var(--text-muted)] gb:biology-page:[font-size:12px]',
    'gb:biology-page:[line-height:1.45]',
  ),
  'biology-planning-grid': styles(
    'gb:biology-page:[display:grid] gb:biology-page:[grid-template-columns:repeat(2,_minmax(0,_1fr))] gb:biology-page:[gap:16px]',
    'gb:biology-page:[margin:20px_0] gb:biology-page:[align-items:stretch] gb:biology-page:[@media(max-width:850px)]:[grid-template-columns:1fr]',
  ),
  'biology-section-count': styles(
    'gb:biology-page:[display:inline-flex] gb:biology-page:[align-items:center] gb:biology-page:[justify-content:center]',
    'gb:biology-page:[min-width:24px] gb:biology-page:[padding:2px_6px] gb:biology-page:[border-radius:6px]',
    'gb:biology-page:[background:var(--bg-secondary)] gb:biology-page:[border:1px_solid_var(--border)] gb:biology-page:[font-size:12px]',
    'gb:biology-page:[color:var(--text-secondary)] gb:biology-page:[font-weight:500]',
  ),
  'biology-score-group': styles(
    'gb:biology-page:[margin-top:24px] gb:biology-page:[min-width:0]',
  ),
  'biology-page-group-title': styles(
    'gb:biology-page:[margin:0] gb:biology-page:[font-size:18px] gb:biology-page:[color:var(--text-primary)]',
    'gb:biology-page:[font-weight:650]',
  ),
  'biology-page-group-summary': styles(
    'gb:biology-page:[list-style:none] gb:biology-page:[border:1px_solid_color-mix(in_srgb,_var(--border)_65%,_transparent)] gb:biology-page:[border-radius:var(--radius-sm)]',
    "gb:biology-page:[background:color-mix(in_srgb,_var(--bg-secondary)_35%,_transparent)] gb:biology-page:[&::-webkit-details-marker]:[display:none] gb:biology-page:before:[content:'+']",
    'gb:biology-page:before:[margin-right:8px] gb:biology-page:before:[color:var(--text-muted)] gb:biology-page:before:[font-family:var(--font-mono)]',
    "gb:biology-page:before:[font-weight:900] gb:biology-page:[details[open]>_&]:before:[content:'−'] gb:biology-page:[details[open]>_&]:before:[color:var(--accent)]",
    'gb:biology-page:[cursor:pointer] gb:biology-page:[padding:14px_0] gb:biology-page:focus-visible:[outline:2px_solid_var(--accent)]',
    'gb:biology-page:focus-visible:[outline-offset:2px]',
  ),
  'biology-page-group-copy': styles(
    'gb:biology-page:[margin:8px_0_16px] gb:biology-page:[font-size:13px] gb:biology-page:[line-height:1.6]',
    'gb:biology-page:[color:var(--text-secondary)] gb:biology-page:[max-width:85ch]',
  ),
  'biology-score-unavailable-group': styles(
    'gb:biology-page:[display:grid] gb:biology-page:[gap:12px] gb:biology-page:[&[open]]:[gap:16px]',
    'gb:biology-page:[border-top:1px_solid_var(--border)]',
  ),
};
export function biologyPageClasses(names: string): string {return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');}
