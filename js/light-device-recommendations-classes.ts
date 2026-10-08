// Scoped presentation for the public channel-device-options renderer.
const classes: Record<string, string> = {
  'rec-channel-deficit': [
    'gb:device-options:[margin:16px_0] gb:device-options:[padding:12px_14px]',
    'gb:device-options:[background:color-mix(in_srgb,_var(--bg-card)_94%,_transparent)]',
    'gb:device-options:[border:1px_solid_color-mix(in_srgb,_var(--border)_82%,_transparent)]',
    'gb:device-options:[border-radius:var(--radius)] gb:device-options:[box-shadow:var(--shadow)]',
  ].join(' '),
  'rec-channel-deficit-head': 'gb:device-options:[font-size:13px] gb:device-options:[font-weight:600] gb:device-options:[color:var(--text-primary)] gb:device-options:[margin-bottom:8px]',
  'rec-channel-deficit-list': 'gb:device-options:flex gb:device-options:flex-col gb:device-options:[gap:6px]',
  'rec-light-deficit-link': [
    'gb:device-options:block gb:device-options:[padding:8px_10px] gb:device-options:[font-size:12px]',
    'gb:device-options:[color:var(--text-primary)] gb:device-options:[background:var(--bg-elevated)]',
    'gb:device-options:[border:1px_solid_var(--border)] gb:device-options:[border-radius:var(--radius-xs)]',
    'gb:device-options:no-underline gb:device-options:[&:hover]:[border-color:var(--accent)]',
    'gb:device-options:whitespace-normal gb:device-options:[overflow-wrap:anywhere] gb:device-options:min-w-0',
    'gb:device-options:device-coarse:min-h-11 gb:device-options:device-coarse:min-w-11',
  ].join(' '),
  'rec-light-deficit-name': 'gb:device-options:[color:var(--text-primary)] gb:device-options:[margin-right:4px]',
  'rec-vendor': 'gb:device-options:inline-block gb:device-options:[margin-left:6px] gb:device-options:[color:var(--text-secondary)] gb:device-options:[font-size:11px]',
  'rec-channel-deficit-foot': 'gb:device-options:[margin-top:8px] gb:device-options:[font-size:11px] gb:device-options:[color:var(--text-secondary)]',
  'rec-channel-deficit-opt-out': [
    'gb:device-options:inline-block gb:device-options:[font:inherit] gb:device-options:[font-size-adjust:inherit]',
    'gb:device-options:[letter-spacing:inherit] gb:device-options:[text-align:inherit] gb:device-options:[padding:0]',
    'gb:device-options:[border:0] gb:device-options:[background:none] gb:device-options:underline',
    'gb:device-options:cursor-pointer gb:device-options:[color:var(--text-secondary)] gb:device-options:device-coarse:inline-flex',
    'gb:device-options:device-coarse:items-center gb:device-options:device-coarse:min-h-11 gb:device-options:device-coarse:min-w-11',
  ].join(' '),
};
const focus = 'gb:device-options:focus-visible:outline-2! gb:device-options:focus-visible:outline-offset-2 gb:device-options:focus-visible:[outline-color:var(--accent)]';
export function deviceRecommendationsClasses(names: string) {
  return names.split(/\s+/).filter(Boolean).flatMap(name => [name, classes[name] || '',
    name === 'rec-light-deficit-link' || name === 'rec-channel-deficit-opt-out' ? focus : '',
  ]).filter(Boolean).join(' ');
}
