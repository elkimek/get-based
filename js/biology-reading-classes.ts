// Scoped reading surfaces retain the app's semantic palette and table contracts.
const focus = 'gb:reading-ui:focus-visible:[outline:2px_solid_var(--accent)] gb:reading-ui:focus-visible:[outline-offset:3px]';
const control = `${focus} gb:reading-ui:device-coarse:[min-height:44px] gb:reading-ui:device-coarse:[min-width:44px]`;
const classes: Record<string, string> = {
  'biology-score-marker-section': 'gb:reading-ui:[clear:both] gb:reading-ui:[margin-top:24px]',
  'biology-marker-header': 'gb:reading-ui:[margin-bottom:12px]',
  'biology-marker-heading': 'gb:reading-ui:[display:flex] gb:reading-ui:[align-items:center] gb:reading-ui:[gap:8px] gb:reading-ui:[margin:0] gb:reading-ui:[font-size:16px] gb:reading-ui:[color:var(--text-primary)]',
  'biology-marker-intro': 'gb:reading-ui:[margin:6px_0_0] gb:reading-ui:[font-size:13px] gb:reading-ui:[color:var(--text-secondary)]',
  'biology-section-count': 'gb:reading-ui:[display:inline-flex] gb:reading-ui:[align-items:center] gb:reading-ui:[justify-content:center] gb:reading-ui:[min-width:24px] gb:reading-ui:[padding:2px_6px] gb:reading-ui:[border-radius:6px] gb:reading-ui:[background:var(--bg-secondary)] gb:reading-ui:[border:1px_solid_var(--border)] gb:reading-ui:[font-size:12px] gb:reading-ui:[color:var(--text-secondary)] gb:reading-ui:[font-weight:500]',
  'biology-table-scroll-hint': 'gb:reading-ui:[display:none] gb:reading-ui:reading-mobile:[display:block] gb:reading-ui:reading-mobile:[font-size:12px] gb:reading-ui:reading-mobile:[color:var(--text-secondary)] gb:reading-ui:reading-mobile:[margin:8px_0]',
  'biology-score-table-scroll': `gb:reading-ui:[border:1px_solid_var(--border)] gb:reading-ui:[border-radius:8px] gb:reading-ui:[overflow:auto] ${focus}`,
  'biology-score-table': 'gb:reading-ui:[width:100%] gb:reading-ui:[min-width:740px] gb:reading-ui:[font-size:13px]',
  'biology-reading-cell': 'gb:reading-ui:[padding:12px_16px] gb:reading-ui:[vertical-align:middle] gb:reading-ui:[line-height:1.5]',
  'biology-reading-column': 'gb:reading-ui:[text-align:left] gb:reading-ui:[position:static] gb:reading-ui:[&:first-child]:[position:static] gb:reading-ui:[white-space:normal]',
  'biology-reading-row-heading': 'gb:reading-ui:[text-align:left] gb:reading-ui:[background:var(--bg-secondary)] gb:reading-ui:[font-size:14px] gb:reading-ui:[font-weight:500] gb:reading-ui:[border-bottom:1px_solid_var(--border)] gb:reading-ui:[tr:hover>&]:[background:var(--bg-hover)] gb:reading-ui:reading-mobile:[position:sticky] gb:reading-ui:reading-mobile:[left:0] gb:reading-ui:reading-mobile:[z-index:1] gb:reading-ui:reading-mobile:[max-width:150px]',
  'biology-reading-value': 'gb:reading-ui:[white-space:nowrap]',
  'biology-reading-small': 'gb:reading-ui:[display:block] gb:reading-ui:[font-size:12px] gb:reading-ui:[font-weight:400] gb:reading-ui:[line-height:1.5] gb:reading-ui:[color:var(--text-secondary)] gb:reading-ui:[max-width:250px] gb:reading-ui:[margin-top:4px]',
  'biology-marker-name': 'gb:reading-ui:[display:inline] gb:reading-ui:[max-width:100%] gb:reading-ui:[padding:0] gb:reading-ui:[border:0] gb:reading-ui:[border-radius:0] gb:reading-ui:[background:transparent] gb:reading-ui:[color:var(--text-primary)] gb:reading-ui:[font-family:inherit] gb:reading-ui:[font-size:inherit] gb:reading-ui:[font-style:inherit] gb:reading-ui:[line-height:1.5] gb:reading-ui:[text-align:left]',
  'biology-score-marker-link': `gb:reading-ui:[font-weight:inherit] gb:reading-ui:device-coarse:[display:inline-flex] gb:reading-ui:device-coarse:[align-items:center] gb:reading-ui:[cursor:pointer] gb:reading-ui:[text-decoration:none] gb:reading-ui:hover:[color:var(--accent)] gb:reading-ui:hover:[text-decoration:underline] gb:reading-ui:focus-visible:[color:var(--accent)] gb:reading-ui:focus-visible:[text-decoration:underline] gb:reading-ui:[text-underline-offset:3px] ${control}`,
  'biology-score-marker-link-static': 'gb:reading-ui:[font-weight:600] gb:reading-ui:[line-height:inherit]',
  'biology-fit-badge': 'gb:reading-ui:[display:inline-block] gb:reading-ui:[color:var(--score-color)] gb:reading-ui:[background:color-mix(in_srgb,var(--score-color)_10%,transparent)] gb:reading-ui:[border:1px_solid_color-mix(in_srgb,var(--score-color)_25%,transparent)] gb:reading-ui:[border-radius:6px] gb:reading-ui:[padding:2px_8px] gb:reading-ui:[font-size:12px] gb:reading-ui:[font-weight:600] gb:reading-ui:[white-space:nowrap]',
  'biology-score-missing': 'gb:reading-ui:[font-size:13px] gb:reading-ui:[line-height:1.6] gb:reading-ui:[color:var(--text-secondary)] gb:reading-ui:[padding:10px_12px] gb:reading-ui:[border-radius:6px] gb:reading-ui:[background:var(--bg-secondary)]',
  'biology-reading-facts': 'gb:reading-ui:[display:grid] gb:reading-ui:[grid-template-columns:repeat(2,minmax(0,1fr))] gb:reading-ui:[gap:12px] gb:reading-ui:[margin:0_0_16px] gb:reading-ui:reading-phone:[grid-template-columns:1fr]',
  'biology-reading-fact': 'gb:reading-ui:[padding:16px] gb:reading-ui:[border:1px_solid_var(--border)] gb:reading-ui:[border-radius:8px] gb:reading-ui:[background:var(--bg-card)]',
  'biology-reading-fact-label': 'gb:reading-ui:[color:var(--text-primary)] gb:reading-ui:[font-size:14px] gb:reading-ui:[font-weight:600] gb:reading-ui:[margin-bottom:6px]',
  'biology-reading-fact-value': 'gb:reading-ui:[margin:0] gb:reading-ui:[font-size:14px] gb:reading-ui:[line-height:1.6] gb:reading-ui:[color:var(--text-secondary)] gb:reading-ui:[max-width:65ch]',
  'biology-reading-notes': 'gb:reading-ui:[clear:both] gb:reading-ui:[margin:12px_0] gb:reading-ui:[font-size:14px] gb:reading-ui:[line-height:1.6]',
  'biology-reading-notes-summary': `gb:reading-ui:[cursor:pointer] gb:reading-ui:[padding:10px_0] gb:reading-ui:[color:var(--text-primary)] gb:reading-ui:[font-weight:500] ${control}`,
  'biology-reading-note-list': 'gb:reading-ui:[margin:4px_0_16px] gb:reading-ui:[padding-left:24px] gb:reading-ui:[max-width:90ch] gb:reading-ui:[color:var(--text-secondary)]',
  'biology-reading-note-item': 'gb:reading-ui:[&+li]:[margin-top:10px]',
  'biology-reading-note-copy': 'gb:reading-ui:[max-width:80ch] gb:reading-ui:[color:var(--text-secondary)]',
  'biology-score-methodology': 'gb:reading-ui:[margin-top:20px] gb:reading-ui:[font-size:14px] gb:reading-ui:[line-height:1.6] gb:reading-ui:[border:1px_solid_var(--border)] gb:reading-ui:[border-radius:8px] gb:reading-ui:[background:var(--bg-secondary)]',
  'biology-methodology-summary': `gb:reading-ui:[cursor:pointer] gb:reading-ui:[padding:16px] gb:reading-ui:[color:var(--text-primary)] gb:reading-ui:[font-size:15px] gb:reading-ui:[font-weight:600] gb:reading-ui:[details[open]>&]:[border-bottom:1px_solid_var(--border)] ${control}`,
  'biology-reading-body': 'gb:reading-ui:[padding:20px] gb:reading-ui:[color:var(--text-secondary)] gb:reading-ui:[font-size:14px] gb:reading-ui:[line-height:1.65] gb:reading-ui:reading-phone:[padding:16px]',
  'biology-reading-paragraph': 'gb:reading-ui:[max-width:80ch] gb:reading-ui:[margin:0_0_16px] gb:reading-ui:[overflow-wrap:anywhere]',
  'biology-reading-lead': 'gb:reading-ui:[color:var(--text-primary)] gb:reading-ui:[font-size:16px] gb:reading-ui:[font-weight:500]',
  'biology-reading-source': 'gb:reading-ui:[display:flex] gb:reading-ui:[flex-wrap:wrap] gb:reading-ui:[align-items:center] gb:reading-ui:[gap:12px] gb:reading-ui:[padding-top:12px] gb:reading-ui:[border-top:1px_solid_var(--border)] gb:reading-ui:[font-size:13px]',
  'biology-reading-link': `gb:reading-ui:device-coarse:[display:inline-flex] gb:reading-ui:device-coarse:[align-items:center] ${control}`,
};
export function readingClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
