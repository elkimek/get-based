/** Existing ID scopes private inline recipes; no wrapper or marker is added. */
export const sunDataSourceClasses = {
  heading: [
    'gb:sun-source-inline:[margin:0_0_6px_0]',
    'gb:sun-source-inline:[font-size:13px]',
    'gb:sun-source-inline:[color:var(--text-primary)]',
  ].join(' '),
  description: [
    'gb:sun-source-inline:[margin-bottom:10px]',
  ].join(' '),
  options: [
    'gb:sun-source-inline:[display:flex]',
    'gb:sun-source-inline:[flex-direction:column]',
    'gb:sun-source-inline:[gap:8px]',
  ].join(' '),
  option: [
    'gb:sun-source-inline:[display:flex]',
    'gb:sun-source-inline:[gap:10px]',
    'gb:sun-source-inline:[padding:10px_12px]',
    'gb:sun-source-inline:[border-radius:var(--radius-sm)]',
    'gb:sun-source-inline:[cursor:pointer]',
  ].join(' '),
  optionUnchecked: [
    'gb:sun-source-inline:[border:1px_solid_var(--border)]',
  ].join(' '),
  optionChecked: [
    'gb:sun-source-inline:sun-source-selected-frame',
  ].join(' '),
  radio: [
    'gb:sun-source-inline:[margin-top:3px]',
  ].join(' '),
  optionLabel: [
    'gb:sun-source-inline:[font-size:13px]',
    'gb:sun-source-inline:[font-weight:500]',
    'gb:sun-source-inline:[color:var(--text-primary)]',
  ].join(' '),
  optionDescription: [
    'gb:sun-source-inline:[font-size:11px]',
    'gb:sun-source-inline:[color:var(--text-muted)]',
    'gb:sun-source-inline:[line-height:1.4]',
  ].join(' '),
  selfhost: [
    'gb:sun-source-inline:[margin-top:10px]',
  ].join(' '),
  credentialLabel: [
    'gb:sun-source-inline:[font-size:12px]',
    'gb:sun-source-inline:[color:var(--text-muted)]',
  ].join(' '),
  credentialInput: [
    'gb:sun-source-inline:[width:100%]',
    'gb:sun-source-inline:[margin-top:4px]',
  ].join(' '),
  bearerLabel: [
    'gb:sun-source-inline:[font-size:12px]',
    'gb:sun-source-inline:[color:var(--text-muted)]',
    'gb:sun-source-inline:[margin-top:8px]',
    'gb:sun-source-inline:[display:block]',
  ].join(' '),
  hostedBoundary: [
    'gb:sun-source-inline:[font-size:12px]',
    'gb:sun-source-inline:[color:var(--text-muted)]',
    'gb:sun-source-inline:[margin-top:14px]',
  ].join(' '),
  roundingRow: [
    'gb:sun-source-inline:[display:flex]',
    'gb:sun-source-inline:[align-items:start]',
    'gb:sun-source-inline:[justify-content:space-between]',
    'gb:sun-source-inline:[gap:12px]',
    'gb:sun-source-inline:[margin-top:14px]',
  ].join(' '),
  roundingLabel: [
    'gb:sun-source-inline:[font-size:13px]',
  ].join(' '),
  roundingDescription: [
    'gb:sun-source-inline:[font-size:11px]',
    'gb:sun-source-inline:[color:var(--text-muted)]',
  ].join(' '),
  roundingToggle: [
    'gb:sun-source-inline:[margin-top:2px]',
  ].join(' '),
} as const;
