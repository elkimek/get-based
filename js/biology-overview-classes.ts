// Owns overview-specific layout. Shared dashboard typography and themes retain their owner.
const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string, string> = {
  'biology-coherence-hero': styles(
    "gb:biology-overview:[position:relative] gb:biology-overview:[min-width:0] gb:biology-overview:[display:grid]",
    "gb:biology-overview:[align-items:start] gb:biology-overview:[border:1px_solid_color-mix(in_srgb,var(--accent)_34%,var(--border))] gb:biology-overview:[border-radius:calc(var(--radius)_+_4px)]",
    "gb:biology-overview:[background:radial-gradient(circle_at_12%_0%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_34%),linear-gradient(135deg,color-mix(in_srgb,var(--bg-card)_94%,var(--accent)_6%),color-mix(in_srgb,var(--bg-secondary)_86%,transparent))] gb:biology-overview:[box-shadow:var(--shadow),0_0_0_1px_color-mix(in_srgb,var(--accent)_8%,transparent)_inset] gb:biology-overview:[overflow:hidden]",
    "gb:biology-overview:after:[content:''] gb:biology-overview:after:[position:absolute] gb:biology-overview:after:[inset:0]",
    "gb:biology-overview:after:[pointer-events:none] gb:biology-overview:after:[background:linear-gradient(120deg,transparent_0_55%,color-mix(in_srgb,var(--accent)_9%,transparent)_76%,transparent_100%)]",
  ),
  'biology-coherence-visual': styles(
    "gb:biology-overview:[grid-template-columns:minmax(280px,.9fr)_minmax(0,1.5fr)] gb:biology-overview:[gap:20px_36px] gb:biology-overview:[padding:26px]",
    "gb:biology-overview:[margin:20px_0] gb:biology-overview:overview-wide:[grid-template-columns:1fr] gb:biology-overview:overview-container:[grid-template-columns:minmax(0,1fr)]",
    "gb:biology-overview:overview-phone:[padding:18px]",
  ),
  'biology-coherence-overview': styles(
    "gb:biology-overview:[display:flex] gb:biology-overview:[gap:24px] gb:biology-overview:[align-items:center]",
    "gb:biology-overview:[grid-column:1] gb:biology-overview:[grid-row:1] gb:biology-overview:overview-wide:[grid-row:auto]",
    "gb:biology-overview:overview-container:[grid-row:auto] gb:biology-overview:overview-phone:[gap:16px] gb:biology-overview:overview-container-phone:[gap:16px]",
  ),
  'biology-coherence-title': styles(
    "gb:biology-overview:[font-size:23px] gb:biology-overview:[margin:0_0_10px] gb:biology-overview:[color:var(--text-primary)]",
    "gb:biology-overview:overview-phone:[font-size:20px] gb:biology-overview:overview-container-phone:[font-size:20px]",
  ),
  'biology-coherence-explanation': styles(
    "gb:biology-overview:[font-size:14px] gb:biology-overview:[margin:0_0_8px] gb:biology-overview:[color:var(--text-secondary)]",
  ),
  'biology-coherence-coverage': styles(
    "gb:biology-overview:[font-size:12px] gb:biology-overview:[color:var(--text-secondary)]",
  ),
  'biology-coherence-ai': styles(
    "gb:biology-overview:[grid-column:1] gb:biology-overview:[grid-row:2] gb:biology-overview:[align-self:start]",
    "gb:biology-overview:overview-wide:[grid-row:auto] gb:biology-overview:overview-container:[grid-row:auto]",
  ),
  'biology-scores-note': styles(
    "gb:biology-overview:[margin:0] gb:biology-overview:[color:var(--text-muted)] gb:biology-overview:[font-size:12px]",
    "gb:biology-overview:[line-height:1.45]",
  ),
  'biology-coherence-domains': styles(
    "gb:biology-overview:[position:relative] gb:biology-overview:[z-index:1] gb:biology-overview:[grid-column:2]",
    "gb:biology-overview:[grid-row:1_/_3] gb:biology-overview:[display:grid] gb:biology-overview:[grid-template-columns:repeat(2,minmax(0,1fr))]",
    "gb:biology-overview:[gap:8px_18px] gb:biology-overview:[margin:0] gb:biology-overview:overview-wide:[grid-column:1]",
    "gb:biology-overview:overview-wide:[grid-row:auto] gb:biology-overview:overview-container:[grid-column:1] gb:biology-overview:overview-container:[grid-row:auto]",
    "gb:biology-overview:overview-small:before:[content:'Baseline_domains'] gb:biology-overview:overview-small:before:[grid-column:1_/_-1] gb:biology-overview:overview-small:before:[color:var(--text-muted)]",
    "gb:biology-overview:overview-small:before:[font-family:var(--font-mono)] gb:biology-overview:overview-small:before:[font-size:10px] gb:biology-overview:overview-small:before:[font-weight:800]",
    "gb:biology-overview:overview-small:before:[letter-spacing:.07em] gb:biology-overview:overview-small:before:[text-transform:uppercase]",
  ),
  'biology-coherence-domain-row': styles(
    "gb:biology-overview:[display:grid] gb:biology-overview:[grid-template-columns:1fr_32px] gb:biology-overview:[gap:5px_8px]",
    "gb:biology-overview:[min-width:0] gb:biology-overview:[padding:5px_0] gb:biology-overview:[background:none]",
    "gb:biology-overview:[border:0] gb:biology-overview:[text-align:left] gb:biology-overview:[color:var(--text-secondary)]",
    "gb:biology-overview:[cursor:pointer] gb:biology-overview:[font-family:inherit] gb:biology-overview:[font-style:inherit]",
    "gb:biology-overview:[font-weight:inherit] gb:biology-overview:[font-variant:inherit] gb:biology-overview:[font-stretch:inherit]",
    "gb:biology-overview:[line-height:inherit] gb:biology-overview:[font-size:12px] gb:biology-overview:[align-items:center]",
    "gb:biology-overview:[justify-content:space-between] gb:biology-overview:[transition:background_.12s,border-color_.12s,color_.12s] gb:biology-overview:hover:[background:color-mix(in_srgb,var(--accent)_12%,var(--bg-card))]",
    "gb:biology-overview:hover:[border-color:color-mix(in_srgb,var(--accent)_70%,var(--border))] gb:biology-overview:hover:[color:var(--text-primary)] gb:biology-overview:hover:[outline:none]",
    "gb:biology-overview:focus-visible:[background:color-mix(in_srgb,var(--accent)_12%,var(--bg-card))] gb:biology-overview:focus-visible:[border-color:color-mix(in_srgb,var(--accent)_70%,var(--border))] gb:biology-overview:focus-visible:[color:var(--text-primary)]",
    "gb:biology-overview:focus-visible:[outline:2px_solid_var(--accent)] gb:biology-overview:focus-visible:[outline-offset:4px] gb:biology-overview:focus-visible:[border-radius:4px]",
    "gb:biology-overview:device-coarse:[min-height:44px]",
  ),
  'biology-domain-label': styles(
    "gb:biology-overview:[text-overflow:ellipsis] gb:biology-overview:[white-space:normal] gb:biology-overview:[overflow:visible]",
  ),
  'biology-domain-meter': styles(
    "gb:biology-overview:[height:4px] gb:biology-overview:[border-radius:4px] gb:biology-overview:[background:color-mix(in_srgb,var(--text-muted)_18%,transparent)]",
    "gb:biology-overview:[overflow:hidden] gb:biology-overview:[text-overflow:ellipsis] gb:biology-overview:[white-space:nowrap]",
  ),
  'biology-domain-fill': styles(
    "gb:biology-overview:[display:block] gb:biology-overview:[height:100%] gb:biology-overview:[background:var(--score-color,var(--accent))]",
    "gb:biology-overview:[border-radius:inherit]",
  ),
  'biology-domain-value': styles(
    "gb:biology-overview:[grid-column:2] gb:biology-overview:[grid-row:1_/_3] gb:biology-overview:[align-self:center]",
    "gb:biology-overview:[font-size:16px] gb:biology-overview:[color:var(--score-color,var(--text-primary))] gb:biology-overview:[text-align:right]",
    "gb:biology-overview:[font-weight:800]",
  ),
  'biology-coherence-interpretation': styles(
    "gb:biology-overview:[grid-column:1_/_-1] gb:biology-overview:[border-top:1px_solid_var(--border)] gb:biology-overview:[padding-top:6px]",
    "gb:biology-overview:[&>summary]:[padding:8px_0]",
  ),
  'biology-coherence-breakdown': styles(
    "gb:biology-overview:[grid-column:1_/_-1] gb:biology-overview:[border-top:1px_solid_var(--border)] gb:biology-overview:[padding-top:6px]",
    "gb:biology-overview:[&>summary]:[padding:8px_0]",
  ),
  'biology-overview-disclosure': styles(
    "gb:biology-overview:[cursor:pointer] gb:biology-overview:[font-size:14px] gb:biology-overview:[font-weight:500]",
    "gb:biology-overview:[padding:8px_0]",
  ),
  'biology-overview-membership': styles(
    "gb:biology-overview:[grid-column:1_/_-1]",
  ),
  'biology-reading-panel': styles(
    "gb:biology-overview:[border:1px_solid_var(--border)] gb:biology-overview:[border-radius:8px] gb:biology-overview:[background:var(--bg-secondary)]",
  ),
  'biology-overview-membership-heading': styles(
    "gb:biology-overview:[padding:16px] gb:biology-overview:[color:var(--text-primary)] gb:biology-overview:[font-size:15px]",
    "gb:biology-overview:[font-weight:600] gb:biology-overview:[.biology-overview-membership[open]>&]:[border-bottom:1px_solid_var(--border)]",
  ),
  'biology-reading-body': styles(
    "gb:biology-overview:[padding:20px] gb:biology-overview:[color:var(--text-secondary)] gb:biology-overview:[font-size:14px]",
    "gb:biology-overview:[line-height:1.65] gb:biology-overview:overview-phone:[padding:16px]",
  ),
  'biology-overview-membership-lead': styles(
    "gb:biology-overview:[max-width:80ch] gb:biology-overview:[margin:0_0_16px] gb:biology-overview:[overflow-wrap:anywhere]",
  ),
  'biology-membership-count': styles(
    "gb:biology-overview:[margin-left:8px] gb:biology-overview:[font-size:12px] gb:biology-overview:[font-weight:400]",
    "gb:biology-overview:[color:var(--text-secondary)] gb:biology-overview:[white-space:nowrap]",
  ),
  'biology-membership-list': styles(
    "gb:biology-overview:[display:grid] gb:biology-overview:[gap:0]",
  ),
  'biology-contributor-button': styles(
    "gb:biology-overview:[display:flex] gb:biology-overview:[justify-content:space-between] gb:biology-overview:[align-items:center]",
    "gb:biology-overview:[gap:16px] gb:biology-overview:[padding:12px_0] gb:biology-overview:[border-top:0]",
    "gb:biology-overview:[border-left:0] gb:biology-overview:[border-right:0] gb:biology-overview:[border-bottom:1px_solid_var(--border)]",
    "gb:biology-overview:[background:none] gb:biology-overview:[color:var(--text-primary)] gb:biology-overview:[font-family:inherit]",
    "gb:biology-overview:[font-style:inherit] gb:biology-overview:[font-weight:inherit] gb:biology-overview:[font-variant:inherit]",
    "gb:biology-overview:[font-stretch:inherit] gb:biology-overview:[line-height:inherit] gb:biology-overview:[font-size:13px]",
    "gb:biology-overview:[text-align:left] gb:biology-overview:[cursor:pointer] gb:biology-overview:focus-visible:[outline:2px_solid_var(--accent)]",
    "gb:biology-overview:focus-visible:[outline-offset:2px] gb:biology-overview:overview-narrow:[align-items:flex-start] gb:biology-overview:overview-narrow:[gap:8px]",
  ),
  'biology-contributor-shared': styles(
    "gb:biology-overview:[display:block] gb:biology-overview:[margin-top:3px] gb:biology-overview:[font-size:11px]",
    "gb:biology-overview:[color:var(--text-secondary)]",
  ),
  'biology-membership-badge': styles(
    "gb:biology-overview:[font-size:11px] gb:biology-overview:[line-height:1.5] gb:biology-overview:[color:var(--text-secondary)]",
    "gb:biology-overview:[text-align:right] gb:biology-overview:[flex-shrink:0] gb:biology-overview:data-[overview-membership=included]:[color:var(--accent)]",
    "gb:biology-overview:data-[overview-membership=excluded]:[padding:2px_6px] gb:biology-overview:data-[overview-membership=excluded]:[border:1px_solid_var(--border)] gb:biology-overview:data-[overview-membership=excluded]:[border-radius:4px]",
    "gb:biology-overview:data-[overview-membership=excluded]:[background:var(--bg-secondary)] gb:biology-overview:overview-narrow:[flex-shrink:1] gb:biology-overview:overview-narrow:[max-width:45%]",
  ),
  'biology-reading-source': styles(
    "gb:biology-overview:[display:flex] gb:biology-overview:[flex-wrap:wrap] gb:biology-overview:[align-items:center]",
    "gb:biology-overview:[gap:12px] gb:biology-overview:[padding-top:12px] gb:biology-overview:[border-top:1px_solid_var(--border)]",
    "gb:biology-overview:[font-size:13px]",
  ),
  'biology-dashboard-unit': styles(
    "gb:biology-overview:[display:block] gb:biology-overview:[margin-top:5px] gb:biology-overview:[font:12px_var(--font-mono)]",
    "gb:biology-overview:[color:var(--text-secondary)] gb:biology-overview:[letter-spacing:0]",
  ),
  'biology-dashboard-detail': styles(
    "gb:biology-overview:[.db-hero-biology-score_&]:[color:var(--text-secondary)]",
  ),
  'db-hero-bio-bar-track': styles(
    "gb:biology-overview:[position:relative] gb:biology-overview:[overflow:visible] gb:biology-overview:[background:var(--bg-hover)]",
  ),
  'db-hero-bio-bar-fill': styles(
    "gb:biology-overview:[height:100%] gb:biology-overview:[border-radius:inherit] gb:biology-overview:[opacity:.9]",
    "gb:biology-overview:[transition:width_.2s_ease]",
  ),
  'db-hero-bio-bar-pin': styles(
    "gb:biology-overview:[position:absolute] gb:biology-overview:[top:50%] gb:biology-overview:[width:6px]",
    "gb:biology-overview:[height:16px] gb:biology-overview:[transform:translate(-50%,-50%)] gb:biology-overview:[border-radius:999px]",
    "gb:biology-overview:[background:var(--text-primary)] gb:biology-overview:[box-shadow:0_0_0_2px_var(--bg-card),0_1px_3px_rgba(0,0,0,.25)]",
  ),
  'db-bio-coherence-hero': styles(
    "gb:biology-overview:[min-width:0] gb:biology-overview:[display:grid] gb:biology-overview:[gap:16px]",
    "gb:biology-overview:[padding:24px] gb:biology-overview:[border:1px_solid_color-mix(in_srgb,var(--accent)_30%,var(--border))] gb:biology-overview:[border-radius:calc(var(--radius)_+_6px)]",
    "gb:biology-overview:[background:radial-gradient(circle_at_12%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_36%),linear-gradient(135deg,color-mix(in_srgb,var(--bg-card)_92%,var(--accent)_8%),color-mix(in_srgb,var(--bg-secondary)_88%,transparent))] gb:biology-overview:[box-shadow:var(--shadow),0_0_0_1px_color-mix(in_srgb,var(--accent)_8%,transparent)_inset] gb:biology-overview:[overflow:hidden]",
    "gb:biology-overview:overview-small:[gap:12px] gb:biology-overview:overview-small:[padding:18px] gb:biology-overview:[.dashboard-widget_&]:[padding:0]",
    "gb:biology-overview:[.dashboard-widget_&]:[border:0] gb:biology-overview:[.dashboard-widget_&]:[border-radius:0] gb:biology-overview:[.dashboard-widget_&]:[background:none]",
    "gb:biology-overview:[.dashboard-widget_&]:[box-shadow:none] gb:biology-overview:[.dashboard-widget_&]:[gap:12px]",
  ),
  'db-bio-coherence-domains': styles(
    "gb:biology-overview:[display:grid] gb:biology-overview:[grid-template-columns:repeat(6,minmax(0,1fr))] gb:biology-overview:[gap:10px]",
    "gb:biology-overview:overview-medium:[grid-template-columns:repeat(3,minmax(0,1fr))] gb:biology-overview:overview-small:[gap:8px] gb:biology-overview:overview-narrow:[grid-template-columns:repeat(2,minmax(0,1fr))]",
    "gb:biology-overview:overview-small:before:[content:'Baseline_domains'] gb:biology-overview:overview-small:before:[grid-column:1_/_-1] gb:biology-overview:overview-small:before:[color:var(--text-muted)]",
    "gb:biology-overview:overview-small:before:[font-family:var(--font-mono)] gb:biology-overview:overview-small:before:[font-size:10px] gb:biology-overview:overview-small:before:[font-weight:800]",
    "gb:biology-overview:overview-small:before:[letter-spacing:.07em] gb:biology-overview:overview-small:before:[text-transform:uppercase]",
  ),
  'bc-micro-domain': styles(
    "gb:biology-overview:[display:grid] gb:biology-overview:[gap:5px] gb:biology-overview:[padding:8px]",
    "gb:biology-overview:[border-radius:var(--radius)] gb:biology-overview:[background:color-mix(in_srgb,var(--bg-card)_70%,transparent)] gb:biology-overview:[transition:background_.12s]",
    "gb:biology-overview:data-[biology-score-action=jump-to-domain]:[cursor:pointer] gb:biology-overview:data-[biology-score-action=jump-to-domain]:hover:[background:color-mix(in_srgb,var(--accent)_12%,var(--bg-card))] gb:biology-overview:data-[biology-score-action=jump-to-domain]:hover:[outline:none]",
    "gb:biology-overview:data-[biology-score-action=jump-to-domain]:focus-visible:[background:color-mix(in_srgb,var(--accent)_12%,var(--bg-card))] gb:biology-overview:data-[biology-score-action=jump-to-domain]:focus-visible:[outline:2px_solid_var(--accent)] gb:biology-overview:data-[biology-score-action=jump-to-domain]:focus-visible:[outline-offset:2px]",
  ),
  'bc-micro-domain-action': styles(
    "gb:biology-overview:[font-family:inherit] gb:biology-overview:[font-size:inherit] gb:biology-overview:[font-style:inherit]",
    "gb:biology-overview:[font-weight:inherit] gb:biology-overview:[font-variant:inherit] gb:biology-overview:[font-stretch:inherit]",
    "gb:biology-overview:[line-height:inherit] gb:biology-overview:[letter-spacing:inherit] gb:biology-overview:[text-align:inherit]",
    "gb:biology-overview:[border:0] gb:biology-overview:[appearance:none] gb:biology-overview:[color:inherit]",
  ),
  'bc-micro-domain-no-jump': styles(
    "gb:biology-overview:[opacity:.6] gb:biology-overview:[cursor:default]",
  ),
  'bc-micro-domain-label': styles(
    "gb:biology-overview:[overflow:visible] gb:biology-overview:[text-overflow:ellipsis] gb:biology-overview:[white-space:normal]",
    "gb:biology-overview:[color:var(--text-secondary)] gb:biology-overview:[font-size:11px]",
  ),
  'bc-micro-domain-bar': styles(
    "gb:biology-overview:[height:4px] gb:biology-overview:[border-radius:2px] gb:biology-overview:[background:color-mix(in_srgb,var(--accent)_12%,var(--border))]",
    "gb:biology-overview:[overflow:hidden]",
  ),
  'bc-micro-domain-fill': styles(
    "gb:biology-overview:[height:100%] gb:biology-overview:[border-radius:2px]",
  ),
  'bc-micro-domain-fill-good': styles(
    "gb:biology-overview:[background:var(--green,#22c55e)]",
  ),
  'bc-micro-domain-fill-fair': styles(
    "gb:biology-overview:[background:var(--yellow,#f59e0b)]",
  ),
  'bc-micro-domain-fill-poor': styles(
    "gb:biology-overview:[background:var(--red,#ef4444)]",
  ),
  'bc-micro-domain-score': styles(
    "gb:biology-overview:[color:var(--text-primary)] gb:biology-overview:[font-family:var(--font-mono)] gb:biology-overview:[font-size:12px]",
    "gb:biology-overview:[font-weight:700]",
  ),
};
export function biologyOverviewClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
