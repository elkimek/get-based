// Scoped screen/editor presentation. Domain state and event delegation stay outside components.
const classes: Record<string, string> = {
  "screen-trusted-today": "gb:environment-editor:relative gb:environment-editor:z-20 gb:environment-editor:inline-flex",
  "light-env-screen-card": [
    "gb:environment-editor:relative gb:environment-editor:[color:var(--text-primary)] gb:environment-editor:[background:var(--bg-card)] gb:environment-editor:[border:1px_solid_var(--screen-card-border,var(--border))]",
    "gb:environment-editor:[border-radius:var(--radius-sm)] gb:environment-editor:overflow-hidden gb:environment-editor:[transition:border-color_.15s]",
    "gb:environment-editor:motion-reduce:transition-none",
  ].join(' '),
  "expanded": "gb:environment-editor:[--screen-card-border:var(--accent)]",
  "light-env-screen-card-head": [
    "gb:environment-editor:relative gb:environment-editor:flex gb:environment-editor:items-center",
    "gb:environment-editor:[gap:10px] gb:environment-editor:[padding:10px_14px] gb:environment-editor:[background:var(--bg-secondary)]",
    "gb:environment-editor:[transition:background_.15s] gb:environment-editor:[&:hover]:[background:var(--bg-hover)] gb:environment-editor:environment-mobile:flex-wrap",
    "gb:environment-editor:environment-mobile:[gap:6px]",
  ].join(' '),
  "screen-head-expanded": "gb:environment-editor:[border-bottom:1px_solid_var(--border)]",
  "light-env-screen-disclosure": [
    "gb:environment-editor:absolute gb:environment-editor:inset-0 gb:environment-editor:[background:transparent]",
    "gb:environment-editor:[border:0] gb:environment-editor:[padding:0] gb:environment-editor:cursor-pointer",
    "gb:environment-editor:device-coarse:min-h-11 gb:environment-editor:focus-visible:outline-2! gb:environment-editor:focus-visible:[outline-offset:-2px]",
    "gb:environment-editor:focus-visible:[outline-color:var(--accent)]",
  ].join(' '),
  "light-env-sev-dot": [
    "gb:environment-editor:inline-block gb:environment-editor:[width:10px] gb:environment-editor:[height:10px]",
    "gb:environment-editor:[border-radius:50%] gb:environment-editor:shrink-0 gb:environment-editor:[box-shadow:0_0_6px_currentColor]",
    "gb:environment-editor:pointer-events-none",
  ].join(' '),
  "light-env-sev-incomplete": [
    "gb:environment-editor:[background:transparent] gb:environment-editor:[color:var(--text-muted)] gb:environment-editor:[border:1.5px_dashed_var(--text-muted)]",
    "gb:environment-editor:shadow-none",
  ].join(' '),
  "light-env-screen-card-icon": "gb:environment-editor:[font-size:16px] gb:environment-editor:pointer-events-none",
  "light-env-screen-card-name": [
    "gb:environment-editor:[font-size:14px] gb:environment-editor:[font-weight:600] gb:environment-editor:[color:var(--text-primary)]",
    "gb:environment-editor:min-w-0 gb:environment-editor:overflow-hidden gb:environment-editor:text-ellipsis",
    "gb:environment-editor:whitespace-nowrap gb:environment-editor:pointer-events-none",
  ].join(' '),
  "light-env-screen-card-summary": [
    "gb:environment-editor:[font-size:12px] gb:environment-editor:[color:var(--text-secondary)] gb:environment-editor:min-w-0",
    "gb:environment-editor:overflow-hidden gb:environment-editor:text-ellipsis gb:environment-editor:whitespace-nowrap",
    "gb:environment-editor:pointer-events-none",
  ].join(' '),
  "light-env-room-disclosure-spacer": "gb:environment-editor:flex-1 gb:environment-editor:pointer-events-none gb:environment-editor:environment-mobile:hidden",
  "light-env-room-disclosure-chevron": [
    "gb:environment-editor:[color:var(--text-secondary)] gb:environment-editor:[font-size:12px] gb:environment-editor:shrink-0",
    "gb:environment-editor:pointer-events-none",
    "gb:environment-editor:[transition:transform_.15s]",
  ].join(' '),
  "light-env-screen-card-body": [
    "gb:environment-editor:[padding:14px_16px] gb:environment-editor:flex gb:environment-editor:flex-col",
    "gb:environment-editor:[gap:14px]",
  ].join(' '),
  "light-env-screen-meta-row": [
    "gb:environment-editor:grid gb:environment-editor:[grid-template-columns:minmax(140px,1fr)_minmax(160px,1fr)] gb:environment-editor:[gap:12px]",
    "gb:environment-editor:environment-mobile:grid-cols-1",
  ].join(' '),
  "ctx-label": "gb:environment-editor:[margin:0] gb:environment-editor:[color:var(--text-secondary)]",
  "ctx-select": [
    "gb:environment-editor:[color:var(--text-primary)] gb:environment-editor:focus-visible:outline-2! gb:environment-editor:focus-visible:outline-offset-2",
    "gb:environment-editor:focus-visible:[outline-color:var(--accent)] gb:environment-editor:device-coarse:min-h-11",
  ].join(' '),
  "light-env-screen-room": "gb:environment-editor:w-full",
  "light-env-picker": "gb:environment-editor:flex gb:environment-editor:flex-col gb:environment-editor:[gap:6px]",
  "light-env-picker-label": [
    "gb:environment-editor:[font-size:11px] gb:environment-editor:[color:var(--text-secondary)] gb:environment-editor:uppercase",
    "gb:environment-editor:[letter-spacing:.4px] gb:environment-editor:[font-weight:600]",
  ].join(' '),
  "light-env-chip-row": "gb:environment-editor:flex gb:environment-editor:flex-wrap gb:environment-editor:[gap:6px]",
  "light-env-chip": [
    "gb:environment-editor:[background:var(--screen-chip-bg,var(--bg-secondary))] gb:environment-editor:[border:1px_solid_var(--screen-chip-border,var(--border))] gb:environment-editor:[border-radius:999px]",
    "gb:environment-editor:[padding:6px_12px] gb:environment-editor:[font-size:13px] gb:environment-editor:[color:var(--screen-chip-ink,var(--text-primary))]",
    "gb:environment-editor:cursor-pointer gb:environment-editor:[transition:all_.15s] gb:environment-editor:[&:hover]:[background:var(--screen-chip-hover,var(--bg-hover))]",
    "gb:environment-editor:[&:hover]:[border-color:var(--accent)] gb:environment-editor:focus-visible:outline-2! gb:environment-editor:focus-visible:outline-offset-2",
    "gb:environment-editor:focus-visible:[outline-color:var(--accent)] gb:environment-editor:device-coarse:min-h-11 gb:environment-editor:device-coarse:min-w-11",
    "gb:environment-editor:device-coarse:inline-flex gb:environment-editor:device-coarse:items-center gb:environment-editor:device-coarse:justify-center",
    "gb:environment-editor:device-coarse:[padding:0_14px]",
  ].join(' '),
  "light-env-chip-active": [
    "gb:environment-editor:[--screen-chip-bg:var(--accent)] gb:environment-editor:[--screen-chip-border:var(--accent)] gb:environment-editor:[--screen-chip-ink:var(--on-accent)]",
    "gb:environment-editor:[--screen-chip-hover:var(--accent)]",
  ].join(' '),
  "light-env-screen-blocker": [
    "gb:environment-editor:[font-size:13px] gb:environment-editor:[color:var(--text-secondary)] gb:environment-editor:flex",
    "gb:environment-editor:items-center gb:environment-editor:justify-between gb:environment-editor:[gap:12px]",
    "gb:environment-editor:[margin-top:8px] gb:environment-editor:[padding-top:6px] gb:environment-editor:[border-top:1px_solid_var(--border)]",
  ].join(' '),
  "screen-blocker-copy": [
    "gb:environment-editor:flex-1 gb:environment-editor:min-w-0 gb:environment-editor:[font-size:13px]",
    "gb:environment-editor:[color:var(--text-secondary)]",
  ].join(' '),
  "screen-blocker-help": [
    "gb:environment-editor:block gb:environment-editor:[font-size:11px] gb:environment-editor:[color:var(--text-secondary)]",
    "gb:environment-editor:[margin-top:2px]",
  ].join(' '),
  "screen-blue-switch": [
    "gb:environment-editor:relative gb:environment-editor:inline-block gb:environment-editor:[width:36px]",
    "gb:environment-editor:[height:20px] gb:environment-editor:shrink-0 gb:environment-editor:cursor-pointer",
    "gb:environment-editor:device-coarse:min-w-11 gb:environment-editor:device-coarse:min-h-11",
  ].join(' '),
  "screen-blue-input": [
    "gb:environment-editor:absolute gb:environment-editor:inset-0 gb:environment-editor:[width:100%]",
    "gb:environment-editor:[height:100%] gb:environment-editor:opacity-0 gb:environment-editor:[margin:0]",
    "gb:environment-editor:cursor-pointer gb:environment-editor:z-10 gb:environment-editor:[&:focus-visible+span]:outline-2!",
    "gb:environment-editor:[&:focus-visible+span]:outline-offset-2 gb:environment-editor:[&:focus-visible+span]:[outline-color:var(--accent)]",
  ].join(' '),
  "screen-blue-slider": [
    "gb:environment-editor:absolute gb:environment-editor:[width:36px] gb:environment-editor:[height:20px]",
    "gb:environment-editor:[left:50%] gb:environment-editor:[top:50%] gb:environment-editor:[transform:translate(-50%,-50%)]",
    "gb:environment-editor:[background:var(--screen-switch-bg,var(--border))] gb:environment-editor:[border-radius:20px] gb:environment-editor:pointer-events-none",
    "gb:environment-editor:before:content-[''] gb:environment-editor:before:absolute gb:environment-editor:before:[width:14px]",
    "gb:environment-editor:before:[height:14px] gb:environment-editor:before:[left:3px] gb:environment-editor:before:[bottom:3px]",
    "gb:environment-editor:before:[background:var(--screen-switch-ink,var(--text-secondary))] gb:environment-editor:before:rounded-full gb:environment-editor:[transition:background_.2s]",
    "gb:environment-editor:before:[transition:transform_.2s,background_.2s]",
  ].join(' '),
  "screen-blue-on": "gb:environment-editor:[--screen-switch-bg:var(--accent-fill)] gb:environment-editor:before:[transform:translateX(16px)] gb:environment-editor:[--screen-switch-ink:var(--on-accent)]",
  "light-env-overflow": [
    "gb:environment-editor:relative gb:environment-editor:z-20 gb:environment-editor:[width:32px]",
    "gb:environment-editor:[height:32px] gb:environment-editor:inline-flex gb:environment-editor:items-center",
    "gb:environment-editor:justify-center gb:environment-editor:[padding:0] gb:environment-editor:[border-radius:6px]",
    "gb:environment-editor:[background:transparent] gb:environment-editor:[border:1px_solid_transparent] gb:environment-editor:[color:var(--text-secondary)]",
    "gb:environment-editor:cursor-pointer gb:environment-editor:[font-size:16px] gb:environment-editor:[line-height:1]",
    "gb:environment-editor:[transition:all_.15s] gb:environment-editor:[&:hover]:[background:var(--alert-soft-bg)] gb:environment-editor:[&:hover]:[color:var(--danger-ink)]",
    "gb:environment-editor:[&:hover]:[border-color:var(--red)] gb:environment-editor:focus-visible:outline-2! gb:environment-editor:focus-visible:outline-offset-2",
    "gb:environment-editor:focus-visible:[outline-color:var(--accent)] gb:environment-editor:device-coarse:min-w-11 gb:environment-editor:device-coarse:min-h-11",
  ].join(' '),
  "light-env-today-toggle": [
    "gb:environment-editor:relative gb:environment-editor:z-20 gb:environment-editor:inline-flex",
    "gb:environment-editor:items-center gb:environment-editor:[padding:var(--screen-today-padding,3px_10px)] gb:environment-editor:[border-radius:12px]",
    "gb:environment-editor:[font-size:var(--screen-today-font,11px)] gb:environment-editor:[font-weight:500] gb:environment-editor:[font-family:inherit]",
    "gb:environment-editor:cursor-pointer gb:environment-editor:[border:1px_solid_var(--border)] gb:environment-editor:[background:var(--screen-today-bg,var(--bg-card))]",
    "gb:environment-editor:[color:var(--screen-today-ink,var(--text-secondary))] gb:environment-editor:whitespace-nowrap gb:environment-editor:[transition:all_.15s]",
    "gb:environment-editor:[&:hover]:[border-color:var(--accent)] gb:environment-editor:[&:hover]:[color:var(--text-primary)] gb:environment-editor:focus-visible:outline-2!",
    "gb:environment-editor:focus-visible:outline-offset-2 gb:environment-editor:focus-visible:[outline-color:var(--accent)] gb:environment-editor:device-coarse:min-w-11",
    "gb:environment-editor:device-coarse:min-h-11",
  ].join(' '),
  "light-env-today-on": "gb:environment-editor:[--screen-today-bg:color-mix(in_srgb,var(--green)_8%,transparent)] gb:environment-editor:[border-color:var(--green)] gb:environment-editor:[--screen-today-ink:var(--text-primary)]",
  "light-env-today-off": [
    "gb:environment-editor:[--screen-today-bg:var(--bg-secondary)] gb:environment-editor:[border-color:var(--text-muted)] gb:environment-editor:[--screen-today-ink:var(--text-secondary)]",
    "gb:environment-editor:italic",
  ].join(' '),
  "light-env-today-compact": [
    "gb:environment-editor:[width:26px] gb:environment-editor:[height:26px] gb:environment-editor:[--screen-today-padding:0]",
    "gb:environment-editor:justify-center gb:environment-editor:[--screen-today-font:13px] gb:environment-editor:[line-height:1]",
  ].join(' '),
  "light-env-sev-green": "gb:environment-editor:[background:var(--green)] gb:environment-editor:[color:var(--green)]",
  "light-env-card-sev-green": [
    "gb:environment-editor:before:content-[''] gb:environment-editor:before:absolute gb:environment-editor:before:[left:0]",
    "gb:environment-editor:before:[top:0] gb:environment-editor:before:[bottom:0] gb:environment-editor:before:[width:4px]",
    "gb:environment-editor:before:[background:var(--green)]",
  ].join(' '),
  "light-env-sev-yellow": "gb:environment-editor:[background:var(--yellow)] gb:environment-editor:[color:var(--yellow)]",
  "light-env-card-sev-yellow": [
    "gb:environment-editor:before:content-[''] gb:environment-editor:before:absolute gb:environment-editor:before:[left:0]",
    "gb:environment-editor:before:[top:0] gb:environment-editor:before:[bottom:0] gb:environment-editor:before:[width:4px]",
    "gb:environment-editor:before:[background:var(--yellow)]",
  ].join(' '),
  "light-env-sev-orange": "gb:environment-editor:[background:var(--orange)] gb:environment-editor:[color:var(--orange)]",
  "light-env-card-sev-orange": [
    "gb:environment-editor:before:content-[''] gb:environment-editor:before:absolute gb:environment-editor:before:[left:0]",
    "gb:environment-editor:before:[top:0] gb:environment-editor:before:[bottom:0] gb:environment-editor:before:[width:4px]",
    "gb:environment-editor:before:[background:var(--orange)]",
  ].join(' '),
  "light-env-sev-red": "gb:environment-editor:[background:var(--red)] gb:environment-editor:[color:var(--red)]",
  "light-env-card-sev-red": [
    "gb:environment-editor:before:content-[''] gb:environment-editor:before:absolute gb:environment-editor:before:[left:0]",
    "gb:environment-editor:before:[top:0] gb:environment-editor:before:[bottom:0] gb:environment-editor:before:[width:4px]",
    "gb:environment-editor:before:[background:var(--red)]",
  ].join(' '),
};
export function environmentScreenClasses(names: string) {
  return names.split(/\s+/).filter(Boolean).flatMap(name => [name, classes[name] || '']).filter(Boolean).join(' ');
}
