// light-channel-view.js — Light channel pill and detail renderers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { getCachedConditionsAtmosphere } from './light-conditions-now.js';

export function mergeTotals(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  return out;
}

// Mini 7-day sparkline rendered as inline SVG. Bars are heightless when a
// day's combined dose is sub-meaningful (~5% of daily target) — a faint
// stub so the day position stays readable without inflating an empty
// week. Replaces the prior ●○○○ dots metaphor which (a) implied a
// "fillable container" mental model that contradicts the daily-beats-
// banking framing and (b) had ~4 bits of resolution loss vs the
// continuous channel-au value.
//
// Width: 7 bars × 5px + 6 gaps × 2px = 47px in viewBox. Renders crisply
// at any pill height because we use viewBox + width 100%.
export function _channelSparkline(channelKey, totals = null) {
  if (!window.dailyChannelBreakdown) return '';
  const days = window.dailyChannelBreakdown(channelKey, 7);
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const dailyTarget = meta.dailyTarget || 0;
  const observedMax = Math.max(0, ...days.map(d => d.sun + d.device));
  const max = Math.max(observedMax, dailyTarget * 1.05, 0.001);
  const W = 47, H = 14, barW = 5, gap = 2;
  const colorFor = (total) => {
    if (dailyTarget <= 0 || total < dailyTarget * 0.05) return null; // faint stub
    if (total >= dailyTarget) return 'var(--green)';
    if (total >= dailyTarget * 0.30) return 'var(--channel-accent, var(--accent))';
    return 'var(--channel-accent, var(--accent))';
  };
  const opacityFor = (total) => {
    if (dailyTarget <= 0 || total < dailyTarget * 0.05) return 0.35;
    if (total >= dailyTarget) return 1.0;
    if (total >= dailyTarget * 0.30) return 0.85;
    return 0.55;
  };
  const bars = days.map((d, i) => {
    const x = i * (barW + gap);
    const total = d.sun + d.device;
    const isStub = !colorFor(total);
    const barH = isStub ? 1.5 : Math.max(1.5, (total / max) * H);
    const y = H - barH;
    const fill = colorFor(total) || 'var(--text-muted)';
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${fill}" opacity="${opacityFor(total)}" rx="0.6"/>`;
  }).join('');
  return `<svg class="light-pill-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${bars}</svg>`;
}

// "X days" label for the pill — count of days that hit the channel's
// meaningful-dose threshold. Returns "—" when no day qualified.
export function _channelDayCount(channelKey) {
  if (!window.dailyChannelBreakdown) return { txt: '—', n: 0 };
  const days = window.dailyChannelBreakdown(channelKey, 7);
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const target = meta.dailyTarget || 0;
  const threshold = (typeof _CHANNEL_DAY_THRESHOLD !== 'undefined' && _CHANNEL_DAY_THRESHOLD[channelKey]) || 0.30;
  const floor = target * threshold;
  let n = 0;
  for (const d of days) if ((d.sun + d.device) >= floor) n++;
  // "4/7" reads as a fraction at a glance — much clearer than "4d",
  // which users were parsing as "4 days ago" instead of "4 of 7 days
  // this week hit target". Tooltip + sr-only label still say it the
  // long way for accessibility. Zero-hit channels show "0/7" too so
  // the format stays consistent across pills instead of an em-dash
  // (which read as "no data" instead of "zero days hit").
  return { txt: `${n}/7`, n };
}

// Unified channel pill row — same vocabulary as the dashboard strip,
// reused on the Light page where each pill is a click-to-expand entry into
// a per-channel drill-down panel (full science, 7d/30d tier comparison,
// suggestion). Empty state renders the same row with all-empty
// sparklines; bars fill in as data accumulates. One renderer for both
// states.
export function renderChannelPills(totals7d, totals30d) {
  const ch = window.CHANNEL_DISPLAY || {};
  // Tier classifiers: weekly for v7 (the canonical "this week" headline),
  // and a 30-day equivalent for v30 by scaling the threshold band to the
  // longer window. Mixing daily-target classification on a multi-day total
  // double-counts and wrecks the trend arrow (t30 ALWAYS scored higher
  // than t7 because totals scale with window even when the daily rate is
  // identical, so the trend read "down" on every flat pattern).
  const tlabel = window.tierLabel || (() => 'none');
  const tier7 = window.weeklyChannelTier || ((v, k) => 0);
  const tier30 = (v, k) => {
    const target = ((ch[k] && ch[k].dailyTarget) || 1000) * 30;
    if (!Number.isFinite(v) || v <= 0) return 0;
    const r = v / target;
    if (r < 0.20) return 1;
    if (r < 0.55) return 2;
    if (r < 1.00) return 3;
    return 4;
  };
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  let html = `<div class="light-pills-row light-pills-interactive">`;
  for (const k of order) {
    const meta = ch[k] || {};
    const v7 = totals7d[k] || 0;
    const v30 = totals30d[k] || 0;
    const t7 = tier7(v7, k);
    const t30 = tier30(v30, k);
    const trendDir = t7 > t30 ? 'up' : t7 < t30 ? 'down' : 'flat';
    const dc = _channelDayCount(k);
    const tip = `${meta.what || ''} — ${dc.n} of 7 days hit target this week.`;
    const detailId = `light-pill-detail-${k}`;
    html += `<button type="button" class="light-pill light-pill-tier-${t7} light-pill-interactive" data-channel="${escapeAttr(k)}" data-trend="${trendDir}" aria-expanded="false" aria-controls="${detailId}" title="${escapeHTML(tip)}" onclick="window._toggleChannelDetail && window._toggleChannelDetail('${escapeAttr(k)}')">
      <span class="light-pill-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="light-pill-label">${escapeHTML(meta.label || k)}</span>
      ${_channelSparkline(k)}
      <span class="light-pill-daycount">${escapeHTML(dc.txt)}</span>
      <span class="sr-only">${tlabel(t7)}, ${dc.n} of 7 days hit target this week, trending ${trendDir} vs last 30 days</span>
    </button>`;
  }
  html += `</div>`;
  // The drill-down slot lives below the row. Only one channel is expanded
  // at a time — toggling collapses any other open detail.
  html += `<div class="light-channel-detail-slot" data-channel-detail-slot></div>`;
  return html;
}

// Per-channel scientific citations + action spectrum. Surfaced inside the
// drill-down panel so biohackers can audit which biology each pill encodes.
// Per-channel citations curated for fit + accessibility. Each entry is
// { cite, href, why }: the citation string, an open-access landing page
// (PubMed PMID or DOI), and a one-line "why this paper matters" tag so
// users can self-select what to read instead of staring at a list of
// titles. Selection priority: directly on-channel > foundational
// mechanism > population/RCT confirmation. Avoid tangential papers
// (e.g. measurement-methodology unless the engine uses that standard).
const CHANNEL_CITATIONS = {
  vitamin_d: {
    spectrum: 'Pre-vitamin-D action spectrum (CIE 174:2006), peak ~298 nm UVB',
    refs: [
      { cite: 'Webb AR & Engelsen O (2006). "Calculated ultraviolet exposure levels for a healthy vitamin D status." Photochem Photobiol 82:1697',
        href: 'https://pubmed.ncbi.nlm.nih.gov/16958558/',
        why: 'Dose-response calculations that justify the UVI ≥ 2-3 threshold the engine uses' },
      { cite: 'Holick MF (2007). "Vitamin D Deficiency." NEJM 357:266',
        href: 'https://www.nejm.org/doi/full/10.1056/NEJMra070553',
        why: 'Most-cited modern clinical review of the vitamin D pathway, including the per-session photoisomerization plateau (skin converts excess previtamin-D to inert tachysterol/lumisterol at high doses)' },
      { cite: 'Bogh MK & Wulf HC (2010). "Vitamin D production after UVB exposure depends on baseline 25(OH)D and total cholesterol." J Invest Dermatol 130:546',
        href: 'https://pubmed.ncbi.nlm.nih.gov/19812604/',
        why: 'Per-session IU yield variability — why the model bands at ±20-45% per zenith and biological response adds another 2-3×' },
    ],
  },
  circadian: {
    spectrum: 'Melanopic action spectrum (CIE S 026/E:2018), peak ~490 nm',
    refs: [
      { cite: 'Brown TM et al. (2022). "Recommendations for daytime, evening, and nighttime indoor light exposure." PLOS Biol 20:e3001571',
        href: 'https://doi.org/10.1371/journal.pbio.3001571',
        why: 'Current expert-consensus recommendations: ≥250 melanopic lux daytime, <10 evening, <1 night' },
      { cite: 'Lucas RJ et al. (2014). "Measuring and using light in the melanopsin age." Trends Neurosci 37:1',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24287308/',
        why: 'Foundational paper that informed the M-EDI / α-opic lux framework later codified in CIE S 026' },
      { cite: 'Hattar S et al. (2002). "Melanopsin-containing retinal ganglion cells: architecture, projections, and intrinsic photosensitivity." Science 295:1065',
        href: 'https://pubmed.ncbi.nlm.nih.gov/11834834/',
        why: 'Discovery of melanopsin and the ipRGC photoreceptor — the why-this-channel-exists paper' },
    ],
  },
  nir_solar: {
    spectrum: 'Cytochrome-c-oxidase absorption (660-850 nm windows). Solar NIR and narrowband PBM share the same chromophore — sunlight just delivers a broadband version of what panels do.',
    refs: [
      { cite: 'Hamblin MR (2018). "Mechanisms and Mitochondrial Redox Signaling in Photobiomodulation." Photochem Photobiol 94:199',
        href: 'https://pubmed.ncbi.nlm.nih.gov/29164625/',
        why: 'Comprehensive review of how 600–1000 nm light reaches mitochondrial cytochrome c oxidase and triggers redox signaling — the same pathway whether the photons come from sunlight or a panel' },
      { cite: 'Hamblin MR (2017). "Mechanisms and applications of the anti-inflammatory effects of photobiomodulation." AIMS Biophys 4:337',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28748217/',
        why: 'Mechanism review focused on the anti-inflammatory effects — applies equally to narrowband panels and the NIR component of broadband solar' },
      { cite: 'Karu TI (2010). "Multiple roles of cytochrome c oxidase in mammalian cells under action of red and IR-A radiation." IUBMB Life 62:607',
        href: 'https://pubmed.ncbi.nlm.nih.gov/20681024/',
        why: 'Cytochrome c oxidase as the primary photoacceptor — the molecular target underlying every NIR effect' },
    ],
  },
  no_cv: {
    spectrum: 'UVA + violet (320-440 nm) on bare skin → photo-released NO',
    refs: [
      { cite: 'Liu D et al. (2014). "UVA irradiation of human skin vasodilates arterial vasculature and lowers blood pressure independently of nitric oxide synthase." J Invest Dermatol 134:1839',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24445737/',
        why: 'Controlled mechanistic crossover trial showing UVA on skin lowers BP via photo-released NO from skin stores (NOT via vit-D)' },
      { cite: 'Lindqvist PG et al. (2016). "Avoidance of sun exposure as a risk factor for major causes of death." J Intern Med 280:375',
        href: 'https://pubmed.ncbi.nlm.nih.gov/26992108/',
        why: '20-year Swedish cohort: sun-avoidance carries all-cause mortality risk comparable to smoking' },
      { cite: 'Feelisch M et al. (2010). "Is sunlight good for our heart?" Eur Heart J 31:1041',
        href: 'https://pubmed.ncbi.nlm.nih.gov/20215123/',
        why: 'Foundational hypothesis paper laying out the UVA→NO→cardiovascular mechanism' },
    ],
  },
  pomc: {
    spectrum: 'UVA + UVB on skin keratinocytes → POMC → α-MSH/β-endorphin',
    refs: [
      { cite: 'Fell GL et al. (2014). "Skin β-endorphin mediates addiction to UV light." Cell 157:1527',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24949966/',
        why: 'Landmark Cell paper showing UV → keratinocyte β-endorphin → opioid-receptor-mediated mood/addictive response' },
      { cite: 'Slominski A et al. (2012). "Sensing the environment: regulation of local and global homeostasis by the skin\'s neuroendocrine system." Adv Anat Embryol Cell Biol 212:1',
        href: 'https://pubmed.ncbi.nlm.nih.gov/22894052/',
        why: 'Comprehensive review of skin as a neuroendocrine organ — POMC, α-MSH, ACTH, cortisol all expressed in skin' },
      { cite: 'Cui R et al. (2007). "Central role of p53 in the suntan response and pathologic hyperpigmentation." Cell 128:853',
        href: 'https://pubmed.ncbi.nlm.nih.gov/17350573/',
        why: 'p53 → POMC → α-MSH → melanin pathway: the molecular mechanism behind the tan signal' },
    ],
  },
  violet_eye: {
    spectrum: 'Violet 360-400 nm at the eye → OPN5/neuropsin + retinal dopamine release (cone-mediated). Distinct from the ipRGC/melanopic 490-nm circadian pathway.',
    refs: [
      { cite: 'Torii H et al. (2017). "Violet light exposure can be a preventive strategy against myopia progression." EBioMedicine 15:210',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28063778/',
        why: 'Foundational paper linking 360-400 nm violet light at the eye to slowed myopia progression in children' },
      { cite: 'Rose KA et al. (2008). "Outdoor activity reduces the prevalence of myopia in children." Ophthalmology 115:1279',
        href: 'https://pubmed.ncbi.nlm.nih.gov/18294691/',
        why: 'Cohort of >4000 kids (1,765 six-year-olds + 2,367 twelve-year-olds): time outdoors (not near-work) is the protective factor against myopia' },
      { cite: 'He M et al. (2015). "Effect of Time Spent Outdoors at School on the Development of Myopia Among Children in China: A Randomized Clinical Trial." JAMA 314:1142',
        href: 'https://pubmed.ncbi.nlm.nih.gov/26372583/',
        why: 'JAMA RCT in ~1,900 first-graders: 40 extra outdoor min/day cut new-myopia incidence by 9 percentage points (39.5% → 30.4%, ~23% relative reduction)' },
    ],
  },
};

function _renderChannelCitations(channelKey) {
  const cit = CHANNEL_CITATIONS[channelKey];
  if (!cit) return '';
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const channelName = meta.label || channelKey;
  const refs = cit.refs.map(({ cite, href, why }) => `<li>
    <a href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHTML(cite)}</a>
    ${why ? `<div class="light-channel-cit-why">${escapeHTML(why)}</div>` : ''}
  </li>`).join('');
  // "Suggest a better study" — same pattern as recommendations.js. Pre-
  // fills a GitHub issue with the channel name + current reference list
  // so the maintainer has context when triaging the suggestion. Open in
  // a new tab so reading the panel isn't interrupted.
  const issueTitle = encodeURIComponent(`[Light & Sun] ${channelName}: better study / correction`);
  const currentList = cit.refs.map(r => `- ${r.cite}\n  ${r.href}`).join('\n');
  const issueBody = encodeURIComponent(
    `**Channel:** ${channelName} (\`${channelKey}\`)\n` +
    `**Action spectrum:** ${cit.spectrum}\n\n` +
    `**Current references:**\n${currentList}\n\n` +
    `**What's wrong / what's better:**\n\n` +
    `**Suggested study (with link):**\n\n` +
    `**Why this is a better fit (one line):**\n`
  );
  const suggestLink = `<div class="light-channel-cit-suggest"><a href="https://github.com/elkimek/get-based/issues/new?title=${issueTitle}&body=${issueBody}&labels=light-channel-citations" target="_blank" rel="noopener">Suggest a better study →</a></div>`;
  return `<details class="light-channel-cit">
    <summary>Action spectrum &amp; citations</summary>
    <p class="light-channel-cit-spec"><strong>Spectrum:</strong> ${escapeHTML(cit.spectrum)}</p>
    <ul class="light-channel-cit-refs">${refs}</ul>
    ${suggestLink}
  </details>`;
}

// 7-day stacked bar chart: per-day sun + device totals for one channel.
// Always renders (even all-zero days) so the user has a baseline visual
// reference. Includes a dashed target line at (dailyTarget / 7) so the
// per-day chart shows what "hitting your weekly target evenly" looks
// like. Numeric labels above each bar surface the actual numbers when
// non-zero.
function _renderChannelWeekChart(channelKey) {
  if (!window.dailyChannelBreakdown) return '';
  const days = window.dailyChannelBreakdown(channelKey, 7);
  // For vit-D, pull a per-day IU breakdown that uses the same per-session
  // math as rollingVitaminDIU (real Fitz/UVI/rotation/genetics/body-frac
  // cap). Bar height + tier color still use channel-au from `days` for
  // continuity with the sparkline; only the numeric label switches to
  // per-session-accurate IU so it agrees with the session-row IU readout.
  const iuDays = (channelKey === 'vitamin_d' && window.dailyVitaminDIUBreakdown)
    ? window.dailyVitaminDIUBreakdown(7)
    : null;
  const ch = window.CHANNEL_DISPLAY || {};
  const meta = ch[channelKey] || {};
  const dailyTarget = meta.dailyTarget || 0;
  const dailyTargetSlice = dailyTarget; // chart is per-day, so target IS the daily target
  const observedMax = Math.max(0, ...days.map(d => d.sun + d.device));
  // Anchor the chart to whichever is bigger — the highest day or the
  // target-per-day line. Without this, very-low-dose weeks compress
  // the target off the top of the chart and lose context.
  const max = Math.max(observedMax, dailyTargetSlice * 1.2, 0.001);

  const W = 280, H = 96, padX = 18, padTop = 14, padBottom = 16;
  const innerH = H - padTop - padBottom;
  const barW = (W - 2 * padX) / 7;
  const barInner = Math.max(10, barW * 0.7);
  const dayLetter = (date) => 'SMTWTFS'[date.getDay()];
  const today = new Date(); today.setHours(0,0,0,0);

  // Per-day number formatter — converts channel-au into the channel's
  // natural unit so the chart labels match the hero's unit. Channel-au
  // by itself is dimensionless ("576K of what?"); always show something
  // human-readable.
  //
  // Returns "" for zero/sub-meaningful values so the chart doesn't get
  // peppered with "0%" labels on empty days.
  const fmt = (n, dayIdx) => {
    if (!Number.isFinite(n) || n < 0.5) return '';
    if (channelKey === 'vitamin_d') {
      // Use the per-session IU breakdown (same math as the session row
      // and the rollingVitaminDIU hero) rather than the old Fitz-III /
      // uvi-7 / no-genetics approximation that diverged 20-50% from the
      // session-row IU on real sessions.
      const iu = iuDays && dayIdx != null
        ? (iuDays[dayIdx]?.sun || 0) + (iuDays[dayIdx]?.device || 0)
        : 0;
      if (iu < 1) return '';
      if (iu >= 1000) return (iu / 1000).toFixed(1) + 'k';
      if (iu >= 100) return String(Math.round(iu / 10) * 10);
      return String(Math.round(iu));
    }
    if (channelKey === 'nir_solar' && window.pbmJoulesPerCm2) {
      const j = window.pbmJoulesPerCm2(n);
      if (j < 0.05) return '';
      if (j >= 10) return String(Math.round(j));
      if (j >= 1) return j.toFixed(1);
      return j.toFixed(2);
    }
    // Unitless channels — show percent-of-daily-target so the day-vs-day
    // comparison reads as % of typical day, not raw channel-au.
    if (dailyTarget > 0) {
      const pct = Math.round(100 * n / dailyTarget);
      if (pct === 0) return '';
      return `${pct}%`;
    }
    return '';
  };

  // Empty-day placeholder bar so the chart never reads as a giant blank.
  const placeholderH = 3;

  // Color bar by how the day's dose stacks up against the daily target.
  // Visual at-a-glance: green = hit/exceeded daily, accent = meaningful,
  // muted = marginal. Encourages reading the chart as "did I check this
  // box today?" instead of "what big number did I rack up?".
  const dayThreshold = _CHANNEL_DAY_THRESHOLD[channelKey] ?? 0.30;
  const colorForDay = (total) => {
    if (dailyTarget <= 0 || total < dailyTarget * 0.05) return { fill: 'var(--text-muted)', op: 0.40 };
    if (total >= dailyTarget) return { fill: 'var(--green)', op: 1.0 };
    if (total >= dailyTarget * dayThreshold) return { fill: 'var(--channel-accent, var(--accent))', op: 0.85 };
    return { fill: 'var(--channel-accent, var(--accent))', op: 0.45 };
  };

  const bars = days.map((d, i) => {
    const x = padX + i * barW + (barW - barInner) / 2;
    const total = d.sun + d.device;
    const h = total > 0 ? (total / max) * innerH : placeholderH;
    const sunH = total > 0 ? (d.sun / max) * innerH : 0;
    const devH = total > 0 ? (d.device / max) * innerH : 0;
    const y = padTop + innerH - h;
    const isToday = d.date.getTime() === today.getTime();
    const labelTxt = total > 0 ? fmt(total, i) : '';
    const { fill: barFill, op: barOp } = colorForDay(total);
    // Hit-target check mark — greener visual cue when the day cleared the
    // daily target line. Reduces the urge to chase higher percentages
    // ("more is better") past the saturation point.
    const checkMark = (dailyTarget > 0 && total >= dailyTarget) ? `<text x="${x + barInner / 2}" y="${y - 12}" text-anchor="middle" font-size="11" fill="var(--green)" font-weight="700">✓</text>` : '';
    return `<g>
      ${total > 0 ? '' : `<rect x="${x}" y="${padTop + innerH - placeholderH}" width="${barInner}" height="${placeholderH}" fill="var(--text-muted)" opacity="0.20" rx="1"/>`}
      ${devH > 0 ? `<rect x="${x}" y="${y}" width="${barInner}" height="${devH}" fill="${barFill}" opacity="${barOp * 0.55}" rx="1"/>` : ''}
      ${sunH > 0 ? `<rect x="${x}" y="${y + devH}" width="${barInner}" height="${sunH}" fill="${barFill}" opacity="${barOp}" rx="1"/>` : ''}
      ${checkMark}
      ${labelTxt && !checkMark ? `<text x="${x + barInner / 2}" y="${y - 2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">${labelTxt}</text>` : ''}
      <text x="${x + barInner / 2}" y="${H - 3}" text-anchor="middle" font-size="10" fill="${isToday ? 'var(--text-primary)' : 'var(--text-muted)'}" font-weight="${isToday ? '700' : '400'}">${dayLetter(d.date)}</text>
    </g>`;
  }).join('');

  // Target line — dashed accent, drawn under the bars so the bar fills sit
  // on top of it visually. Surfaces the "what hitting the weekly target
  // evenly looks like" reference. Only meaningful when target > 0.
  const targetLine = dailyTargetSlice > 0
    ? `<line x1="${padX}" x2="${W - padX}" y1="${padTop + innerH - (dailyTargetSlice / max) * innerH}" y2="${padTop + innerH - (dailyTargetSlice / max) * innerH}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
       <text x="${W - padX + 2}" y="${padTop + innerH - (dailyTargetSlice / max) * innerH + 3}" font-size="9" fill="var(--text-muted)" text-anchor="start">target</text>`
    : '';

  // SR readable summary
  const dayName = (date) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
  const srRows = days.map(d => {
    const total = d.sun + d.device;
    if (total < 0.0001) return `${dayName(d.date)}: no exposure`;
    if (d.device > 0 && d.sun > 0) return `${dayName(d.date)}: sun ${fmt(d.sun)}, device ${fmt(d.device)}`;
    if (d.sun > 0) return `${dayName(d.date)}: sun ${fmt(d.sun)}`;
    return `${dayName(d.date)}: device ${fmt(d.device)}`;
  }).join('. ');

  return `<div class="light-channel-weekchart" title="Last 7 days · solid = sun, faded = device · dashed line = even-pace daily target">
    <div class="light-channel-weekchart-label">7-day rhythm <span class="light-channel-weekchart-legend"><span class="lc-leg-sun"></span> sun · <span class="lc-leg-dev"></span> device · <span class="lc-leg-tgt"></span> target</span></div>
    <svg viewBox="0 0 ${W + 32} ${H}" width="100%" height="${H}" aria-label="7-day per-day exposure: ${escapeAttr(srRows)}" role="img">
      <desc>${escapeHTML(srRows)}</desc>
      ${targetLine}
      ${bars}
    </svg>
  </div>`;
}

// Threshold (fraction of daily target) above which a day counts as
// "meaningful exposure" toward this channel. Stricter for the eye-bound
// circadian/violet channels because the biological response requires
// real entrainment-strength dose, not a brief glance.
const _CHANNEL_DAY_THRESHOLD = {
  vitamin_d:  0.30,
  nir_solar:  0.30,
  no_cv:      0.30,
  pomc:       0.30,
  circadian:  0.50,
  violet_eye: 0.50,
};

// Count days in the breakdown where the day's combined dose hit at least
// `threshold × dailyTarget`. Sub-meaningful days don't count — partial
// glance light isn't biologically equivalent to a real dose.
function _meaningfulDayCount(days, dailyTarget, threshold) {
  if (!Array.isArray(days) || dailyTarget <= 0) return 0;
  const floor = threshold * dailyTarget;
  let n = 0;
  for (const d of days) {
    if ((d.sun + d.device) >= floor) n++;
  }
  return n;
}

// Hero stat for a channel — leads with DAILY CONSISTENCY ("3 of 7
// days") instead of weekly cumulative. Health-wise, daily exposure
// matters more than banking one big day for every channel here:
// circadian needs daily entrainment, vit-D plateaus per session
// around 20k IU, NO release dissipates, NIR benefit is dose-per-
// exposure not banked. The "X of 7 days" framing matches the biology;
// the cumulative real-unit (IU / J/cm²) when defensible is shown as
// a sub-line for completeness.
function _channelHero(channelKey, totalCurrent, totalPrev, days7, daysPrev7, weeklyTier = 0) {
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const target = meta.dailyTarget || 0;
  const threshold = _CHANNEL_DAY_THRESHOLD[channelKey] ?? 0.30;
  const tierLabelFor = window.tierLabel || (() => 'none');
  const tierColors = ['muted', 'tier1', 'tier2', 'tier3', 'tier4'];
  const tierPill = `<span class="light-channel-detail-tierpill ${tierColors[weeklyTier] || 'muted'}">${escapeHTML(tierLabelFor(weeklyTier))} this week</span>`;
  const fmtIntK = (n) => {
    if (n < 10) return n.toFixed(1);
    if (n < 1000) return String(Math.round(n));
    if (n < 10000) return (n / 1000).toFixed(1) + 'k';
    return (n / 1000).toFixed(0) + 'k';
  };

  const dayCountCur  = _meaningfulDayCount(days7,     target, threshold);
  const dayCountPrev = _meaningfulDayCount(daysPrev7, target, threshold);

  // Cumulative real-unit summary (always computed; only shown if defensible).
  let cumulative = '';
  if (channelKey === 'vitamin_d' && window.rollingVitaminDIU) {
    const iu = window.rollingVitaminDIU(7);
    if (iu >= 30) cumulative = `· ~${fmtIntK(iu)} IU total`;
  } else if (channelKey === 'nir_solar' && window.pbmJoulesPerCm2) {
    const j = window.pbmJoulesPerCm2(totalCurrent);
    if (j >= 0.1) cumulative = `· ${j >= 10 ? Math.round(j) : j.toFixed(1)} J/cm² total`;
  }

  let primary = '';
  let primarySub = '';
  if (totalCurrent < 0.5 && dayCountCur === 0) {
    primary = '—';
    primarySub = 'no exposure logged this week';
  } else {
    primary = `${dayCountCur} of 7 days`;
    // Channel-aware sub-label — what counts as "meaningful exposure"
    // varies per channel, but the framing stays consistent.
    const SUB_LABELS = {
      vitamin_d:  'with meaningful UVB synthesis',
      nir_solar:  'with meaningful NIR exposure',
      circadian:  'with strong morning/midday daylight in your eyes',
      no_cv:      'with meaningful UVA on bare skin',
      pomc:       'with meaningful sun on bare skin',
      violet_eye: 'with strong outdoor light reaching your eyes',
    };
    const subBase = SUB_LABELS[channelKey] || 'with meaningful exposure';
    primarySub = `${subBase} ${cumulative}`.trim();
  }

  // Trend = day-count delta vs last week. Same unit (days) so comparison
  // reads naturally without conversion gymnastics.
  let trend = '';
  if (dayCountCur > 0 || dayCountPrev > 0) {
    const delta = dayCountCur - dayCountPrev;
    if (delta >= 1) {
      trend = `<span class="light-channel-hero-trend up">↑ ${delta} more day${delta === 1 ? '' : 's'} than last week</span>`;
    } else if (delta <= -1) {
      trend = `<span class="light-channel-hero-trend down">↓ ${-delta} fewer day${delta === -1 ? '' : 's'} than last week</span>`;
    } else if (dayCountCur > 0) {
      trend = `<span class="light-channel-hero-trend flat">~ same day count as last week</span>`;
    } else {
      trend = `<span class="light-channel-hero-trend down">↓ no qualifying days this week (had ${dayCountPrev} last week)</span>`;
    }
  }

  return `<div class="light-channel-hero">
    <div class="light-channel-hero-top">
      <div class="light-channel-hero-primary">${escapeHTML(primary)}</div>
      ${tierPill}
    </div>
    <div class="light-channel-hero-sub">${escapeHTML(primarySub)}</div>
    ${trend}
  </div>`;
}

// Caption explaining why daily exposure beats banking one big day.
// Channel-specific so the reason is biologically grounded, not generic.
function _renderDailyBeatsBankingNote(channelKey) {
  const NOTES = {
    vitamin_d:  'Skin photoisomerizes excess back to inactive isomers around 20k IU per session — daily 10-min sessions outperform one big day (Holick 2007, Webb 2018).',
    nir_solar:  'Mitochondrial benefit is dose-dependent per exposure, not banked — daily 20-min walks deliver more cumulative cellular signal than one long session.',
    circadian:  'Body clock entrainment depends on daily timing of morning light — one banked day doesn\'t prevent the next day\'s drift toward later sleep onset.',
    no_cv:      'UVA-driven nitric oxide release happens during exposure and dissipates over hours — daily refreshes the vasodilatory + BP-lowering signal.',
    pomc:       'POMC pathway tone resets between sessions — daily sun maintains α-MSH (tan signal) and β-endorphin (mood) baseline rather than spiking and crashing.',
    violet_eye: 'Violet-eye dopamine release is per-exposure — daily outdoor minutes accumulate the myopia-protective + alertness signal that one long day can\'t bank.',
  };
  const txt = NOTES[channelKey];
  if (!txt) return '';
  return `<p class="light-channel-banking-note"><strong>Daily beats banking.</strong> ${escapeHTML(txt)}</p>`;
}

// Source-mix mini bar — what fraction of the week's dose came from sun
// vs from devices. Surfaces hidden context (e.g. "your circadian channel
// is 90% from your dawn simulator, 10% from outdoor sun").
function _renderChannelSourceMix(sun, dev) {
  const total = sun + dev;
  if (total < 0.5) return '';
  const sunPct = Math.round(100 * sun / total);
  const devPct = 100 - sunPct;
  // Hide when one source is essentially zero — no useful "mix" to show.
  if (sunPct >= 99 || sunPct <= 1) return '';
  return `<div class="light-channel-mix" aria-label="This week's source mix: ${sunPct}% sun, ${devPct}% device">
    <div class="light-channel-mix-bar">
      <div class="light-channel-mix-sun" style="flex: ${sunPct}"></div>
      <div class="light-channel-mix-dev" style="flex: ${devPct}"></div>
    </div>
    <div class="light-channel-mix-legend">
      <span><span class="lc-leg-sun"></span> Sun ${sunPct}%</span>
      <span><span class="lc-leg-dev"></span> Device ${devPct}%</span>
    </div>
  </div>`;
}

// Channel-specific "next move" — a concrete recipe the user can act on
// right now. Picks the best CTA based on channel + tier + available
// devices + current sun conditions.
function _channelNextMove(channelKey, t7, totalCurrent, devices, atm) {
  const matchingDevice = (devices || []).find(d => Array.isArray(d.channels) && d.channels.includes(channelKey));
  const dev = matchingDevice ? escapeHTML(`${matchingDevice.brand} ${matchingDevice.model}`) : '';
  const uvi = atm?.uvIndex ?? null;
  const peakTime = atm?.daily?.peakAt || null;
  const peakUVI = atm?.daily?.uvIndexMax ?? null;
  const peakHHMM = peakTime ? new Date(peakTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;

  // Per-channel recipes — each returns a concrete, time-aware suggestion.
  const recipes = {
    vitamin_d: {
      empty: `UVB on bare skin makes vitamin D — needs UVI ≥ 3 and no glass. ${peakHHMM && peakUVI >= 3 ? `Today's UV peaks at <strong>${peakHHMM}</strong> (UVI ${peakUVI.toFixed(1)}). 15-20 min in shorts at peak ≈ 1,000-2,000 IU.` : 'Glass blocks UVB; window-side sun yields zero.'}${matchingDevice ? ` Or a session on your ${dev}.` : ''}`,
      low:   `${peakHHMM && peakUVI >= 3 ? `UV peaks at <strong>${peakHHMM}</strong> (UVI ${peakUVI.toFixed(1)}). One more 15-20 min midday session this week tips you to good range.` : 'A midday session on a clear day would tip you up.'}${matchingDevice ? ` Or a longer session on your ${dev}.` : ''}`,
      mod:   `Solid weekly base. ${peakHHMM ? `Today's peak: ${peakHHMM} (UVI ${peakUVI?.toFixed(1) || '?'}).` : 'Keep your current rhythm.'} One more session this week reaches strong.`,
      good:  `Strong week. Consistency matters more than intensity from here — same rhythm next week maintains 25(OH)D.`,
      strong:`Above typical-week target. Pull back if you're seeing pinkness; otherwise this is a solid trajectory for serum 25(OH)D.`,
    },
    circadian: {
      empty: `Get morning daylight in your eyes — ideally outdoors before work, no sunglasses, no glass. 10-30 min in the first 2 hours after sunrise = strongest entrainment.${matchingDevice ? ` Or 30 min on your ${dev} on overcast days.` : ''}`,
      low:   `Add a 15-20 min outdoor walk in your morning routine. Even cloudy mornings deliver 10-50× more melanopic light than indoor lighting.${matchingDevice ? ` Or a session on your ${dev}.` : ''}`,
      mod:   `Healthy entrainment dose. Mornings have the biggest effect on sleep onset that night — keep prioritizing AM over midday.`,
      good:  `Strong circadian signal. Consistent daily timing matters more than total dose at this point.`,
      strong:`Strong consistent entrainment. Watch for evening light contamination (cool LEDs after sunset) which can blunt melatonin even with strong AM exposure.`,
    },
    nir_solar: {
      empty: `Solar NIR is half of sunlight (600-1400 nm). 30-60 min outdoors at any time of day delivers a meaningful dose; window glass blocks ~70% of long NIR.${matchingDevice ? ` Or a 10-20 min session on your ${dev}.` : ''}`,
      low:   `Add an outdoor walk this week — sunrise/sunset light is NIR-rich and won't push burn dose.${matchingDevice ? ` Or 15 min on your ${dev}.` : ''}`,
      mod:   `Solid base. NIR doesn't need to be midday — golden-hour light delivers comparable dose without UVB burn risk.`,
      good:  `Strong weekly NIR. Mitochondrial repair signal is well-saturated for this week.`,
      strong:`Above typical-week NIR. No upper safety concern from broadband NIR — this is a maintenance pattern.`,
    },
    no_cv: {
      empty: `UVA on bare skin (320-400 nm) photo-releases nitric oxide from skin stores. ${peakHHMM && peakUVI >= 3 ? `15-30 min outdoors anytime UV is up — today peaks at <strong>${peakHHMM}</strong> (UVI ${peakUVI.toFixed(1)}).` : 'Open-sky exposure during daylight hours.'} Sunscreen partially blocks UVA — bare-skin sessions count more.`,
      low:   `Add a 20-30 min outdoor session this week with face + arms uncovered. UVA accumulates throughout the day, not just at solar noon.`,
      mod:   `Healthy weekly UVA dose — sustained NO release supports BP + arterial function (Liu 2014).`,
      good:  `Strong NO/cardiovascular signal. Good aggregate UVA exposure for vasodilatory benefit.`,
      strong:`Above typical-week UVA. Be mindful of cumulative photoaging if this is a daily pattern; UVA is the long-wavelength culprit.`,
    },
    pomc: {
      empty: `UVA + UVB on skin keratinocytes triggers POMC → α-MSH (tan signal) + β-endorphin (the "feels good in the sun" effect). Same recipe as cardiovascular — open-sky daylight on bare skin.`,
      low:   `Same path as vit-D and NO/CV: midday outdoor sessions on bare skin. One more session this week tips you up.`,
      mod:   `Healthy weekly POMC pathway activation.`,
      good:  `Solid mood-hormone weekly signal.`,
      strong:`Above typical-week POMC stimulus.`,
    },
    violet_eye: {
      empty: `Outdoor violet 360-440 nm hits ipRGC sensors in the eye — different from "bright window light," which window glass attenuates. 15-30 min outdoors with eyes uncovered (no sunglasses, no glass) builds the dopamine signal linked to myopia control + alertness.`,
      low:   `Add an outdoor walk with eyes uncovered (no sunglasses) this week. Even 10 min counts — this channel saturates quickly.`,
      mod:   `Healthy weekly outdoor-violet dose.`,
      good:  `Solid violet-eye signal — keep eyes uncovered during morning outdoor time for the strongest effect.`,
      strong:`Above typical-week. Sunglasses are still appropriate at high UVI for eye safety; the violet signal banks well below sunburn risk levels.`,
    },
  };
  const r = recipes[channelKey] || {};
  let txt = '';
  if (t7 === 0) txt = r.empty || '';
  else if (t7 === 1) txt = r.low || '';
  else if (t7 === 2) txt = r.mod || '';
  else if (t7 === 3) txt = r.good || '';
  else txt = r.strong || '';
  if (!txt) return '';
  // Action button — channel-keyed; sun channels lead with "Log a sun
  // session", device-only channels lead with the device dialog. Mixed
  // channels surface both.
  const showSun = true; // every channel can be filled with sun
  const showDev = !!matchingDevice;
  const buttons = `
    ${showSun ? `<button type="button" class="import-btn import-btn-primary light-channel-cta-btn" onclick="window.quickLogSunSession && window.quickLogSunSession()">☀ Log a sun session</button>` : ''}
    ${showDev ? `<button type="button" class="import-btn import-btn-secondary light-channel-cta-btn" onclick="window.quickLogDeviceSession && window.quickLogDeviceSession()">🔴 Log device session</button>` : ''}`;
  return `<section class="light-channel-nextmove">
    <div class="light-channel-nextmove-label">Next move</div>
    <p class="light-channel-nextmove-text">${txt}</p>
    <div class="light-channel-nextmove-actions">${buttons}</div>
  </section>`;
}

// Build the drill-down panel HTML for a single channel. Renders into the
// `[data-channel-detail-slot]` container when the user taps a pill.
//
// Layout (top → bottom):
//   1. Header: icon + title + tier pill + close
//   2. Hero stat: real-unit aggregate this week (or empty-state)
//   3. What it does: one-sentence description
//   4. Source mix bar: sun vs device split (when both contribute)
//   5. 7-day chart with target line + numeric labels
//   6. Next move: channel-specific concrete recipe + action button
//   7. Action spectrum + paper citations (expandable)
function _renderChannelDetailPanel(channelKey) {
  const ch = window.CHANNEL_DISPLAY || {};
  const meta = ch[channelKey] || {};
  // Drill-down hero stat is a 7-day total — classify against the weekly
  // target so the badge agrees with the pill (and the AI rollup).
  const tier = window.weeklyChannelTier || (() => 0);
  const tlabel = window.tierLabel || (() => 'none');
  const sunTot7 = (window.rollingChannelTotals && window.rollingChannelTotals(7)) || {};
  const devTot7 = (window.rollingDeviceTotals && window.rollingDeviceTotals(7)) || {};
  const sun7 = sunTot7[channelKey] || 0;
  const dev7 = devTot7[channelKey] || 0;
  const totalCurrent = sun7 + dev7;
  const t7 = tier(totalCurrent, channelKey);

  // Previous-week total via 14-day breakdown (first 7 days = the
  // preceding week, last 7 days = current week). Lets the hero show
  // a real "vs last week" delta instead of a vague tier-vs-tier arrow.
  let totalPrev = 0;
  let days7 = [];
  let daysPrev7 = [];
  try {
    if (window.dailyChannelBreakdown) {
      const days14 = window.dailyChannelBreakdown(channelKey, 14);
      daysPrev7 = days14.slice(0, 7);
      days7 = days14.slice(7);
      totalPrev = daysPrev7.reduce((s, d) => s + d.sun + d.device, 0);
    }
  } catch (e) {}

  const devices = (window.getDevices && window.getDevices()) || [];

  // Pull the Conditions Now atm if in cache so the next-move can quote
  // today's UV-peak time — way more actionable than "spend time outdoors."
  const atm = getCachedConditionsAtmosphere();

  return `<div class="light-channel-detail" data-channel="${escapeAttr(channelKey)}" id="light-pill-detail-${escapeAttr(channelKey)}" role="region" aria-label="${escapeHTML(meta.label || channelKey)} detail">
    <header class="light-channel-detail-head">
      <span class="light-channel-detail-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <h4 class="light-channel-detail-title">${escapeHTML(meta.label || channelKey)}</h4>
      <button type="button" class="light-channel-detail-close" aria-label="Close ${escapeAttr(meta.label || channelKey)} detail" onclick="window._toggleChannelDetail && window._toggleChannelDetail('${escapeAttr(channelKey)}')">×</button>
    </header>

    ${_channelHero(channelKey, totalCurrent, totalPrev, days7, daysPrev7, t7)}

    <p class="light-channel-detail-body">${escapeHTML(meta.what || '')}</p>

    ${_renderChannelSourceMix(sun7, dev7)}

    ${_renderChannelWeekChart(channelKey)}

    ${_renderDailyBeatsBankingNote(channelKey)}

    ${_channelNextMove(channelKey, t7, totalCurrent, devices, atm)}

    ${_renderChannelCitations(channelKey)}
  </div>`;
}

// Navigate to the Light & Sun page and auto-expand the channel's
// drill-down panel. Used when the user taps a dashboard pill — gives
// them one-click access to the science / 30d trend / suggestion
// instead of forcing them to find the same pill on the Light page
// after navigation. Already on Light? Just toggle in place.
export function _openChannelOnLightPage(channelKey) {
  // Helper: scroll the expanded panel into view + briefly flash so the
  // user notices when they're already on the Light page (no navigation
  // landing-on-target cue) and the panel may be far below the fold.
  const flashPanel = () => {
    const panel = document.getElementById(`light-pill-detail-${channelKey}`);
    if (!panel) return;
    if (panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.classList.add('light-channel-detail-flash');
    setTimeout(() => panel.classList.remove('light-channel-detail-flash'), 1500);
  };
  if (state.currentView === 'light') {
    _toggleChannelDetail(channelKey);
    // Scroll + flash on the next frame after the panel renders.
    requestAnimationFrame(() => requestAnimationFrame(flashPanel));
    return;
  }
  if (window.navigate) window.navigate('light');
  // Light page renders synchronously; the pill row is in the DOM by
  // the next animation frame. Defer the toggle so the section exists.
  // Two rAFs to make sure the async devices/env/tools slot doesn't
  // race the toggle.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _toggleChannelDetail(channelKey);
    flashPanel();
  }));
}

// Toggle a per-channel detail panel below the pill row. One channel
// expanded at a time — opening another collapses the previous one.
// Re-clicking the same pill collapses it.
export function _toggleChannelDetail(channelKey) {
  const slot = document.querySelector('[data-channel-detail-slot]');
  if (!slot) return;
  const row = slot.previousElementSibling; // the pill row
  const pills = row ? row.querySelectorAll('.light-pill') : [];
  const currentlyOpen = slot.dataset.openChannel || '';
  // Reset every pill's aria-expanded
  for (const p of pills) p.setAttribute('aria-expanded', 'false');
  if (currentlyOpen === channelKey) {
    // Re-tap → collapse
    slot.innerHTML = '';
    slot.dataset.openChannel = '';
    return;
  }
  slot.innerHTML = _renderChannelDetailPanel(channelKey);
  slot.dataset.openChannel = channelKey;
  // Mark the matching pill expanded; move focus into the panel for SR users
  for (const p of pills) {
    if (p.dataset.channel === channelKey) {
      p.setAttribute('aria-expanded', 'true');
      const panel = slot.firstElementChild;
      if (panel) panel.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => panel && panel.focus({ preventScroll: false }));
      break;
    }
  }
}

// One-line action suggestion based on the lowest-tier channel.
export function renderSuggestion(totals7d) {
  // Suggestion picks the lowest-tier channel from a 7-day total, so use
  // the weekly classifier — otherwise it nudges every channel as "low"
  // because each one is being compared to a daily target.
  const tier = window.weeklyChannelTier || (() => 0);
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const SUGGESTIONS = {
    vitamin_d:  'Get 10–15 minutes of midday sun on bare skin if your latitude allows — UVB drops sharply after 2 pm.',
    circadian:  '10 minutes of outdoor light before 9 am tends to be the highest-leverage move for your sleep.',
    nir_solar:  'Solar near-infrared is highest mid-morning to late afternoon. A walk outside catches the half of sunlight that windows block.',
    no_cv:      'Afternoon UVA-rich daylight on uncovered skin supports blood-vessel health and circulation.',
    pomc:       'A few minutes more uncovered daylight on skin engages the mood-hormone cascade.',
    violet_eye: 'Outdoor 360–400 nm light reaches your eyes only outside — even a few extra minutes helps.',
  };
  let worstKey = null, worstTier = 5;
  for (const k of order) {
    const t = tier(totals7d[k] || 0, k);
    if (t < worstTier) { worstTier = t; worstKey = k; }
  }
  if (!worstKey || worstTier >= 3) return '';  // hide once everything is at least 'good'
  return `<div class="light-suggestion">${escapeHTML(SUGGESTIONS[worstKey] || '')}</div>`;
}
