// Only scoped, static Tailwind utilities belong here. Existing theme tokens
// remain the authority; data attributes and semantic classes preserve delegates.
const focus = 'gb:plan-ui:focus-visible:[outline:2px_solid_var(--accent)] gb:plan-ui:focus-visible:[outline-offset:2px] gb:plan-ui:device-coarse:[min-height:44px] gb:plan-ui:device-coarse:[min-width:44px]';
const classes: Record<string, string> = {
  'biology-score-action-summary': 'gb:plan-ui:[gap:10px] gb:plan-ui:[grid-template-columns:repeat(3,minmax(0,1fr))] gb:plan-ui:plan-small:[grid-template-columns:1fr]',
  'biology-score-coverage-planner': 'gb:plan-ui:[gap:12px]',
  'biology-planning-card': 'gb:plan-ui:[display:block] gb:plan-ui:[margin:0] gb:plan-ui:[padding:18px] gb:plan-ui:[border:1px_solid_var(--border)] gb:plan-ui:[border-radius:12px] gb:plan-ui:[background:var(--bg-card)] gb:plan-ui:[min-width:0] gb:plan-ui:[box-shadow:none] gb:plan-ui:[&:not([open])>:not(summary)]:[display:none]',
  'biology-planning-summary': `gb:plan-ui:[padding:0_0_14px] gb:plan-ui:[color:var(--text-primary)] gb:plan-ui:[font-size:16px] gb:plan-ui:[font-weight:600] gb:plan-ui:[cursor:pointer] gb:plan-ui:[.biology-planning-card:not([open])>&]:[padding-bottom:0] ${focus}`,
  'biology-next-checks': 'gb:plan-ui:[display:grid] gb:plan-ui:[min-width:0] gb:plan-ui:[gap:4px]',
  'biology-next-check': `gb:plan-ui:[display:grid] gb:plan-ui:[gap:5px] gb:plan-ui:[padding:12px_14px] gb:plan-ui:[border:1px_solid_var(--border)] gb:plan-ui:[border-radius:8px] gb:plan-ui:[background:var(--bg-secondary)] gb:plan-ui:[text-align:left] gb:plan-ui:[font-family:inherit] gb:plan-ui:[font-style:inherit] gb:plan-ui:[font-weight:inherit] gb:plan-ui:[font-size:inherit] gb:plan-ui:[line-height:inherit]`,
  'biology-next-check-button': `gb:plan-ui:[cursor:pointer] gb:plan-ui:hover:[border-color:var(--accent)] gb:plan-ui:hover:[background:var(--bg-hover)] ${focus}`,
  'biology-next-check-label': 'gb:plan-ui:[color:var(--text-primary)] gb:plan-ui:[font-size:14px]',
  'biology-next-check-text': 'gb:plan-ui:[color:var(--text-secondary)] gb:plan-ui:[font-size:13px] gb:plan-ui:[line-height:1.5]',
  'biology-score-coverage-head': 'gb:plan-ui:[display:grid] gb:plan-ui:[grid-template-columns:minmax(0,1fr)_auto] gb:plan-ui:[gap:12px] gb:plan-ui:[align-items:stretch] gb:plan-ui:plan-phone:[grid-template-columns:1fr]',
  'biology-score-coverage-main': 'gb:plan-ui:[min-width:0]',
  'biology-score-coverage-title-row': 'gb:plan-ui:[display:grid] gb:plan-ui:[grid-template-columns:1fr] gb:plan-ui:[gap:8px] gb:plan-ui:[align-items:start]',
  'biology-score-coverage-metric': 'gb:plan-ui:[display:flex] gb:plan-ui:[align-items:baseline] gb:plan-ui:[gap:8px] gb:plan-ui:[justify-items:start] gb:plan-ui:[color:var(--text-muted)] gb:plan-ui:[font-size:12px]',
  'biology-coverage-number': 'gb:plan-ui:[color:var(--text-primary)] gb:plan-ui:[font-family:var(--font-display)] gb:plan-ui:[font-size:26px] gb:plan-ui:[line-height:0.95]',
  'biology-coverage-intro': 'gb:plan-ui:[margin:0] gb:plan-ui:[color:var(--text-secondary)] gb:plan-ui:[font-size:13px] gb:plan-ui:[line-height:1.45]',
  'biology-score-coverage-actions': 'gb:plan-ui:[display:grid] gb:plan-ui:[gap:10px] gb:plan-ui:[justify-items:end] gb:plan-ui:[align-content:start] gb:plan-ui:plan-small:[justify-items:start]',
  'biology-plan-action': `gb:plan-ui:[padding:8px_12px] gb:plan-ui:[border-radius:var(--radius-sm)] gb:plan-ui:[border:1px_solid_transparent] gb:plan-ui:[background:var(--accent)] gb:plan-ui:[color:var(--on-accent)] gb:plan-ui:[font-family:inherit] gb:plan-ui:[font-style:inherit] gb:plan-ui:[line-height:inherit] gb:plan-ui:[font-size:12px] gb:plan-ui:[font-weight:600] gb:plan-ui:[cursor:pointer] gb:plan-ui:[white-space:nowrap] gb:plan-ui:[transition:background_0.15s,border-color_0.15s,transform_0.05s] gb:plan-ui:hover:[background:var(--bg-hover)] gb:plan-ui:hover:[border-color:var(--accent)] gb:plan-ui:active:[transform:translateY(1px)] gb:plan-ui:plan-default:[transition:border-color_0.15s,transform_0.05s] gb:plan-ui:plan-default:hover:[color:#fff] ${focus}`,
  'biology-coverage-progress-row': 'gb:plan-ui:[grid-column:1/-1] gb:plan-ui:[min-width:0]',
  'biology-coverage-progress': 'gb:plan-ui:[width:100%] gb:plan-ui:[height:8px] gb:plan-ui:[margin-top:2px] gb:plan-ui:[overflow:hidden] gb:plan-ui:[border-radius:999px] gb:plan-ui:[background:color-mix(in_srgb,var(--border)_55%,transparent)]',
  'biology-coverage-progress-fill': 'gb:plan-ui:[display:block] gb:plan-ui:[height:100%] gb:plan-ui:[border-radius:inherit] gb:plan-ui:[background:color-mix(in_srgb,var(--accent)_72%,var(--green,#22c55e))]',
  'biology-coverage-question': 'gb:plan-ui:[margin:8px_0] gb:plan-ui:[font-size:13px] gb:plan-ui:[line-height:1.5] gb:plan-ui:[color:var(--text-secondary)]',
  'biology-coverage-priority': 'gb:plan-ui:[margin-top:12px]',
  'biology-coverage-more': 'gb:plan-ui:[clear:both] gb:plan-ui:[margin:12px_0_0] gb:plan-ui:[font-size:14px] gb:plan-ui:[line-height:1.6]',
  'biology-coverage-more-summary': `gb:plan-ui:[cursor:pointer] gb:plan-ui:[padding:10px_0] gb:plan-ui:[color:var(--text-primary)] gb:plan-ui:[font-weight:500] ${focus}`,
  'biology-coverage-bundle-grid': 'gb:plan-ui:[display:grid] gb:plan-ui:[grid-template-columns:1fr] gb:plan-ui:[gap:10px]',
  'biology-coverage-bundle-card': 'gb:plan-ui:[display:grid] gb:plan-ui:[align-content:start] gb:plan-ui:[gap:8px] gb:plan-ui:[min-width:0] gb:plan-ui:[padding:12px] gb:plan-ui:[border:1px_solid_color-mix(in_srgb,var(--border)_70%,transparent)] gb:plan-ui:[border-radius:calc(var(--radius)-4px)] gb:plan-ui:[background:color-mix(in_srgb,var(--bg-card)_74%,transparent)] gb:plan-ui:first:[border-color:color-mix(in_srgb,var(--accent)_34%,var(--border))] gb:plan-ui:first:[background:color-mix(in_srgb,var(--accent)_7%,var(--bg-card))]',
  'biology-coverage-bundle-title': 'gb:plan-ui:[color:var(--text-primary)] gb:plan-ui:[font-size:14px]',
  'biology-coverage-marker-list': 'gb:plan-ui:[display:flex] gb:plan-ui:[flex-wrap:wrap] gb:plan-ui:[gap:6px]',
  'biology-planning-token': 'gb:plan-ui:[min-width:0] gb:plan-ui:[max-width:100%] gb:plan-ui:[display:inline-flex] gb:plan-ui:[align-items:baseline] gb:plan-ui:[padding:0] gb:plan-ui:[border:0] gb:plan-ui:[background:transparent] gb:plan-ui:[color:var(--text-muted)] gb:plan-ui:[font-family:inherit] gb:plan-ui:[font-style:inherit] gb:plan-ui:[font-weight:inherit] gb:plan-ui:[font-size:12px] gb:plan-ui:[line-height:1.35] gb:plan-ui:[overflow-wrap:anywhere] gb:plan-ui:[&+.biology-planning-token]:before:[content:"·"] gb:plan-ui:[&+.biology-planning-token]:before:[color:var(--text-muted)] gb:plan-ui:[&+.biology-planning-token]:before:[margin-right:10px]',
};
export function planningClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
