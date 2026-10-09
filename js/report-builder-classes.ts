/** Report-owned utilities. Generic modal shells and import buttons keep their shared owner. */
const styles = (...rules: string[]): string => rules.join(' ');
const inheritedFont = styles(
  'gb:report-ui:[font-family:inherit] gb:report-ui:[font-style:inherit] gb:report-ui:[font-variant:inherit]',
  'gb:report-ui:[font-weight:inherit] gb:report-ui:[font-stretch:inherit] gb:report-ui:[line-height:inherit]',
);
const badge = styles(
  'gb:report-ui:[display:inline-flex] gb:report-ui:[align-items:center] gb:report-ui:[width:fit-content]',
  'gb:report-ui:[border:1px_solid_color-mix(in_srgb,var(--border)_78%,transparent)] gb:report-ui:[border-radius:999px]',
  'gb:report-ui:[background:color-mix(in_srgb,var(--bg-secondary)_78%,transparent)] gb:report-ui:[color:var(--text-muted)]',
  'gb:report-ui:[font-size:10px] gb:report-ui:[font-weight:700] gb:report-ui:[white-space:nowrap]',
);
const button = styles(
  'gb:report-ui:[border:1px_solid_var(--border)] gb:report-ui:[border-radius:var(--radius-sm)]',
  'gb:report-ui:[background:var(--bg-secondary)] gb:report-ui:[color:var(--text-primary)] gb:report-ui:[cursor:pointer]',
  'gb:report-ui:[transition:border-color_0.15s,background_0.15s,color_0.15s]',
  'gb:report-ui:report-hover:[border-color:var(--accent)] gb:report-ui:report-hover:[background:var(--accent-fill)]',
);
const choice = styles(
  'gb:report-ui:[display:flex] gb:report-ui:[align-items:center] gb:report-ui:[gap:9px] gb:report-ui:[min-width:0]',
  'gb:report-ui:[min-height:44px] gb:report-ui:[padding:8px_10px] gb:report-ui:[border:1px_solid_var(--border)]',
  'gb:report-ui:[border-radius:var(--radius-sm)] gb:report-ui:[background:var(--bg-secondary)]',
  'gb:report-ui:[color:var(--text-primary)] gb:report-ui:[font-size:13px]',
  'gb:report-ui:has-[input:checked]:[border-color:color-mix(in_srgb,var(--accent)_34%,var(--border))]',
  'gb:report-ui:has-[input:checked]:[background:color-mix(in_srgb,var(--accent)_7%,var(--bg-secondary))]',
);
const classes: Record<string, string> = {
  'report-builder-modal': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[flex-direction:column] gb:report-ui:[width:min(94vw,840px)]',
    'gb:report-ui:[max-width:840px]! gb:report-ui:[max-height:min(92vh,860px)] gb:report-ui:[overflow:hidden] gb:report-ui:[padding:0]',
    'gb:report-ui:report-phone:[width:min(96vw,560px)] gb:report-ui:report-phone:[max-height:calc(100dvh_-_24px)]',
    'gb:report-ui:[&_[hidden]]:[display:none]!',
    'gb:report-ui:[&_:is(button,input,select,textarea,summary):focus-visible]:[outline:2px_solid_var(--accent)]',
    'gb:report-ui:[&_:is(button,input,select,textarea,summary):focus-visible]:[outline-offset:3px]',
  ),
  'report-builder-head': 'gb:report-ui:[flex:0_0_auto]',
  'report-builder-body': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[flex-direction:column] gb:report-ui:[flex:1_1_auto]',
    'gb:report-ui:[gap:16px] gb:report-ui:[min-height:0] gb:report-ui:[overflow:hidden]',
  ),
  'report-builder-scroll': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[flex:1_1_auto] gb:report-ui:[min-height:0] gb:report-ui:[flex-direction:column]',
    'gb:report-ui:[gap:16px] gb:report-ui:[overflow-y:auto] gb:report-ui:[overscroll-behavior:contain]',
    'gb:report-ui:[scrollbar-gutter:stable] gb:report-ui:[padding-right:2px] gb:report-ui:[-webkit-overflow-scrolling:touch]',
  ),
  'report-builder-actions': styles(
    'gb:report-ui:[flex-wrap:wrap] gb:report-ui:[align-items:center] gb:report-ui:[justify-content:space-between]',
    'gb:report-ui:[flex:0_0_auto] gb:report-ui:[margin-top:0]',
    'gb:report-ui:report-phone:[align-items:stretch] gb:report-ui:report-phone:[flex-direction:column]',
  ),
  'report-builder-section-title': 'gb:report-ui:[color:var(--text-primary)] gb:report-ui:[font-size:14px] gb:report-ui:[font-weight:750]',
  'report-selection-count': styles(
    badge, 'gb:report-ui:[min-height:22px] gb:report-ui:[padding:2px_7px] gb:report-ui:[font-family:var(--font-sans)]',
    'gb:report-ui:[letter-spacing:0] gb:report-ui:[text-transform:none]',
  ),
  'report-optional-label': styles(
    badge, 'gb:report-ui:[min-height:20px] gb:report-ui:[margin-left:5px] gb:report-ui:[padding:1px_6px] gb:report-ui:[vertical-align:1px]',
  ),
  'report-builder-section': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[flex-direction:column] gb:report-ui:[gap:10px] gb:report-ui:[min-width:0]',
    'gb:report-ui:[padding:14px] gb:report-ui:[border:1px_solid_var(--border)] gb:report-ui:[border-radius:12px]',
    'gb:report-ui:[background:color-mix(in_srgb,var(--bg-card)_72%,transparent)]',
  ),
  'report-builder-two-col': styles(
    'gb:report-ui:[display:grid] gb:report-ui:[grid-template-columns:repeat(2,minmax(0,1fr))]',
    'gb:report-ui:[align-items:start] gb:report-ui:[gap:14px] gb:report-ui:report-phone:[grid-template-columns:1fr]',
  ),
  'report-builder-label': styles(
    'gb:report-ui:[color:var(--text-secondary)] gb:report-ui:[font-family:inherit] gb:report-ui:[font-size:13px]',
    'gb:report-ui:[font-weight:600] gb:report-ui:[letter-spacing:0] gb:report-ui:[text-transform:none]',
  ),
  'report-builder-field': 'gb:report-ui:[display:flex] gb:report-ui:[flex-direction:column] gb:report-ui:[gap:8px] gb:report-ui:[min-width:0]',
  'report-builder-field-head': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[align-items:center] gb:report-ui:[justify-content:space-between]',
    'gb:report-ui:[gap:8px] gb:report-ui:[min-width:0]',
  ),
  'report-builder-select': styles(
    inheritedFont, 'gb:report-ui:[width:100%] gb:report-ui:[min-height:40px] gb:report-ui:[padding:8px_10px]',
    'gb:report-ui:[border:1px_solid_var(--border)] gb:report-ui:[border-radius:var(--radius-sm)]',
    'gb:report-ui:[background:var(--bg-secondary)] gb:report-ui:[color:var(--text-primary)] gb:report-ui:[font-size:13px]',
  ),
  'report-preset-grid': styles(
    'gb:report-ui:[display:grid] gb:report-ui:[grid-template-columns:repeat(4,minmax(0,1fr))] gb:report-ui:[gap:8px]',
    'gb:report-ui:report-phone:[grid-template-columns:repeat(2,minmax(0,1fr))]',
  ),
  'report-preset-btn': styles(
    button, 'gb:report-ui:[display:flex] gb:report-ui:[min-height:64px] gb:report-ui:[flex-direction:column]',
    'gb:report-ui:[align-items:flex-start] gb:report-ui:[justify-content:center] gb:report-ui:[gap:4px]',
    'gb:report-ui:[padding:9px] gb:report-ui:[text-align:left]',
    'gb:report-ui:[&.active]:[border-color:var(--accent)] gb:report-ui:[&.active]:[background:var(--accent-fill)]',
  ),
  'report-preset-title': 'gb:report-ui:[font-size:13px] gb:report-ui:[font-weight:700]',
  'report-preset-meta': 'gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:11px]',
  'report-category-meta': 'gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:11px]',
  'report-builder-help': 'gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:12px] gb:report-ui:[line-height:1.4] gb:report-ui:[margin-top:3px]',
  'report-intro-copy': 'gb:report-strong:[margin:0] gb:report-strong:[font-size:13px]',
  'report-section-grid': 'gb:report-ui:[display:grid] gb:report-ui:[grid-template-columns:repeat(2,minmax(0,1fr))] gb:report-ui:[gap:8px] gb:report-ui:report-phone:[grid-template-columns:1fr]',
  'report-builder-check': choice,
  'report-category-row': choice,
  'report-choice-input': 'gb:report-ui:[flex:0_0_auto]',
  'report-builder-row-head': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[align-items:center] gb:report-ui:[justify-content:space-between] gb:report-ui:[gap:10px]',
    'gb:report-ui:report-phone:[align-items:flex-start] gb:report-ui:report-phone:[flex-direction:column]',
  ),
  'report-category-actions': styles(
    'gb:report-ui:[display:flex] gb:report-ui:[gap:6px] gb:report-ui:[flex-wrap:wrap] gb:report-ui:[justify-content:flex-end]',
    'gb:report-ui:report-phone:[justify-content:flex-start]',
  ),
  'report-mini-btn': styles(
    button, 'gb:report-ui:[min-height:36px] gb:report-ui:[padding:6px_10px] gb:report-ui:[font-size:12px]',
    'gb:report-ui:report-phone:[min-height:44px]',
  ),
  'report-category-list': 'gb:report-ui:[display:grid] gb:report-ui:[grid-template-columns:repeat(2,minmax(0,1fr))] gb:report-ui:[gap:8px] gb:report-ui:report-phone:[grid-template-columns:1fr]',
  'report-category-copy': 'gb:report-ui:[display:flex] gb:report-ui:[min-width:0] gb:report-ui:[flex-direction:column] gb:report-ui:[gap:2px]',
  'report-category-title': 'gb:report-ui:[overflow:hidden] gb:report-ui:[font-weight:600] gb:report-ui:[text-overflow:ellipsis] gb:report-ui:[white-space:nowrap]',
  'report-builder-empty': 'gb:report-ui:[padding:10px_2px_2px] gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:13px]',
  'report-ai-builder': styles(
    'gb:report-strong:[border:1px_solid_var(--border)] gb:report-strong:[border-radius:var(--radius-sm)]',
    'gb:report-strong:[background:var(--bg-secondary)] gb:report-strong:[padding:12px]',
  ),
  'report-ai-actions': 'gb:report-ui:[display:flex] gb:report-ui:[flex-wrap:wrap] gb:report-ui:[gap:6px] gb:report-ui:[justify-content:flex-start]',
  'report-ai-status': 'gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:12px] gb:report-ui:[line-height:1.4] gb:report-ui:[margin-top:10px]',
  'report-ai-summary-text': styles(
    inheritedFont, 'gb:report-ui:[width:100%] gb:report-ui:[height:min(28vh,220px)] gb:report-ui:[min-height:96px] gb:report-ui:[max-height:320px]',
    'gb:report-ui:[margin-top:10px] gb:report-ui:[padding:10px_11px] gb:report-ui:[border:1px_solid_var(--border)]',
    'gb:report-ui:[border-radius:var(--radius-sm)] gb:report-ui:[background:var(--bg-card)] gb:report-ui:[color:var(--text-primary)]',
    'gb:report-ui:[font-size:13px] gb:report-strong:[line-height:1.45] gb:report-ui:[overflow-y:auto]',
    'gb:report-ui:[overscroll-behavior:contain] gb:report-ui:[resize:vertical] gb:report-ui:[-webkit-overflow-scrolling:touch]',
  ),
  'report-builder-preview-btn': styles(
    'gb:report-ui:[min-width:132px] gb:report-ui:[color:#07111f]',
    'gb:report-ui:[box-shadow:0_10px_28px_color-mix(in_srgb,var(--accent)_24%,transparent)]',
    'gb:report-ui:report-hover:[box-shadow:var(--shadow-glow)] gb:report-ui:report-hover:[transform:translateY(-1px)]',
  ),
  'report-builder-selection-summary': styles(
    'gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:11px] gb:report-ui:[line-height:1.4]',
    'gb:report-ui:report-phone:[text-align:center]',
  ),
  'report-builder-footer-buttons': 'gb:report-ui:[display:flex] gb:report-ui:[gap:8px] gb:report-ui:[justify-content:flex-end] gb:report-ui:report-phone:[width:100%]',
  'report-builder-footer-button': 'gb:report-ui:report-phone:[min-height:44px] gb:report-ui:report-phone:[flex:1_1_0]',
  'report-detail-options': 'gb:report-ui:[border:0] gb:report-ui:[padding:0] gb:report-ui:[margin:6px_0_0] gb:report-ui:[min-width:0]',
  'report-detail-legend': 'gb:report-ui:[padding:0] gb:report-ui:[margin-bottom:8px]',
  'report-detail-card': 'gb:report-strong:[align-items:flex-start] gb:report-strong:[padding:12px] gb:report-ui:[cursor:pointer]',
  'report-detail-input': 'gb:report-ui:[margin-top:3px] gb:report-ui:[flex:0_0_auto]',
  'report-detail-title': 'gb:report-ui:[display:block] gb:report-ui:[font-size:13px] gb:report-ui:[font-weight:650]',
  'report-detail-description': 'gb:report-ui:[display:block] gb:report-ui:[color:var(--text-muted)] gb:report-ui:[font-size:12px] gb:report-ui:[line-height:1.5] gb:report-ui:[margin-top:4px]',
  'report-options-details': 'gb:report-ui:[border-top:1px_solid_var(--border)] gb:report-ui:[padding-top:4px]',
  'report-options-summary': styles(
    'gb:report-ui:[min-height:44px] gb:report-ui:[padding:12px_4px] gb:report-ui:[cursor:pointer]',
    'gb:report-ui:[font-size:13px] gb:report-ui:[font-weight:600] gb:report-ui:[color:var(--text-primary)]',
    'gb:report-ui:marker:[color:var(--text-muted)]',
  ),
  'report-options-meta': 'gb:report-ui:[margin-left:8px] gb:report-ui:[font-size:12px] gb:report-ui:[font-weight:400] gb:report-ui:[color:var(--text-muted)]',
  'report-options-body': 'gb:report-ui:[padding:4px_0_10px] gb:report-ui:[display:grid] gb:report-ui:[gap:10px]',
  'report-genome-options': 'gb:report-ui:[border-top:1px_solid_var(--border)] gb:report-ui:[padding-top:14px]',
  'report-note-review': 'gb:report-ui:[padding:12px] gb:report-ui:[border:1px_solid_var(--border)] gb:report-ui:[border-radius:var(--radius-sm)] gb:report-ui:[font-size:13px]',
  'report-note-text': 'gb:report-ui:[white-space:pre-wrap] gb:report-ui:[overflow-wrap:anywhere]',
};

export function reportBuilderClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
