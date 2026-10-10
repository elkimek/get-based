import {cycleSharedUtilities} from './cycle-shared-classes.js';

/** Cycle import utilities preserve the frozen native selectors and inclusive phone breakpoint. */
const classes: Record<string, string> = {
  "import-preview-modal": [
    "gb:cycle-import-ui:[width:min(94vw,_920px)] gb:cycle-import-ui:[max-width:920px] gb:cycle-import-ui:[max-height:90vh]",
    "gb:cycle-import-ui:[padding:0] gb:cycle-import-ui:[overflow-y:auto] gb:cycle-import-ui:[overflow-x:hidden]",
    "gb:cycle-import-ui:[overscroll-behavior:contain] gb:cycle-import-ui:[background:var(--bg-secondary)] gb:cycle-import-ui:[box-shadow:var(--shadow-lg)]",
    "gb:cycle-import-ui:[&:is(#import-modal)]:[width:min(94vw,_820px)] gb:cycle-import-ui:[&:is(#import-modal)]:[max-width:820px] gb:cycle-import-ui:[&:is(#import-modal)]:[max-height:90vh]",
    "gb:cycle-import-ui:[&:is(#import-modal)]:[padding:0] gb:cycle-import-ui:[&.modal]:[width:min(94vw,_820px)] gb:cycle-import-ui:[&.modal]:[max-width:820px]",
    "gb:cycle-import-ui:[&.modal]:[max-height:90vh] gb:cycle-import-ui:[&.modal]:[padding:0] gb:cycle-import-ui:cycle-import-modal-id:[max-width:920px]",
    "gb:cycle-import-ui:cycle-import-phone:[width:calc(100vw_-_12px)] gb:cycle-import-ui:cycle-import-phone:[height:calc(100vh_-_12px)] gb:cycle-import-ui:cycle-import-phone:[max-height:none]",
    "gb:cycle-import-ui:cycle-import-phone:[padding:0] gb:cycle-import-ui:cycle-import-phone:supports-[height:100dvh]:[height:calc(100dvh_-_12px)] gb:cycle-import-ui:cycle-import-phone:[&:is(#import-modal)]:[width:calc(100vw_-_12px)]",
    "gb:cycle-import-ui:cycle-import-phone:[&:is(#import-modal)]:[height:calc(100vh_-_12px)] gb:cycle-import-ui:cycle-import-phone:[&:is(#import-modal)]:[max-height:none] gb:cycle-import-ui:cycle-import-phone:[&:is(#import-modal)]:[padding:0]",
    "gb:cycle-import-ui:cycle-import-phone:[&:is(#import-modal)]:supports-[height:100dvh]:[height:calc(100dvh_-_12px)] gb:cycle-import-ui:cycle-import-phone:[&.modal]:[width:calc(100vw_-_12px)] gb:cycle-import-ui:cycle-import-phone:[&.modal]:[height:calc(100vh_-_12px)]",
    "gb:cycle-import-ui:cycle-import-phone:[&.modal]:[max-height:none] gb:cycle-import-ui:cycle-import-phone:[&.modal]:[padding:0] gb:cycle-import-ui:cycle-import-phone:[&.modal]:supports-[height:100dvh]:[height:calc(100dvh_-_12px)]",
  ].join(' '),
  "import-preview-head": [
    "gb:cycle-import-ui:[&:is(div)]:[background:color-mix(in_srgb,_var(--bg-secondary)_96%,_var(--bg-card))]",
  ].join(' '),
  "import-review-body": [
    "gb:cycle-import-ui:[padding:20px_24px_18px] gb:cycle-import-ui:[overflow:visible] gb:cycle-import-ui:[&.gb-form-body]:[padding:20px_24px_18px]",
    "gb:cycle-import-ui:cycle-import-phone:[padding:14px_12px] gb:cycle-import-ui:cycle-import-phone:[&.gb-form-body]:[padding:14px_12px]",
  ].join(' '),
  "import-review-summary": [
    "gb:cycle-import-ui:[display:grid] gb:cycle-import-ui:[grid-template-columns:minmax(0,_1.3fr)_minmax(150px,_.7fr)] gb:cycle-import-ui:[gap:10px_14px]",
    "gb:cycle-import-ui:[padding:14px] gb:cycle-import-ui:[border:1px_solid_var(--border)] gb:cycle-import-ui:[border-radius:var(--radius-sm)]",
    "gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--bg-card)_70%,_transparent)] gb:cycle-import-ui:cycle-import-phone:[grid-template-columns:minmax(0,_1fr)] gb:cycle-import-ui:cycle-import-phone:[padding:11px]",
  ].join(' '),
  "import-review-file": [
    "gb:cycle-import-ui:[min-width:0] gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-direction:column]",
    "gb:cycle-import-ui:[gap:3px] gb:cycle-import-ui:[&_strong]:[min-width:0] gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)]",
    "gb:cycle-import-ui:[&_strong]:[font-size:13px] gb:cycle-import-ui:[&_strong]:[overflow-wrap:anywhere]",
  ].join(' '),
  "import-review-label": [
    "gb:cycle-import-ui:[color:var(--text-muted)] gb:cycle-import-ui:[font-family:var(--font-mono)] gb:cycle-import-ui:[font-size:10px]",
    "gb:cycle-import-ui:[font-weight:800] gb:cycle-import-ui:[text-transform:uppercase]",
  ].join(' '),
  "import-review-stats": [
    "gb:cycle-import-ui:[grid-column:1_/_-1] gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-wrap:wrap]",
    "gb:cycle-import-ui:[gap:7px] gb:cycle-import-ui:cycle-import-phone:[gap:6px]",
  ].join(' '),
  "import-review-stat": [
    "gb:cycle-import-ui:[display:inline-flex] gb:cycle-import-ui:[align-items:center] gb:cycle-import-ui:[gap:5px]",
    "gb:cycle-import-ui:[min-height:24px] gb:cycle-import-ui:[padding:3px_9px] gb:cycle-import-ui:[border:1px_solid_var(--border)]",
    "gb:cycle-import-ui:[border-radius:999px] gb:cycle-import-ui:[background:var(--bg-secondary)] gb:cycle-import-ui:[color:var(--text-secondary)]",
    "gb:cycle-import-ui:[font-size:12px] gb:cycle-import-ui:cycle-import-phone:[flex:1_1_calc(33.333%_-_6px)] gb:cycle-import-ui:cycle-import-phone:[justify-content:center]",
    "gb:cycle-import-ui:cycle-import-phone:[min-width:92px] gb:cycle-import-ui:cycle-import-phone:[.cycle-import-preview-modal_&]:[flex-basis:calc(50%_-_6px)] gb:cycle-import-ui:cycle-import-phone:[.cycle-import-preview-modal_&]:[min-width:130px]",
  ].join(' '),
  "import-review-stat-neutral": [
    "gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)]",
  ].join(' '),
  "import-review-stat-matched": [
    "gb:cycle-import-ui:[&_strong]:[color:var(--green)]",
  ].join(' '),
  "import-review-stat-new": [
    "gb:cycle-import-ui:[&_strong]:[color:var(--accent)]",
  ].join(' '),
  "import-review-stat-unmatched": [
    "gb:cycle-import-ui:[&_strong]:[color:var(--yellow)]",
  ].join(' '),
  "import-review-warning": [
    "gb:cycle-import-ui:[margin-top:12px] gb:cycle-import-ui:[padding:12px] gb:cycle-import-ui:[border:1px_solid_var(--yellow)]",
    "gb:cycle-import-ui:[border-radius:var(--radius-sm)] gb:cycle-import-ui:[background:var(--yellow-bg)] gb:cycle-import-ui:[color:var(--yellow)]",
    "gb:cycle-import-ui:[font-size:13px] gb:cycle-import-ui:[line-height:1.5]",
  ].join(' '),
  "import-table-wrap": [
    "gb:cycle-import-ui:[overflow-x:auto] gb:cycle-import-ui:[border:1px_solid_var(--border)] gb:cycle-import-ui:[border-radius:var(--radius-sm)]",
    "gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--bg-card)_62%,_transparent)] gb:cycle-import-ui:[-webkit-overflow-scrolling:touch] gb:cycle-import-ui:[margin-top:8px]",
    "gb:cycle-import-ui:cycle-import-phone:[overflow:visible] gb:cycle-import-ui:cycle-import-phone:[border:0] gb:cycle-import-ui:cycle-import-phone:[background:transparent]",
  ].join(' '),
  "cycle-import-conflicts": [
    "gb:cycle-import-ui:[display:grid] gb:cycle-import-ui:[grid-template-columns:repeat(2,_minmax(0,_1fr))] gb:cycle-import-ui:[gap:10px]",
    "gb:cycle-import-ui:[margin-top:14px] gb:cycle-import-ui:cycle-import-phone:[grid-template-columns:minmax(0,_1fr)] gb:cycle-import-ui:cycle-import-phone:[gap:8px]",
  ].join(' '),
  "cycle-import-conflict-warning": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-direction:column] gb:cycle-import-ui:[gap:2px]",
    "gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)]",
  ].join(' '),
  "cycle-import-table-heading": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[align-items:baseline] gb:cycle-import-ui:[justify-content:space-between]",
    "gb:cycle-import-ui:[gap:12px] gb:cycle-import-ui:[margin-top:16px] gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)]",
    "gb:cycle-import-ui:[&_strong]:[font-size:13px] gb:cycle-import-ui:[&_strong]:[font-weight:800] gb:cycle-import-ui:[&_span]:[color:var(--text-muted)]",
    "gb:cycle-import-ui:[&_span]:[font-size:12px] gb:cycle-import-ui:[&_span]:[text-align:right] gb:cycle-import-ui:cycle-import-phone:[align-items:flex-start]",
    "gb:cycle-import-ui:cycle-import-phone:[flex-direction:column] gb:cycle-import-ui:cycle-import-phone:[gap:3px] gb:cycle-import-ui:cycle-import-phone:[&_span]:[text-align:left]",
  ].join(' '),
  "cycle-import-status-heading": [
    "gb:cycle-import-ui:[width:118px]",
  ].join(' '),
  "cycle-import-status-cell": [
    "gb:cycle-import-ui:[width:118px]",
  ].join(' '),
  "cycle-import-row-status": [
    "gb:cycle-import-ui:[display:inline-flex] gb:cycle-import-ui:[align-items:center] gb:cycle-import-ui:[min-height:22px]",
    "gb:cycle-import-ui:[padding:2px_7px] gb:cycle-import-ui:[border-width:1px] gb:cycle-import-ui:[border-style:solid] gb:cycle-import-ui:[border-radius:999px]",
    "gb:cycle-import-ui:[font-size:10px] gb:cycle-import-ui:[font-weight:800] gb:cycle-import-ui:[line-height:1.2]",
    "gb:cycle-import-ui:[white-space:nowrap]",
  ].join(' '),
  "cycle-import-row-status-ready": [
    "gb:cycle-import-ui:[border-color:color-mix(in_srgb,_var(--green)_28%,_var(--border))] gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--green)_9%,_transparent)] gb:cycle-import-ui:[color:var(--green)]",
  ].join(' '),
  "cycle-import-row-status-conflict": [
    "gb:cycle-import-ui:[border-color:color-mix(in_srgb,_var(--yellow)_36%,_var(--border))] gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--yellow)_10%,_transparent)] gb:cycle-import-ui:[color:var(--yellow)]",
  ].join(' '),
  "import-table": [
    "gb:cycle-import-ui:[&_tr[data-import-status=unmatched]]:[background:color-mix(in_srgb,_var(--yellow)_5%,_transparent)] gb:cycle-import-ui:[&_td]:[white-space:normal] gb:cycle-import-ui:[&_td]:[overflow-wrap:anywhere]",
    "gb:cycle-import-ui:[&_td]:[padding:8px_12px] gb:cycle-import-ui:[&_td]:[border-bottom:1px_solid_var(--border)] gb:cycle-import-ui:[width:100%]",
    "gb:cycle-import-ui:[border-collapse:collapse] gb:cycle-import-ui:[font-size:13px] gb:cycle-import-ui:[margin:0]",
    "gb:cycle-import-ui:[&_th]:[background:var(--bg-card)] gb:cycle-import-ui:[&_th]:[padding:8px_12px] gb:cycle-import-ui:[&_th]:[text-align:left]",
    "gb:cycle-import-ui:[&_th]:[font-size:11px] gb:cycle-import-ui:[&_th]:[text-transform:uppercase] gb:cycle-import-ui:[&_th]:[letter-spacing:0.5px]",
    "gb:cycle-import-ui:[&_th]:[color:var(--text-muted)] gb:cycle-import-ui:cycle-import-phone:[display:block] gb:cycle-import-ui:cycle-import-phone:[width:100%]",
    "gb:cycle-import-ui:cycle-import-phone:[box-sizing:border-box] gb:cycle-import-ui:cycle-import-phone:[&_tbody]:[display:block] gb:cycle-import-ui:cycle-import-phone:[&_tbody]:[width:100%]",
    "gb:cycle-import-ui:cycle-import-phone:[&_tbody]:[box-sizing:border-box] gb:cycle-import-ui:cycle-import-phone:[&_tr]:[display:block] gb:cycle-import-ui:cycle-import-phone:[&_tr]:[width:100%]",
    "gb:cycle-import-ui:cycle-import-phone:[&_tr]:[box-sizing:border-box] gb:cycle-import-ui:cycle-import-phone:[&_tr]:[position:relative] gb:cycle-import-ui:cycle-import-phone:[&_tr]:[margin-bottom:9px]",
    "gb:cycle-import-ui:cycle-import-phone:[&_tr]:[padding:13px_11px_11px] gb:cycle-import-ui:cycle-import-phone:[&_tr]:[border:1px_solid_var(--border)] gb:cycle-import-ui:cycle-import-phone:[&_tr:is(tr)]:[border-left-width:4px]",
    "gb:cycle-import-ui:cycle-import-phone:[&_tr]:[border-radius:var(--radius-sm)] gb:cycle-import-ui:cycle-import-phone:[&_tr]:[background:color-mix(in_srgb,_var(--bg-card)_72%,_transparent)] gb:cycle-import-ui:cycle-import-phone:[&_td]:[width:100%]",
    "gb:cycle-import-ui:cycle-import-phone:[&_td]:[box-sizing:border-box] gb:cycle-import-ui:cycle-import-phone:[&_td]:[display:grid] gb:cycle-import-ui:cycle-import-phone:[&_td]:[grid-template-columns:minmax(74px,_28%)_minmax(0,_1fr)]",
    "gb:cycle-import-ui:cycle-import-phone:[&_td]:[align-items:start] gb:cycle-import-ui:cycle-import-phone:[&_td]:[gap:8px] gb:cycle-import-ui:cycle-import-phone:[&_td]:[padding:5px_0]",
    "gb:cycle-import-ui:cycle-import-phone:[&_td]:[border-bottom:0] gb:cycle-import-ui:cycle-import-phone:[&_td]:[white-space:normal] gb:cycle-import-ui:cycle-import-phone:[&_thead]:[display:none]",
    "gb:cycle-import-ui:cycle-import-phone:[&_tr[data-import-status=matched]]:[border-left-color:var(--green)] gb:cycle-import-ui:cycle-import-phone:[&_tr[data-import-status=unmatched]]:[border-left-color:var(--yellow)] gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[content:attr(data-label)]",
    "gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[color:var(--text-muted)] gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[font-family:var(--font-mono)] gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[font-size:10px]",
    "gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[font-weight:800] gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[text-transform:uppercase] gb:cycle-import-ui:cycle-import-phone:[&_td::before]:[line-height:1.35]",
  ].join(' '),
  "cycle-import-privacy-note": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[align-items:flex-start] gb:cycle-import-ui:[gap:10px]",
    "gb:cycle-import-ui:[margin-top:12px] gb:cycle-import-ui:[padding:10px_12px] gb:cycle-import-ui:[border:1px_solid_var(--border)]",
    "gb:cycle-import-ui:[border-radius:var(--radius-sm)] gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--bg-card)_54%,_transparent)] gb:cycle-import-ui:[color:var(--text-secondary)]",
    "gb:cycle-import-ui:[&_>_span:last-child]:[display:flex] gb:cycle-import-ui:[&_>_span:last-child]:[min-width:0] gb:cycle-import-ui:[&_>_span:last-child]:[flex-direction:column]",
    "gb:cycle-import-ui:[&_>_span:last-child]:[gap:2px] gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)] gb:cycle-import-ui:[&_strong]:[font-size:12px]",
    "gb:cycle-import-ui:[&_small]:[color:var(--text-muted)] gb:cycle-import-ui:[&_small]:[font-size:11px] gb:cycle-import-ui:[&_small]:[line-height:1.4]",
  ].join(' '),
  "cycle-import-privacy-icon": [
    "gb:cycle-import-ui:[flex:0_0_auto] gb:cycle-import-ui:[font-size:14px] gb:cycle-import-ui:[line-height:1.4]",
  ].join(' '),
  "cycle-import-conflict-option": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[align-items:flex-start] gb:cycle-import-ui:[gap:9px]",
    "gb:cycle-import-ui:[min-width:0] gb:cycle-import-ui:[padding:12px] gb:cycle-import-ui:[border:1px_solid_var(--border)]",
    "gb:cycle-import-ui:[border-radius:var(--radius-sm)] gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--bg-card)_68%,_transparent)] gb:cycle-import-ui:[color:var(--text-secondary)]",
    "gb:cycle-import-ui:[cursor:pointer] gb:cycle-import-ui:[line-height:1.4] gb:cycle-import-ui:[&:has(input:checked)]:[border-color:color-mix(in_srgb,_var(--accent)_55%,_var(--border))]",
    "gb:cycle-import-ui:[&:has(input:checked)]:[background:color-mix(in_srgb,_var(--accent)_12%,_var(--bg-card))] gb:cycle-import-ui:[&_input]:[flex:0_0_auto] gb:cycle-import-ui:[&_input]:[width:17px]",
    "gb:cycle-import-ui:[&_input]:[height:17px] gb:cycle-import-ui:[&_input]:[margin:1px_0_0] gb:cycle-import-ui:[&_input]:[accent-color:var(--accent)]",
    "gb:cycle-import-ui:[&_span]:[display:flex] gb:cycle-import-ui:[&_span]:[flex-direction:column] gb:cycle-import-ui:[&_span]:[gap:3px]",
    "gb:cycle-import-ui:[&_span]:[min-width:0] gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)] gb:cycle-import-ui:[&_strong]:[font-size:12px]",
    "gb:cycle-import-ui:[&_small]:[color:var(--text-muted)] gb:cycle-import-ui:[&_small]:[font-size:11px] gb:cycle-import-ui:cycle-import-phone:[min-height:44px]",
    "gb:cycle-import-ui:cycle-import-phone:[padding:10px]",
  ].join(' '),
  "cycle-import-more": [
    "gb:cycle-import-ui:[margin-top:8px] gb:cycle-import-ui:[color:var(--text-muted)] gb:cycle-import-ui:[font-size:12px]",
  ].join(' '),
  "import-review-actions": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[justify-content:flex-end] gb:cycle-import-ui:[gap:10px]",
    "gb:cycle-import-ui:[padding:14px_24px] gb:cycle-import-ui:[border-top:1px_solid_var(--border)] gb:cycle-import-ui:[background:color-mix(in_srgb,_var(--bg-secondary)_96%,_var(--bg-card))]",
    "gb:cycle-import-ui:cycle-import-phone:[position:sticky] gb:cycle-import-ui:cycle-import-phone:[bottom:0] gb:cycle-import-ui:cycle-import-phone:[z-index:3]",
    "gb:cycle-import-ui:cycle-import-phone:[padding:12px] gb:cycle-import-ui:cycle-import-phone:[flex-wrap:wrap] gb:cycle-import-ui:cycle-import-phone:[box-shadow:0_-8px_18px_color-mix(in_srgb,_var(--bg-primary)_14%,_transparent)]",
    "gb:cycle-import-ui:cycle-import-phone:[&_.import-btn]:[flex:1_1_calc(50%_-_5px)] gb:cycle-import-ui:cycle-import-phone:[&_.import-btn]:[min-height:42px]",
  ].join(' '),
  "cycle-import-coverage": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-wrap:wrap] gb:cycle-import-ui:[gap:7px]",
    "gb:cycle-import-ui:[margin-bottom:12px] gb:cycle-import-ui:[&_span]:[min-height:24px] gb:cycle-import-ui:[&_span]:[display:inline-flex]",
    "gb:cycle-import-ui:[&_span]:[align-items:center] gb:cycle-import-ui:[&_span]:[border:1px_solid_var(--border)] gb:cycle-import-ui:[&_span]:[border-radius:999px]",
    "gb:cycle-import-ui:[&_span]:[background:var(--bg-secondary)] gb:cycle-import-ui:[&_span]:[color:var(--text-secondary)] gb:cycle-import-ui:[&_span]:[font-size:11px]",
    "gb:cycle-import-ui:[&_span]:[line-height:1.25] gb:cycle-import-ui:[&_span]:[padding:3px_9px]",
  ].join(' '),
  "cycle-mini-action": [
    "gb:cycle-import-ui:[min-height:24px] gb:cycle-import-ui:[display:inline-flex] gb:cycle-import-ui:[align-items:center]",
    "gb:cycle-import-ui:[border:1px_solid_var(--border)] gb:cycle-import-ui:[border-radius:999px] gb:cycle-import-ui:[background:var(--bg-secondary)]",
    "gb:cycle-import-ui:[color:var(--text-secondary)] gb:cycle-import-ui:[min-width:0] gb:cycle-import-ui:[padding:3px_8px]",
    "gb:cycle-import-ui:[cursor:pointer] gb:cycle-import-ui:[font-family:inherit] gb:cycle-import-ui:[font-style:inherit]",
    "gb:cycle-import-ui:[font-variant:inherit] gb:cycle-import-ui:[font-weight:700] gb:cycle-import-ui:[font-stretch:inherit]",
    "gb:cycle-import-ui:[font-size:inherit] gb:cycle-import-ui:[line-height:inherit] gb:cycle-import-ui:[&:hover]:[border-color:color-mix(in_srgb,_var(--red)_50%,_var(--border))]",
    "gb:cycle-import-ui:[&:hover]:[color:var(--red)] gb:cycle-import-ui:cycle-import-phone:[min-height:30px]",
  ].join(' '),
  "cycle-source-list": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-direction:column] gb:cycle-import-ui:[gap:8px]",
  ].join(' '),
  "cycle-source-row": [
    "gb:cycle-import-ui:[display:grid] gb:cycle-import-ui:[grid-template-columns:minmax(0,_1fr)_36px] gb:cycle-import-ui:[align-items:start]",
    "gb:cycle-import-ui:[gap:10px] gb:cycle-import-ui:[min-width:0] gb:cycle-import-ui:[padding:10px]",
    "gb:cycle-import-ui:[border:1px_solid_var(--border)] gb:cycle-import-ui:[border-radius:var(--radius-sm)] gb:cycle-import-ui:[background:var(--bg-secondary)]",
    "gb:cycle-import-ui:cycle-import-phone:[grid-template-columns:minmax(0,_1fr)_40px]",
  ].join(' '),
  "cycle-source-main": [
    "gb:cycle-import-ui:[min-width:0] gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-direction:column]",
    "gb:cycle-import-ui:[gap:4px] gb:cycle-import-ui:[&_strong]:[color:var(--text-primary)] gb:cycle-import-ui:[&_strong]:[font-size:13px]",
    "gb:cycle-import-ui:[&_span]:[color:var(--text-muted)] gb:cycle-import-ui:[&_span]:[font-size:12px] gb:cycle-import-ui:[&_span]:[line-height:1.4]",
  ].join(' '),
  "cycle-import-batches": [
    "gb:cycle-import-ui:[display:flex] gb:cycle-import-ui:[flex-wrap:wrap] gb:cycle-import-ui:[gap:6px]",
    "gb:cycle-import-ui:[margin-top:3px]",
  ].join(' '),
};

export function cycleImportClasses(names: string): string {
  return names.split(/\s+/).map(name => {
    const shared = cycleSharedUtilities(name);
    return `${name} ${classes[name] || ''}${shared ? ' ' + shared : ''}`;
  }).join(' ');
}
