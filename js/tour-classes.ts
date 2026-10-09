const styles = (...rules: string[]): string => rules.join(' ');

/** Tour geometry is styled here; target coordinates remain controller-owned. */
const classes: Record<string, string> = {
  'tour-overlay': styles(
    'gb:tour-overlay:[position:fixed] gb:tour-overlay:[inset:0]',
    'gb:tour-overlay:[z-index:500] gb:tour-overlay:[pointer-events:auto]',
  ),
  'tour-spotlight': styles(
    'gb:tour-spotlight:[position:fixed] gb:tour-spotlight:[z-index:501] gb:tour-spotlight:[border-radius:8px]',
    'gb:tour-spotlight:[box-shadow:0_0_0_9999px_rgba(0,0,0,0.65)]',
    'gb:tour-spotlight:[transition:all_0.3s_ease] gb:tour-spotlight:[pointer-events:none]',
  ),
  'tour-tooltip': styles(
    'gb:tour-tooltip:[position:fixed] gb:tour-tooltip:[z-index:502] gb:tour-tooltip:[background:var(--bg-secondary)]',
    'gb:tour-tooltip:[border:1px_solid_var(--border)] gb:tour-tooltip:[border-radius:var(--radius)]',
    'gb:tour-tooltip:[padding:20px] gb:tour-tooltip:[max-width:340px] gb:tour-tooltip:[width:max-content]',
    'gb:tour-tooltip:[box-shadow:var(--shadow-lg)]',
    'gb:tour-phone:tour-tooltip:[max-width:calc(100vw_-_32px)]',
    'gb:tour-touch:tour-tooltip:[width:calc(100vw_-_32px)] gb:tour-touch:tour-tooltip:[padding:16px]',
  ),
  'tour-heading': styles(
    'gb:tour-heading:[margin:0_0_8px] gb:tour-heading:[font-family:var(--font-display)] gb:tour-heading:[font-size:16px]',
  ),
  'tour-copy': styles(
    'gb:tour-copy:[margin:0_0_16px] gb:tour-copy:[color:var(--text-secondary)]',
    'gb:tour-copy:[font-size:14px] gb:tour-copy:[line-height:1.5]',
  ),
  'tour-nav': styles(
    'gb:tour-ui:[display:flex] gb:tour-ui:[align-items:center] gb:tour-ui:[justify-content:space-between] gb:tour-ui:[gap:8px]',
    'gb:tour-touch:tour-ui:[align-items:stretch] gb:tour-touch:tour-ui:[flex-direction:column]',
  ),
  'tour-dots': styles(
    'gb:tour-ui:[display:flex] gb:tour-ui:[gap:6px] gb:tour-touch:tour-ui:[flex-wrap:wrap]',
  ),
  'tour-dot': styles(
    'gb:tour-ui:[width:8px] gb:tour-ui:[height:8px] gb:tour-ui:[border-radius:50%]',
    'gb:tour-ui:[background:var(--border)] gb:tour-ui:[transition:background_0.2s]',
    'gb:tour-ui:tour-active:[background:var(--accent)]',
  ),
  'tour-btns': styles(
    'gb:tour-ui:[display:flex] gb:tour-ui:[gap:8px] gb:tour-touch:tour-ui:[justify-content:flex-end]',
  ),
  'tour-btn': styles(
    'gb:tour-ui:[padding:6px_16px] gb:tour-ui:[border-radius:6px] gb:tour-ui:[font-size:13px]',
    'gb:tour-ui:[font-weight:500] gb:tour-ui:[cursor:pointer] gb:tour-ui:[font-family:inherit] gb:tour-ui:[transition:all_0.15s]',
    'gb:tour-ui:focus-visible:[outline:2px_solid_var(--accent)] gb:tour-ui:focus-visible:[outline-offset:2px]',
    'gb:tour-touch:tour-ui:[min-height:44px] gb:tour-touch:tour-ui:[padding:8px_14px]',
  ),
  'tour-btn-primary': styles(
    'gb:tour-ui:[background:var(--accent-gradient)] gb:tour-ui:[color:white] gb:tour-ui:[border:none]',
    'gb:tour-ui:tour-hover:[box-shadow:0_2px_12px_rgba(79,140,255,0.2)]',
  ),
  'tour-btn-secondary': styles(
    'gb:tour-ui:[background:transparent] gb:tour-ui:[color:var(--text-secondary)] gb:tour-ui:[border:1px_solid_var(--border)]',
    'gb:tour-ui:tour-hover:[background:var(--bg-hover)]',
  ),
};

export function tourClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
