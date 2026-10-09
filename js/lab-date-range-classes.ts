const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string,string> = {
  'date-range-filter': styles(
    'gb:lab-range:[display:flex] gb:lab-range:[gap:4px] gb:lab-range:[background:var(--bg-secondary)]',
    'gb:lab-range:[padding:3px] gb:lab-range:[border-radius:var(--radius-sm)] gb:lab-range:[border:1px_solid_var(--border)]',
    'gb:lab-range:[width:fit-content]',
  ),
  'range-btn': styles(
    'gb:lab-range:[padding:6px_12px] gb:lab-range:[border-radius:6px] gb:lab-range:[border:0]',
    'gb:lab-range:[background:transparent] gb:lab-range:[color:var(--text-secondary)] gb:lab-range:[font-size:12px]',
    'gb:lab-range:[cursor:pointer] gb:lab-range:[font-weight:600] gb:lab-range:[transition:all_0.15s]',
    'gb:lab-range:[font-family:inherit] gb:lab-range:hover:[&:not(.active)]:[background:var(--bg-hover)] gb:lab-range:focus-visible:[outline:2px_solid_var(--accent)]',
    'gb:lab-range:focus-visible:[outline-offset:2px]',
  ),
  'lab-range-active': styles(
    'gb:lab-range:[background:var(--accent-gradient)] gb:lab-range:[color:white]',
  ),
  'dashboard-lab-date-range': styles(
    'gb:lab-range:[display:flex] gb:lab-range:[align-items:center] gb:lab-range:[justify-content:space-between]',
    'gb:lab-range:[flex-wrap:wrap] gb:lab-range:[gap:12px] gb:lab-range:[margin-bottom:20px]',
    'gb:lab-range:[padding:12px_16px] gb:lab-range:[border:1px_solid_var(--border)] gb:lab-range:[border-radius:var(--radius-sm)]',
    'gb:lab-range:[background:var(--bg-secondary)] gb:lab-range:[color:var(--text-primary)]',
  ),
  'lab-range-scope-title': styles(
    'gb:lab-range:[font-size:13px]',
  ),
  'lab-range-scope-copy': styles(
    'gb:lab-range:[margin:4px_0_0] gb:lab-range:[font-size:12px] gb:lab-range:[line-height:1.5]',
    'gb:lab-range:[color:var(--text-secondary)]',
  ),
  'lab-range-scoped': styles(
    'gb:lab-range:[flex-shrink:0]',
  ),
};
export function labDateRangeClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
