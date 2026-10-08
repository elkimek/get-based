// Scoped device-library/picker styles, grouped by their authored elements.
const classes: Record<string, string> = {
  "light-devices-section": [
    // .light-page .dashboard-widget[data-widget-id="light-devices"] .light-devices-section
    "gb:device-library:[.light-page_.dashboard-widget[data-widget-id='light-devices']_&]:[margin-top:0]",
    // .light-devices-section
    "gb:device-library:[margin-top:24px]",
  ].join(' '),
  "light-section-title": [
    // .light-page .dashboard-widget[data-widget-id="light-devices"] .light-section-title
    "gb:device-library:[.light-page_.dashboard-widget[data-widget-id='light-devices']_&]:[display:none]",
  ].join(' '),
  "light-devices-head": [
    // .light-page .dashboard-widget[data-widget-id="light-devices"] .light-devices-head
    "gb:device-library:[.light-page_.dashboard-widget[data-widget-id='light-devices']_&]:[margin-bottom:14px]",
    // .light-devices-head
    "gb:device-library:[display:flex] gb:device-library:[align-items:center] gb:device-library:[gap:12px]",
    "gb:device-library:[margin-bottom:12px]",
  ].join(' '),
  "light-devices-grid": [
    // .light-devices-grid
    "gb:device-library:[display:grid] gb:device-library:[grid-template-columns:repeat(auto-fit,_minmax(min(280px,_100%),_1fr))] gb:device-library:[gap:14px]",
    // .light-devices-grid — (max-width: 600px)
    "gb:device-library:device-mobile:[grid-template-columns:1fr] gb:device-library:device-mobile:[gap:12px]",
  ].join(' '),
  "light-device-card": [
    // .light-device-card
    "gb:device-library:[background:color-mix(in_srgb,_var(--bg-card)_94%,_transparent)] gb:device-library:[border:1px_solid_color-mix(in_srgb,_var(--border)_82%,_transparent)] gb:device-library:[border-radius:var(--radius)]",
    "gb:device-library:[padding:14px_16px] gb:device-library:[display:flex] gb:device-library:[flex-direction:column]",
    "gb:device-library:[gap:10px] gb:device-library:[position:relative] gb:device-library:[overflow:hidden]",
    "gb:device-library:[transition:border-color_0.15s,_box-shadow_0.15s]",
    // .light-device-card:hover
    "gb:device-library:[&:hover]:[border-color:var(--accent)] gb:device-library:[&:hover]:[box-shadow:0_2px_12px_color-mix(in_srgb,_var(--text-primary)_8%,_transparent)]",
    // .light-device-card::before
    "gb:device-library:[&::before]:[content:''] gb:device-library:[&::before]:[position:absolute] gb:device-library:[&::before]:[left:0]",
    "gb:device-library:[&::before]:[top:0] gb:device-library:[&::before]:[bottom:0] gb:device-library:[&::before]:[width:4px]",
    "gb:device-library:[&::before]:[background:var(--text-muted)]",
    // .light-device-card — (max-width: 600px)
    "gb:device-library:device-mobile:[padding:14px_14px_14px_18px]",
  ].join(' '),
  "light-device-card-type-uvb": [
    // .light-device-card-type-uvb::before
    "gb:device-library:[&.light-device-card-type-uvb::before]:[background:linear-gradient(to_bottom,_#f59e0b,_#ef4444)]",
  ].join(' '),
  "light-device-card-type-uva": [
    // .light-device-card-type-uva::before
    "gb:device-library:[&.light-device-card-type-uva::before]:[background:#f97316]",
  ].join(' '),
  "light-device-card-type-combined": [
    // .light-device-card-type-combined::before
    "gb:device-library:[&.light-device-card-type-combined::before]:[background:#ef4444]",
  ].join(' '),
  "light-device-card-type-pbm-targeted": [
    // .light-device-card-type-pbm-targeted::before
    "gb:device-library:[&.light-device-card-type-pbm-targeted::before]:[background:linear-gradient(to_bottom,_#ef4444,_#b91c1c)]",
  ].join(' '),
  "light-device-card-type-sad": [
    // .light-device-card-type-sad::before
    "gb:device-library:[&.light-device-card-type-sad::before]:[background:#fbbf24]",
  ].join(' '),
  "light-device-card-type-dawn-sim": [
    // .light-device-card-type-dawn-sim::before
    "gb:device-library:[&.light-device-card-type-dawn-sim::before]:[background:#fb923c]",
  ].join(' '),
  "light-device-card-type-full-spectrum": [
    // .light-device-card-type-full-spectrum::before
    "gb:device-library:[&.light-device-card-type-full-spectrum::before]:[background:#facc15]",
  ].join(' '),
  "light-device-head": [
    // .light-device-head
    "gb:device-library:[display:flex] gb:device-library:[align-items:flex-start] gb:device-library:[gap:10px]",
  ].join(' '),
  "light-device-icon": [
    // .light-device-icon
    "gb:device-library:[font-size:22px] gb:device-library:[line-height:1] gb:device-library:[flex-shrink:0]",
    "gb:device-library:[margin-top:2px]",
  ].join(' '),
  "light-device-titleblock": [
    // .light-device-titleblock
    "gb:device-library:[flex:1] gb:device-library:[min-width:0] gb:device-library:[display:flex]",
    "gb:device-library:[flex-direction:column] gb:device-library:[gap:2px]",
  ].join(' '),
  "light-device-name": [
    // .light-device-name
    "gb:device-library:[font-weight:600] gb:device-library:[color:var(--text-primary)] gb:device-library:[font-size:14px]",
    "gb:device-library:[overflow:hidden] gb:device-library:[text-overflow:ellipsis]",
    // .light-device-name — (max-width: 600px)
    "gb:device-library:device-mobile:[white-space:normal] gb:device-library:device-mobile:[overflow:visible] gb:device-library:device-mobile:[line-height:1.3]",
    // .light-device-name — (max-width: 375px)
    "gb:device-library:device-narrow:[font-size:13px]",
  ].join(' '),
  "light-device-typeline": [
    // .light-device-typeline
    "gb:device-library:[font-size:11px] gb:device-library:[color:var(--text-secondary)]",
    // .light-device-typeline — (max-width: 600px)
    "gb:device-library:device-mobile:[line-height:1.4]",
    // .light-device-typeline — (max-width: 375px)
    "gb:device-library:device-narrow:[font-size:10px]",
  ].join(' '),
  "light-device-delete": [
    // .light-device-delete
    "gb:device-library:[background:transparent] gb:device-library:[border:none] gb:device-library:[color:var(--text-secondary)]",
    "gb:device-library:[font-size:18px] gb:device-library:[line-height:1] gb:device-library:[cursor:pointer]",
    "gb:device-library:[padding:4px_8px] gb:device-library:[border-radius:4px] gb:device-library:[flex-shrink:0]",
    "gb:device-library:[opacity:0] gb:device-library:[transition:opacity_0.15s,_color_0.15s,_background_0.15s]",
    // .light-device-card:hover .light-device-delete
    "gb:device-library:[.light-device-card:hover_&]:[opacity:1]",
    // .light-device-delete:focus-visible
    "gb:device-library:[&:focus-visible]:[opacity:1]",
    // .light-device-delete:hover
    "gb:device-library:[&:hover]:[color:var(--red)] gb:device-library:[&:hover]:[background:var(--bg-secondary)]",
    // .light-device-delete — (hover: none)
    "gb:device-library:device-no-hover:[opacity:1]",
    // .light-device-delete:active — (hover: none)
    "gb:device-library:device-no-hover:[&:active]:[opacity:1]",
    // .light-device-delete — (max-width: 600px)
    "gb:device-library:device-mobile:[opacity:1]",
  ].join(' '),
  "light-device-feeds": [
    // .light-device-feeds
    "gb:device-library:[display:flex] gb:device-library:[align-items:center] gb:device-library:[gap:6px]",
    "gb:device-library:[flex-wrap:wrap] gb:device-library:[font-size:11px]",
  ].join(' '),
  "light-device-feeds-label": [
    // .light-device-feeds-label
    "gb:device-library:[color:var(--text-secondary)] gb:device-library:[text-transform:uppercase] gb:device-library:[letter-spacing:0.04em]",
    "gb:device-library:[margin-right:2px]",
  ].join(' '),
  "light-device-feed-chip": [
    // .light-device-feed-chip
    "gb:device-library:[display:inline-flex] gb:device-library:[align-items:center] gb:device-library:[gap:4px]",
    "gb:device-library:[padding:3px_8px] gb:device-library:[background:var(--bg-secondary)] gb:device-library:[border-radius:10px]",
    "gb:device-library:[color:var(--text-secondary)] gb:device-library:[white-space:nowrap]",
    // .light-device-feed-chip — (max-width: 768px)
    "gb:device-library:device-tablet:[padding:4px_6px] gb:device-library:device-tablet:[min-width:24px] gb:device-library:device-tablet:[justify-content:center]",
  ].join(' '),
  "light-device-feed-icon": [
    // .light-device-feed-icon
    "gb:device-library:[font-size:12px]",
    // .light-device-feed-icon — (max-width: 768px)
    "gb:device-library:device-tablet:[font-size:13px]",
  ].join(' '),
  "light-device-feed-label": [
    // .light-device-feed-label
    "gb:device-library:[font-size:11px] gb:device-library:[font-weight:500]",
    // .light-device-feed-label — (max-width: 768px)
    "gb:device-library:device-tablet:[display:none]",
  ].join(' '),
  "light-device-stats": [
    // .light-device-stats
    "gb:device-library:[font-size:11px] gb:device-library:[color:var(--text-secondary)] gb:device-library:[font-variant-numeric:tabular-nums]",
  ].join(' '),
  "light-device-log": [
    // .light-device-log
    "gb:device-library:[width:100%] gb:device-library:[padding:8px_14px] gb:device-library:[font-size:13px]",
    "gb:device-library:[font-weight:600]",
  ].join(' '),
  "light-device-actions": [
    // .light-device-actions
    "gb:device-library:[display:flex] gb:device-library:[align-items:center] gb:device-library:[gap:12px]",
    "gb:device-library:[flex-wrap:wrap] gb:device-library:[margin-top:4px]",
  ].join(' '),
  "rec-light-device-link": [
    // .rec-light-device-link
    "gb:device-library:[font-size:12px] gb:device-library:[color:var(--accent-light,var(--accent))] gb:device-library:[text-decoration:none]",
    // .rec-light-device-link:hover
    "gb:device-library:[&:hover]:[text-decoration:underline]",
  ].join(' '),
  "light-device-picker-list": [
    // .light-device-picker-list
    "gb:device-library:[display:flex] gb:device-library:[flex-direction:column] gb:device-library:[gap:6px]",
    "gb:device-library:[margin-top:8px]",
  ].join(' '),
  "light-device-picker-row": [
    // .light-device-picker-row
    "gb:device-library:[display:flex] gb:device-library:[flex-direction:column] gb:device-library:[gap:2px]",
    "gb:device-library:[align-items:flex-start] gb:device-library:[padding:10px_14px] gb:device-library:[background:var(--bg-secondary)]",
    "gb:device-library:[border:1px_solid_var(--border)] gb:device-library:[border-radius:var(--radius-sm)] gb:device-library:[font-family:inherit]",
    "gb:device-library:[cursor:pointer] gb:device-library:[text-align:left]",
    // .light-device-picker-row:hover
    "gb:device-library:[&:hover]:[border-color:var(--accent)] gb:device-library:[&:hover]:[background:var(--bg-card)]",
  ].join(' '),
  "light-device-picker-name": [
    // .light-device-picker-name
    "gb:device-library:[font-weight:600] gb:device-library:[color:var(--text-primary)] gb:device-library:[font-size:14px]",
  ].join(' '),
  "light-device-picker-meta": [
    // .light-device-picker-meta
    "gb:device-library:[color:var(--text-secondary)] gb:device-library:[font-size:12px]",
  ].join(' '),
};
const controls = new Set(['import-btn', 'modal-close', 'light-device-delete', 'light-device-log', 'light-device-picker-row', 'rec-light-device-link']);
const control = [
  'gb:device-library:focus-visible:[outline:2px_solid_var(--accent)] gb:device-library:focus-visible:[outline-offset:2px]',
  'gb:device-library:device-coarse:[min-height:44px] gb:device-library:device-coarse:[min-width:44px]',
].join(' ');
export function deviceLibraryClasses(names: string): string {
  return names.split(/\s+/).map(name => {
    const owned = [name, classes[name] || ''];
    if (controls.has(name)) owned.push(control);
    if (name === 'rec-light-device-link') {
      owned.push('gb:device-library:device-coarse:[display:inline-flex] gb:device-library:device-coarse:[align-items:center]');
    }
    return owned.join(' ');
  }).join(' ');
}
