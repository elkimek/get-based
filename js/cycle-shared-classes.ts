/** Shared Cycle controls and history facts have one scoped presentation owner. */
const classes: Record<string, string> = {
  'cycle-icon-btn': [
    'gb:cycle-shared-ui:cycle-shared-wide:[min-width:36px]',
    'gb:cycle-shared-ui:cycle-shared-wide:[min-height:36px]',
    'gb:cycle-shared-ui:[display:inline-flex]',
    'gb:cycle-shared-ui:[align-items:center]',
    'gb:cycle-shared-ui:[justify-content:center]',
    'gb:cycle-shared-ui:[gap:7px]',
    'gb:cycle-shared-ui:[border-width:1px]',
    'gb:cycle-shared-ui:[border-style:solid]',
    'gb:cycle-shared-ui:[&:not(:where(:hover))]:[border-color:var(--border)]',
    'gb:cycle-shared-ui:[border-radius:var(--radius-sm)]',
    'gb:cycle-shared-ui:[&:not(:where(:hover))]:[background:var(--bg-secondary)]',
    'gb:cycle-shared-ui:[&:not(:where(:hover))]:[color:var(--text-secondary)]',
    'gb:cycle-shared-ui:[cursor:pointer]',
    'gb:cycle-shared-ui:[font-family:inherit]',
    'gb:cycle-shared-ui:[font-style:inherit]',
    'gb:cycle-shared-ui:[font-variant:inherit]',
    'gb:cycle-shared-ui:[font-stretch:inherit]',
    'gb:cycle-shared-ui:[font-size:12px]',
    'gb:cycle-shared-ui:[font-weight:700]',
    'gb:cycle-shared-ui:[line-height:1]',
    'gb:cycle-shared-ui:[transition:background_0.15s,_border-color_0.15s,_color_0.15s,_transform_0.05s]',
    'gb:cycle-shared-ui:[&:hover]:[background:var(--bg-hover)]',
    'gb:cycle-shared-ui:[&:hover:not(:where(.cycle-delete-btn))]:[border-color:color-mix(in_srgb,_var(--accent)_45%,_var(--border))]',
    'gb:cycle-shared-ui:[&:hover:not(:where(.cycle-delete-btn))]:[color:var(--text-primary)]',
    'gb:cycle-shared-ui:[&:active]:[transform:translateY(1px)]',
    'gb:cycle-shared-ui:[&:focus-visible]:[outline:2px_solid_var(--accent)]',
    'gb:cycle-shared-ui:[&:focus-visible]:[outline-offset:2px]',
    'gb:cycle-shared-ui:cycle-shared-phone:[min-width:40px]',
    'gb:cycle-shared-ui:cycle-shared-phone:[min-height:40px]',
  ].join(' '),
  'period-symptom-tag': [
    'gb:cycle-shared-ui:[max-width:100%]',
    'gb:cycle-shared-ui:[border:1px_solid_var(--border)]',
    'gb:cycle-shared-ui:[background:var(--bg-card)]',
    'gb:cycle-shared-ui:[color:var(--text-secondary)]',
    'gb:cycle-shared-ui:[display:inline-flex]',
    'gb:cycle-shared-ui:[align-items:center]',
    'gb:cycle-shared-ui:[min-width:0]',
    'gb:cycle-shared-ui:[min-height:22px]',
    'gb:cycle-shared-ui:[padding:2px_8px]',
    'gb:cycle-shared-ui:[border-radius:999px]',
    'gb:cycle-shared-ui:[font-size:11px]',
    'gb:cycle-shared-ui:[line-height:1.25]',
  ].join(' '),
  'cycle-period-note': [
    'gb:cycle-shared-ui:[min-width:0]',
    'gb:cycle-shared-ui:[color:var(--text-muted)]',
    'gb:cycle-shared-ui:[font-style:italic]',
    'gb:cycle-shared-ui:[overflow-wrap:anywhere]',
  ].join(' '),
  'cycle-editor-section': [
    'gb:cycle-shared-ui:[min-width:0]',
    'gb:cycle-shared-ui:cycle-shared-wide:[padding:16px]',
    'gb:cycle-shared-ui:[border:1px_solid_var(--border)]',
    'gb:cycle-shared-ui:[border-radius:var(--radius-sm)]',
    'gb:cycle-shared-ui:[background:color-mix(in_srgb,_var(--bg-card)_70%,_transparent)]',
    'gb:cycle-shared-ui:[.cycle-editor-section_+_&]:[margin-top:14px]',
    'gb:cycle-shared-ui:cycle-shared-phone:[padding:14px]',
  ].join(' '),
  'cycle-editor-section-title': [
    'gb:cycle-shared-ui:[margin-bottom:12px]',
    'gb:cycle-shared-ui:[color:var(--text-primary)]',
    'gb:cycle-shared-ui:[font-size:13px]',
    'gb:cycle-shared-ui:[font-weight:800]',
  ].join(' '),
  'cycle-delete-btn': [
    'gb:cycle-shared-ui:[&:hover]:[border-color:color-mix(in_srgb,_var(--red)_55%,_var(--border))]',
    'gb:cycle-shared-ui:[&:hover]:[color:var(--red)]',
    'gb:cycle-shared-ui:cycle-shared-phone:[min-width:40px]',
    'gb:cycle-shared-ui:cycle-shared-phone:[min-height:40px]',
  ].join(' '),
};

export function cycleSharedUtilities(name: string): string {
  return Object.hasOwn(classes, name) ? classes[name]! : '';
}

export function cycleSharedClasses(names: string): string {
  return names.split(/\s+/).filter(Boolean).flatMap(name => [name, cycleSharedUtilities(name)]).filter(Boolean).join(' ');
}
