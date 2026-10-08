// Cards own their presentation; lens grid offsets remain with the shared page shell.
const styles = (...rules: string[]): string => rules.join(' ');

const classes: Record<string, string> = {
  'biology-score-compact': styles(
    "gb:biology-card:[min-width:0] gb:biology-card:[display:block] gb:biology-card:[gap:12px]",
    "gb:biology-card:[border:1px_solid_var(--border)] gb:biology-card:[border-radius:12px] gb:biology-card:[padding:0]",
    "gb:biology-card:[margin:0] gb:biology-card:[background:var(--bg-card,var(--bg))] gb:biology-card:[box-shadow:var(--shadow)]",
    "gb:biology-card:[overflow:hidden] gb:biology-card:[.biology-score-lens-row_>&[open]]:[overflow:visible] gb:biology-card:[.biology-score-lens-row_>&[open]]:[background:transparent]",
    "gb:biology-card:[.biology-score-lens-row_>&[open]]:[border-color:transparent] gb:biology-card:[.biology-score-unavailable-group_&]:[box-shadow:none] gb:biology-card:[.biology-score-unavailable-group_&+.biology-score-detail]:[margin-top:16px]",
  ),
  'biology-score-summary': styles(
    "gb:biology-card:[display:grid] gb:biology-card:[grid-template-columns:100px_minmax(0,1fr)] gb:biology-card:[grid-template-rows:48px_100px_auto_minmax(36px,1fr)]",
    "gb:biology-card:[gap:12px_16px] gb:biology-card:[align-items:center] gb:biology-card:[align-content:start]",
    "gb:biology-card:[padding:22px] gb:biology-card:[min-height:230px] gb:biology-card:[height:var(--biology-summary-height,auto)]",
    "gb:biology-card:[box-sizing:border-box] gb:biology-card:[color:var(--text-primary)] gb:biology-card:[margin:0]",
    "gb:biology-card:[font-size:12px] gb:biology-card:[line-height:1.45] gb:biology-card:[cursor:pointer]",
    "gb:biology-card:[list-style:none] gb:biology-card:card-phone:[padding:18px] gb:biology-card:card-phone:[min-height:0]",
    "gb:biology-card:[.biology-score-lens-row_>.biology-score-compact[open]>&]:[background:var(--bg-card)] gb:biology-card:[.biology-score-lens-row_>.biology-score-compact[open]>&]:[border-radius:12px] gb:biology-card:[.biology-score-lens-row_>.biology-score-compact[open]>&]:[outline:1px_solid_var(--accent)]",
    "gb:biology-card:[&:has(.biology-score-scope)]:[grid-template-rows:minmax(48px,auto)_100px_auto_minmax(36px,1fr)] gb:biology-card:[&:has(.biology-score-details-label:focus-visible)]:[outline:2px_solid_var(--accent)] gb:biology-card:[&:has(.biology-score-details-label:focus-visible)]:[outline-offset:-2px]",
  ),
  'biology-score-title': styles(
    "gb:biology-card:[grid-column:1_/_-1] gb:biology-card:[color:var(--text-primary)] gb:biology-card:[font-size:18px]",
    "gb:biology-card:[line-height:1.35] gb:biology-card:[font-weight:650] gb:biology-card:[align-self:start]",
    "gb:biology-card:[display:-webkit-box] gb:biology-card:[-webkit-line-clamp:2] gb:biology-card:[-webkit-box-orient:vertical]",
    "gb:biology-card:[overflow:hidden] gb:biology-card:[&:has(.biology-score-scope)]:[display:block] gb:biology-card:[&:has(.biology-score-scope)]:[overflow:visible]",
  ),
  'biology-score-scope': styles(
    "gb:biology-card:[display:block] gb:biology-card:[margin-top:4px] gb:biology-card:[font-size:12px]",
    "gb:biology-card:[line-height:1.4] gb:biology-card:[color:var(--text-secondary)] gb:biology-card:[font-weight:400]",
  ),
  'biology-score-dial': styles(
    "gb:biology-card:[position:relative] gb:biology-card:[display:inline-grid] gb:biology-card:[place-items:center]",
    "gb:biology-card:[width:100px] gb:biology-card:[height:100px] gb:biology-card:[flex-shrink:0]",
    "gb:biology-card:[border-radius:50%] gb:biology-card:[background:conic-gradient(var(--score-color)_calc(var(--score-value)_*_1%),color-mix(in_srgb,var(--text-muted)_18%,transparent)_0)] gb:biology-card:before:[content:'']",
    "gb:biology-card:before:[position:absolute] gb:biology-card:before:[inset:6px] gb:biology-card:before:[border-radius:50%]",
    "gb:biology-card:before:[background:var(--bg-card)] gb:biology-card:[.biology-coherence-overview_&]:[width:122px] gb:biology-card:[.biology-coherence-overview_&]:[height:122px]",
    "gb:biology-card:card-phone:[.biology-coherence-overview_&]:[width:100px] gb:biology-card:card-phone:[.biology-coherence-overview_&]:[height:100px] gb:biology-card:card-container:[.biology-coherence-overview_&]:[width:100px]",
    "gb:biology-card:card-container:[.biology-coherence-overview_&]:[height:100px]",
  ),
  'biology-score-dial-number': styles(
    "gb:biology-card:[z-index:1] gb:biology-card:[color:var(--text-primary)] gb:biology-card:[font-size:36px]",
    "gb:biology-card:[font-weight:700] gb:biology-card:[line-height:1] gb:biology-card:[text-align:center]",
    "gb:biology-card:[font-variant-numeric:tabular-nums] gb:biology-card:[.biology-coherence-overview_&]:[font-size:44px] gb:biology-card:[.biology-score-dial-zero_&]:[color:var(--score-color)]",
  ),
  'biology-dial-unit': styles(
    "gb:biology-card:[display:block] gb:biology-card:[margin-top:5px] gb:biology-card:[font-size:12px]",
    "gb:biology-card:[font-weight:400] gb:biology-card:[color:var(--text-secondary)]",
  ),
  'biology-score-dial-zero': styles(
    "gb:biology-card:[outline:1px_solid_var(--score-color)] gb:biology-card:[outline-offset:2px]",
  ),
  'biology-score-summary-copy': styles(
    "gb:biology-card:[display:grid] gb:biology-card:[gap:7px] gb:biology-card:[flex:1]",
    "gb:biology-card:[min-width:0]",
  ),
  'biology-card-status': styles(
    "gb:biology-card:[font-size:14px] gb:biology-card:[color:var(--text-primary)]",
  ),
  'biology-card-sentence': styles(
    "gb:biology-card:[font-size:13px] gb:biology-card:[line-height:1.5] gb:biology-card:[color:var(--text-secondary)]",
    "gb:biology-card:[overflow-wrap:anywhere]",
  ),
  'biology-score-summary-footer': styles(
    "gb:biology-card:[grid-column:1_/_-1] gb:biology-card:[display:flex] gb:biology-card:[justify-content:space-between]",
    "gb:biology-card:[gap:12px] gb:biology-card:[align-items:center] gb:biology-card:[align-self:end]",
    "gb:biology-card:[padding-top:12px] gb:biology-card:[border-top:1px_solid_var(--border)]",
  ),
  'biology-score-footer-meta': styles(
    "gb:biology-card:[display:grid] gb:biology-card:[gap:6px] gb:biology-card:[min-width:0]",
  ),
  'biology-card-membership': styles(
    "gb:biology-card:[font-size:11px] gb:biology-card:[line-height:1.5] gb:biology-card:[color:var(--text-secondary)]",
    "gb:biology-card:data-[overview-membership=included]:[color:var(--accent)] gb:biology-card:data-[overview-membership=excluded]:[padding:2px_6px] gb:biology-card:data-[overview-membership=excluded]:[border:1px_solid_var(--border)]",
    "gb:biology-card:data-[overview-membership=excluded]:[border-radius:4px] gb:biology-card:data-[overview-membership=excluded]:[background:var(--bg-secondary)]",
  ),
  'biology-card-coverage': styles(
    "gb:biology-card:[font-size:12px] gb:biology-card:[color:var(--text-secondary)]",
  ),
  'biology-score-details-label': styles(
    "gb:biology-card:[font-size:13px] gb:biology-card:[color:var(--accent)] gb:biology-card:[white-space:nowrap]",
    "gb:biology-card:[border:0] gb:biology-card:[background:transparent] gb:biology-card:[padding:8px_0_8px_8px]",
    "gb:biology-card:[font-family:inherit] gb:biology-card:[cursor:pointer] gb:biology-card:focus-visible:[outline:2px_solid_var(--accent)]",
    "gb:biology-card:focus-visible:[outline-offset:3px]",
  ),
  'biology-details-arrow': styles(
    "gb:biology-card:[display:inline-block] gb:biology-card:[.biology-score-compact[open]_&]:[transform:rotate(180deg)]",
  ),
  'biology-score-expanded': styles(
    "gb:biology-card:[display:none] gb:biology-card:[min-width:0] gb:biology-card:[max-width:100%]",
    "gb:biology-card:[padding:0_20px_20px] gb:biology-card:[border-top:1px_solid_var(--border)] gb:biology-card:[.biology-score-compact[open]>&]:[display:block]",
    "gb:biology-card:card-narrow:[padding:0_12px_16px] gb:biology-card:[.biology-score-lens-row_&]:[width:calc(100cqw_-_2px)] gb:biology-card:[.biology-score-lens-row_&]:[max-width:none]",
    "gb:biology-card:[.biology-score-lens-row_&]:[box-sizing:border-box] gb:biology-card:[.biology-score-lens-row_&]:[margin-left:var(--biology-panel-offset)] gb:biology-card:[.biology-score-lens-row_&]:[margin-top:16px]",
    "gb:biology-card:[.biology-score-lens-row_&]:[padding:24px] gb:biology-card:[.biology-score-lens-row_&]:[border:1px_solid_var(--border)] gb:biology-card:[.biology-score-lens-row_&]:[border-radius:12px]",
    "gb:biology-card:[.biology-score-lens-row_&]:[background:var(--bg-card)] gb:biology-card:card-phone:[.biology-score-lens-row_&]:[padding:16px]",
  ),
  'biology-score-detail-tools': styles(
    "gb:biology-card:[display:flex] gb:biology-card:[justify-content:flex-end] gb:biology-card:[flex-wrap:wrap]",
    "gb:biology-card:[gap:8px] gb:biology-card:[float:right] gb:biology-card:[margin:0_0_12px_16px]",
    "gb:biology-card:card-phone:[float:none] gb:biology-card:card-phone:[margin:0_0_16px] gb:biology-card:card-phone:[justify-content:flex-start]",
  ),
  'biology-score-history-note': styles(
    "gb:biology-card:[font-size:14px] gb:biology-card:[line-height:1.6] gb:biology-card:[color:var(--text-secondary)]",
    "gb:biology-card:[padding:12px_16px] gb:biology-card:[border-left:3px_solid_var(--yellow)] gb:biology-card:[background:color-mix(in_srgb,var(--yellow)_6%,transparent)]",
    "gb:biology-card:[border-radius:6px] gb:biology-card:[clear:both]",
  ),
  'biology-score-detail-heading': styles(
    "gb:biology-card:[margin-bottom:20px]",
  ),
  'biology-card-heading': styles(
    "gb:biology-card:[margin:0] gb:biology-card:[font-size:20px] gb:biology-card:[color:var(--text-primary)]",
  ),
  'biology-card-boundary': styles(
    "gb:biology-card:[margin:6px_0_20px] gb:biology-card:[color:var(--text-secondary)] gb:biology-card:[font-size:14px]",
  ),
  'biology-score-ai-details': styles(
    "gb:biology-card:[clear:both] gb:biology-card:[margin:16px_0] gb:biology-card:[font-size:14px]",
    "gb:biology-card:[line-height:1.6]",
  ),
};
export function biologyCardClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
