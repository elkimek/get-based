// Scoped device setup styles grouped by their authored elements.
const classes: Record<string, string> = {
  "custom-device-ai-row": [
    // .custom-device-ai-row
    "gb:device-setup:[display:flex] gb:device-setup:[gap:8px] gb:device-setup:[align-items:stretch]",
    "gb:device-setup:[margin-top:8px]",
  ].join(' '),
  "custom-device-form": [
    // .custom-device-form
    "gb:device-setup:[display:flex] gb:device-setup:[flex-direction:column] gb:device-setup:[gap:10px]",
    "gb:device-setup:[margin-top:4px]",
  ].join(' '),
  "ctx-label": [
    "gb:device-setup:text-secondary",
    // .custom-device-form .ctx-label
    "gb:device-setup:[.custom-device-form_&]:[display:block]",
  ].join(' '),
  "ctx-input": [
    // .custom-device-form .ctx-input
    "gb:device-setup:[.custom-device-form_&]:[width:100%] gb:device-setup:[.custom-device-form_&]:[margin-top:4px]",
    // .dev-distance-row .ctx-input
    "gb:device-setup:[.dev-distance-row_&]:[flex:1] gb:device-setup:[.dev-distance-row_&]:[min-width:0]",
  ].join(' '),
  "ctx-select": [
    // .custom-device-form .ctx-select
    "gb:device-setup:[.custom-device-form_&]:[width:100%] gb:device-setup:[.custom-device-form_&]:[margin-top:4px]",
  ].join(' '),
  "light-device-add-modal": [
    // .light-device-add-modal
    "gb:device-setup:[min-width:0] gb:device-setup:[overflow-x:hidden]",
    // .light-device-add-modal
    "gb:device-setup:[-webkit-overflow-scrolling:touch] gb:device-setup:[overscroll-behavior:contain] gb:device-setup:[touch-action:pan-y]",
  ].join(' '),
  "modal-body": [
    // .light-device-add-modal .modal-body
    "gb:device-setup:[.light-device-add-modal_&]:[min-width:0] gb:device-setup:[.light-device-add-modal_&]:[overflow-x:hidden]",
  ].join(' '),
  "light-device-preset-groups": [
    // .light-device-preset-groups
    "gb:device-setup:[display:flex] gb:device-setup:[flex-direction:column] gb:device-setup:[gap:12px]",
    "gb:device-setup:[margin-top:12px] gb:device-setup:[min-width:0] gb:device-setup:[max-width:100%]",
    "gb:device-setup:[overflow:visible]",
  ].join(' '),
  "light-device-preset-group": [
    // .light-device-preset-group
    "gb:device-setup:[display:flex] gb:device-setup:[flex-direction:column] gb:device-setup:[gap:6px]",
    "gb:device-setup:[min-width:0] gb:device-setup:[max-width:100%]",
  ].join(' '),
  "light-device-preset-heading": [
    // .light-device-preset-heading
    "gb:device-setup:[margin:0] gb:device-setup:[color:var(--text-secondary)] gb:device-setup:[font-family:var(--font-mono)]",
    "gb:device-setup:[font-size:11px] gb:device-setup:[font-weight:700] gb:device-setup:[letter-spacing:0.06em]",
    "gb:device-setup:[text-transform:uppercase]",
  ].join(' '),
  "light-device-preset-list": [
    // .light-device-preset-list
    "gb:device-setup:[display:flex] gb:device-setup:[flex-direction:column] gb:device-setup:[gap:6px]",
    "gb:device-setup:[min-width:0] gb:device-setup:[max-width:100%]",
  ].join(' '),
  "light-device-preset-row": [
    "gb:device-setup:[&.light-device-preset-row.active]:[border-color:var(--accent)] gb:device-setup:[&.light-device-preset-row.active]:[background:color-mix(in_srgb,_var(--accent)_10%,_var(--bg-card))] gb:device-setup:[&.light-device-preset-row.active]:[box-shadow:inset_3px_0_0_var(--accent)]",
    // .light-device-preset-row
    "gb:device-setup:[display:flex] gb:device-setup:[flex-direction:column] gb:device-setup:[gap:2px]",
    "gb:device-setup:[align-items:flex-start] gb:device-setup:[width:100%] gb:device-setup:[min-width:0]",
    "gb:device-setup:[max-width:100%] gb:device-setup:[overflow-x:hidden] gb:device-setup:[padding:10px_14px]",
    "gb:device-setup:[background:var(--bg-secondary)] gb:device-setup:[border:1px_solid_var(--border)] gb:device-setup:[border-radius:var(--radius-sm)]",
    "gb:device-setup:[color:var(--text-secondary)] gb:device-setup:[font-family:inherit] gb:device-setup:[cursor:pointer]",
    "gb:device-setup:[text-align:left] gb:device-setup:[transition:border-color_0.15s,_background_0.15s,_box-shadow_0.15s]",
    // .light-device-preset-row:hover
    "gb:device-setup:[&:hover]:[border-color:var(--accent)] gb:device-setup:[&:hover]:[background:var(--bg-card)]",
    // .light-device-preset-row:focus-visible
    "gb:device-setup:[&:focus-visible]:[border-color:var(--accent)] gb:device-setup:[&:focus-visible]:[background:var(--bg-card)]",
  ].join(' '),
  "light-device-preset-name": [
    // .light-device-preset-name
    "gb:device-setup:[color:var(--text-primary)] gb:device-setup:[font-size:14px] gb:device-setup:[font-weight:600]",
    "gb:device-setup:[max-width:100%] gb:device-setup:[overflow-wrap:anywhere]",
  ].join(' '),
  "light-device-preset-meta": [
    // .light-device-preset-meta
    "gb:device-setup:[color:var(--text-secondary)] gb:device-setup:[font-size:12px] gb:device-setup:[line-height:1.35]",
    "gb:device-setup:[max-width:100%] gb:device-setup:[overflow-wrap:anywhere] gb:device-setup:[word-break:break-word]",
  ].join(' '),
  "dev-distance-row": [
    // .dev-distance-row
    "gb:device-setup:[display:flex] gb:device-setup:[align-items:stretch] gb:device-setup:[gap:8px]",
    "gb:device-setup:[margin-top:4px]",
    // .dev-distance-row — (max-width: 600px)
    "gb:device-setup:device-mobile:[flex-direction:column] gb:device-setup:device-mobile:[align-items:stretch] gb:device-setup:device-mobile:[gap:6px]",
  ].join(' '),
  "dev-unit-toggle": [
    // .dev-unit-toggle
    "gb:device-setup:[display:inline-flex] gb:device-setup:[align-items:stretch] gb:device-setup:[border:1px_solid_var(--border)]",
    "gb:device-setup:[border-radius:var(--radius-sm)] gb:device-setup:[overflow:hidden] gb:device-setup:[background:var(--bg-secondary)]",
    // .dev-unit-toggle — (max-width: 600px)
    "gb:device-setup:device-mobile:[align-self:flex-start]",
  ].join(' '),
  "dev-unit-btn": [
    "gb:device-setup:[&.active]:[background:var(--accent)] gb:device-setup:[&.active]:text-on-accent",
    "gb:device-setup:[&:not(.active):hover]:[color:var(--text-primary)] gb:device-setup:[&:not(.active):hover]:[background:var(--bg-card)]",
    // .dev-unit-btn
    "gb:device-setup:[padding:0_12px] gb:device-setup:[font-size:12px] gb:device-setup:[font-weight:600]",
    "gb:device-setup:[background:transparent] gb:device-setup:[border:none] gb:device-setup:[color:var(--text-secondary)]",
    "gb:device-setup:[cursor:pointer] gb:device-setup:[font-family:inherit]",
    // .dev-unit-btn + .dev-unit-btn
    "gb:device-setup:[.dev-unit-btn_+_&]:[border-left:1px_solid_var(--border)]",
  ].join(' '),
};
const controls = new Set(['modal-close','import-btn','light-device-preset-row','ctx-input','ctx-select','dev-unit-btn']);
const control = [
  'gb:device-setup:focus-visible:[outline:2px_solid_var(--accent)]! gb:device-setup:focus-visible:[outline-offset:2px]',
  'gb:device-setup:device-coarse:[min-height:44px] gb:device-setup:device-coarse:[min-width:44px]',
].join(' ');
export function deviceSetupClasses(names: string): string {
  return names.split(/\s+/).map(name => {
    const owned = [name, classes[name] || ''];
    if (controls.has(name)) owned.push(control);
    if (name === 'modal-body-hint') owned.push('gb:device-setup:text-secondary');
    return owned.join(' ');
  }).join(' ');
}
