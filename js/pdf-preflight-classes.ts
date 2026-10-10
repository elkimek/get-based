/** Owned inline-style replacements scoped to existing native confirmation hosts. */
export const pdfPreflightClasses = {
  modelActions: 'confirm-actions gb:pdf-preflight-inline:[flex-wrap:wrap] gb:pdf-preflight-inline:[gap:8px]',
  warningButton: 'confirm-btn gb:pdf-preflight-inline:[background:var(--yellow)] gb:pdf-preflight-inline:[color:#000]',
  unsupportedDialog: 'confirm-dialog gb:pdf-preflight-inline:[max-width:480px]',
  unsupportedMessage: 'confirm-message gb:pdf-preflight-inline:[margin-bottom:12px]',
  unsupportedCopy: [
    'gb:pdf-preflight-inline:[font-size:13px]',
    'gb:pdf-preflight-inline:[color:var(--text-secondary)]',
    'gb:pdf-preflight-inline:[margin-bottom:16px]',
    'gb:pdf-preflight-inline:[line-height:1.5]',
  ].join(' '),
  unsupportedHelp: 'gb:pdf-preflight-inline:[margin:10px_0_0_0]',
  unsupportedLink: 'gb:pdf-preflight-inline:[color:var(--accent)]',
  imageHeading: [
    'gb:pdf-preflight-inline:[font-size:14px]',
    'gb:pdf-preflight-inline:[font-weight:600]',
    'gb:pdf-preflight-inline:[margin-bottom:8px]',
  ].join(' '),
  imageCopy: [
    'gb:pdf-preflight-inline:[font-size:13px]',
    'gb:pdf-preflight-inline:[color:var(--text-muted)]',
    'gb:pdf-preflight-inline:[margin-bottom:16px]',
  ].join(' '),
  imageActions: [
    'gb:pdf-preflight-inline:[display:flex]',
    'gb:pdf-preflight-inline:[gap:8px]',
    'gb:pdf-preflight-inline:[justify-content:flex-end]',
  ].join(' '),
  imageNeutralButton: [
    'btn',
    'gb:pdf-preflight-inline:[padding:7px_16px]',
    'gb:pdf-preflight-inline:[border-radius:6px]',
    'gb:pdf-preflight-inline:[border:1px_solid_var(--border)]',
    'gb:pdf-preflight-inline:[background:var(--bg-card)]',
    'gb:pdf-preflight-inline:[color:var(--text-primary)]',
    'gb:pdf-preflight-inline:[cursor:pointer]',
  ].join(' '),
  imagePrimaryButton: [
    'btn',
    'gb:pdf-preflight-inline:[padding:7px_16px]',
    'gb:pdf-preflight-inline:[border-radius:6px]',
    'gb:pdf-preflight-inline:[border:none]',
    'gb:pdf-preflight-inline:[background:var(--accent-gradient)]',
    'gb:pdf-preflight-inline:[color:white]',
    'gb:pdf-preflight-inline:[cursor:pointer]',
    'gb:pdf-preflight-inline:[font-weight:500]',
  ].join(' '),
} as const;
