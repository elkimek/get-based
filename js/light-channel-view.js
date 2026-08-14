// @ts-check
// light-channel-view.js — Light channel pill and detail renderers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { getCachedConditionsAtmosphere } from './light-conditions-now.js';

/** @type {Record<string, any>} */
const lightChannelDeps = {
  channelDisplay: {}, dailyChannelBreakdown: null, dailyVitaminDIUBreakdown: null, weeklyChannelTier: () => 0,
  tierLabel: () => 'none', rollingChannelTotals: () => ({}), rollingDeviceTotals: () => ({}), rollingVitaminDIU: () => 0,
  pbmJoulesPerCm2: null, getDevices: () => [], navigate: () => {}, quickLogSunSession: () => {}, quickLogDeviceSession: () => {},
};
export function configureLightChannelView(deps = {}) { const previous = { ...lightChannelDeps }; Object.assign(lightChannelDeps, deps); return previous; }
const getChannelDisplay = () => lightChannelDeps.channelDisplay || {};

const LIGHT_CHANNEL_ACTION_ATTR = 'data-light-channel-action';
const LIGHT_CHANNEL_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightChannelActionDelegatesInstalled'), lightChannelActionDelegateRoots = new WeakSet();
function closestLightChannelAction(target) { return target?.closest?.(`[${LIGHT_CHANNEL_ACTION_ATTR}]`) || null; }
function handleLightChannelActionClick(event) {
  const actionEl = closestLightChannelAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LIGHT_CHANNEL_ACTION_ATTR);
  const channelKey = /** @type {HTMLElement} */ (actionEl).dataset.channel || '';
  let handled = true;
  if (action === 'toggle-detail' && channelKey) _toggleChannelDetail(channelKey);
  else if (action === 'quick-log-sun') lightChannelDeps.quickLogSunSession();
  else if (action === 'quick-log-device') lightChannelDeps.quickLogDeviceSession();
  else handled = false;
  if (handled) event.stopPropagation();
}
export function installLightChannelActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || lightChannelActionDelegateRoots.has(root) || root[LIGHT_CHANNEL_ACTION_DELEGATE_KEY]) return;
  lightChannelActionDelegateRoots.add(root);
  Object.defineProperty(root, LIGHT_CHANNEL_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleLightChannelActionClick);
}
if (typeof document !== 'undefined') installLightChannelActionDelegates();
export function mergeTotals(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  return out;
}

const _hasSignal = value => Number.isFinite(value) && value > 0.0001;

function _sourceSignalLabel(sun, device) {
  const hasSun = _hasSignal(sun);
  const hasDevice = _hasSignal(device);
  if (hasSun && hasDevice) return 'Sunlight + device logged';
  if (hasSun) return 'Sunlight logged';
  if (hasDevice) return 'Device logged';
  return 'Not logged';
}

// Mini 7-day sparkline rendered as inline SVG. Height shows the rhythm of
// modeled exposure, while solid/faded segments keep sunlight and devices
// visibly separate. There is no target or completion color.
export function _channelSparkline(channelKey) {
  const breakdown = lightChannelDeps.dailyChannelBreakdown;
  if (!breakdown) return '';
  const days = breakdown(channelKey, 7);
  const observedMax = Math.max(0, ...days.flatMap(d => [d.sun, d.device]));
  const max = Math.max(observedMax, 0.001);
  const W = 47, H = 14, barW = 2, pairGap = 1, gap = 2;
  const bars = days.map((d, i) => {
    const x = i * (barW * 2 + pairGap + gap);
    const total = d.sun + d.device;
    if (!_hasSignal(total)) {
      return `<rect x="${x}" y="${H - 1.5}" width="${barW * 2 + pairGap}" height="1.5" fill="var(--text-muted)" opacity="0.22" rx="0.6"/>`;
    }
    const sunH = Math.max(0, (d.sun / max) * H);
    const devH = Math.max(0, (d.device / max) * H);
    return `${sunH > 0 ? `<rect x="${x}" y="${H - sunH}" width="${barW}" height="${sunH}" fill="var(--channel-accent, var(--accent))" opacity="0.9" rx="0.6"/>` : ''}${devH > 0 ? `<rect x="${x + barW + pairGap}" y="${H - devH}" width="${barW}" height="${devH}" fill="var(--channel-accent, var(--accent))" opacity="0.38" rx="0.6"/>` : ''}`;
  }).join('');
  return `<svg class="light-pill-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${bars}</svg>`;
}

// Count days on which this channel received any modeled signal. This is a log
// summary, not a sufficiency threshold or a biological streak.
export function _channelDayCount(channelKey) {
  const breakdown = lightChannelDeps.dailyChannelBreakdown;
  if (!breakdown) return { txt: 'Not logged', n: 0, sun: 0, device: 0 };
  const days = breakdown(channelKey, 7);
  let n = 0, sun = 0, device = 0;
  for (const d of days) {
    if (_hasSignal(d.sun + d.device)) n++;
    if (_hasSignal(d.sun)) sun++;
    if (_hasSignal(d.device)) device++;
  }
  return { txt: n ? `${n} day${n === 1 ? '' : 's'}` : 'Not logged', n, sun, device };
}

// Unified channel pill row — same vocabulary as the dashboard strip,
// reused on the Light page where each pill is a click-to-expand entry into
// a per-channel drill-down panel (source, rhythm, plain-language meaning,
// and research). Empty state renders the same row with all-empty
// sparklines; bars fill in as data accumulates. One renderer for both
// states.
export function renderChannelPills(sunTotals7d, deviceTotals7d = {}) {
  const ch = getChannelDisplay();
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  let html = `<div class="light-pills-row light-pills-interactive">`;
  for (const k of order) {
    const meta = ch[k] || {};
    const sun = sunTotals7d[k] || 0;
    const device = deviceTotals7d[k] || 0;
    const active = _hasSignal(sun) || _hasSignal(device);
    const sourceLabel = _sourceSignalLabel(sun, device);
    const dc = _channelDayCount(k);
    const sourceDays = [dc.sun ? `sunlight ${dc.sun}d` : '', dc.device ? `device ${dc.device}d` : ''].filter(Boolean).join(' · ');
    const tip = `${meta.what || ''} — ${sourceLabel}${sourceDays ? ` (${sourceDays})` : ''}.`;
    const detailId = `light-pill-detail-${k}`;
    html += `<button type="button" class="light-pill light-pill-tier-${active ? 2 : 0} light-pill-signal-${active ? 'logged' : 'empty'} light-pill-interactive" data-light-channel-action="toggle-detail" data-channel="${escapeAttr(k)}" aria-expanded="false" aria-controls="${detailId}" title="${escapeHTML(tip)}">
      <span class="light-pill-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="light-pill-label">${escapeHTML(meta.label || k)}</span>
      ${_channelSparkline(k)}
      <span class="light-pill-daycount">${escapeHTML(dc.txt)}</span>
      <span class="sr-only">${escapeHTML(sourceLabel)}${dc.n ? ` on ${dc.n} day${dc.n === 1 ? '' : 's'} this week` : ''}</span>
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
        why: 'Shows how vitamin-D-effective UV varies by place and season; the engine uses its spectral integral rather than a universal UVI cliff' },
      { cite: 'Holick MF (2007). "Vitamin D Deficiency." NEJM 357:266',
        href: 'https://www.nejm.org/doi/full/10.1056/NEJMra070553',
        why: 'Most-cited modern clinical review of the vitamin D pathway, including the per-session photoisomerization plateau (skin converts excess previtamin-D to inert tachysterol/lumisterol at high doses)' },
      { cite: 'Bogh MK & Wulf HC (2010). "Vitamin D production after UVB exposure depends on baseline 25(OH)D and total cholesterol." J Invest Dermatol 130:546',
        href: 'https://pubmed.ncbi.nlm.nih.gov/19812604/',
        why: 'Shows large per-session response variability and why the IU-equivalent band must remain broad' },
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
    spectrum: 'Red and near-infrared light, roughly 600–1400 nm. Sunlight and targeted devices are shown separately because their spectra and delivery are different.',
    refs: [
      { cite: '"Longer wavelengths in sunlight pass through the human body and have a systemic impact which improves vision." Scientific Reports 15:24435 (2025)',
        href: 'https://pubmed.ncbi.nlm.nih.gov/40628952/',
        why: 'Human work measuring long-wave sunlight through the body and testing a separate 850 nm body exposure' },
      { cite: '"A Controlled Trial to Determine the Efficacy of Red and Near-Infrared Light Treatment." Photomed Laser Surg 32:93 (2014)',
        href: 'https://doi.org/10.1089/pho.2013.3616',
        why: 'A controlled study of broad red and near-infrared light for the specific skin outcomes tested' },
      { cite: '"Melatonin and the Optics of the Human Body." Melatonin Research 2:138 (2019)',
        href: 'https://doi.org/10.32794/MR11250016',
        why: 'Introduces the proposed link between near-infrared light, body optics, and melatonin inside cells' },
      { cite: 'Hamblin MR (2018). "Mechanisms and Mitochondrial Redox Signaling in Photobiomodulation." Photochem Photobiol 94:199',
        href: 'https://pubmed.ncbi.nlm.nih.gov/29164625/',
        why: 'Reviews several ways red and near-infrared light may interact with cell energy and signaling' },
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
        why: 'Observational association over 20 years; it does not prove causality or make intentional UV exposure a treatment' },
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
    spectrum: 'Outdoor violet-light hypothesis, roughly 360–400 nm at the eye. Human evidence is stronger for time outdoors than for a wavelength-specific dose, and this is not a reason to expose unprotected eyes to UV.',
    refs: [
      { cite: 'Torii H et al. (2017). "Violet light exposure can be a preventive strategy against myopia progression." EBioMedicine 15:210',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28063778/',
        why: 'Early human and experimental evidence for a violet-light hypothesis; it does not establish a safe eye-exposure dose' },
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
  const meta = getChannelDisplay()[channelKey] || {};
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
    <summary>Research &amp; sources</summary>
    <p class="light-channel-cit-spec"><strong>Spectrum:</strong> ${escapeHTML(cit.spectrum)}</p>
    <ul class="light-channel-cit-refs">${refs}</ul>
    ${suggestLink}
  </details>`;
}

// Seven-day source-aware history. Bars show when modeled light reached the
// channel; they are deliberately scaled to the user's own week and have no
// target line, completion mark, or good/bad color.
function _renderChannelWeekChart(channelKey) {
  const breakdown = lightChannelDeps.dailyChannelBreakdown;
  if (!breakdown) return '';
  const days = breakdown(channelKey, 7);
  const iuDays = (channelKey === 'vitamin_d' && lightChannelDeps.dailyVitaminDIUBreakdown)
    ? lightChannelDeps.dailyVitaminDIUBreakdown(7)
    : null;
  const observedMax = Math.max(0, ...days.flatMap(d => [d.sun, d.device]));
  const max = Math.max(observedMax, 0.001);

  const W = 280, H = 96, padX = 18, padTop = 14, padBottom = 16;
  const innerH = H - padTop - padBottom;
  const barW = (W - 2 * padX) / 7;
  const barInner = Math.max(10, barW * 0.7);
  const dayLetter = (date) => 'SMTWTFS'[date.getDay()];
  const today = new Date(); today.setHours(0,0,0,0);

  // Keep real-unit labels only where the app already exposes a defensible
  // estimate. Other channels use the shape of the bars without inventing a
  // percentage of biological sufficiency.
  const fmt = (n, dayIdx) => {
    if (!Number.isFinite(n) || n < 0.5) return '';
    if (channelKey === 'vitamin_d') {
      const iu = iuDays && dayIdx != null
        ? (iuDays[dayIdx]?.sun || 0) + (iuDays[dayIdx]?.device || 0)
        : 0;
      if (iu < 1) return '';
      if (iu >= 1000) return (iu / 1000).toFixed(1) + 'k';
      if (iu >= 100) return String(Math.round(iu / 10) * 10);
      return String(Math.round(iu));
    }
    if (channelKey === 'nir_solar' && lightChannelDeps.pbmJoulesPerCm2) {
      const j = lightChannelDeps.pbmJoulesPerCm2(n);
      if (j < 0.05) return '';
      if (j >= 10) return String(Math.round(j));
      if (j >= 1) return j.toFixed(1);
      return j.toFixed(2);
    }
    return '';
  };

  // Empty-day placeholder bar so the chart never reads as a giant blank.
  const placeholderH = 3;

  const bars = days.map((d, i) => {
    const x = padX + i * barW + (barW - barInner) / 2;
    const total = d.sun + d.device;
    const sunH = total > 0 ? (d.sun / max) * innerH : 0;
    const devH = total > 0 ? (d.device / max) * innerH : 0;
    const sourceGap = 2;
    const sourceBarW = (barInner - sourceGap) / 2;
    const isToday = d.date.getTime() === today.getTime();
    // A single numeric label is shown only when one source is present. When
    // both are logged, adding them into one label would undo the source split.
    const labelTxt = d.sun > 0 && d.device <= 0
      ? fmt(d.sun, i)
      : d.device > 0 && d.sun <= 0 ? fmt(d.device, i) : '';
    const labelY = padTop + innerH - Math.max(sunH, devH) - 2;
    return `<g>
      ${total > 0 ? '' : `<rect x="${x}" y="${padTop + innerH - placeholderH}" width="${barInner}" height="${placeholderH}" fill="var(--text-muted)" opacity="0.20" rx="1"/>`}
      ${sunH > 0 ? `<rect x="${x}" y="${padTop + innerH - sunH}" width="${sourceBarW}" height="${sunH}" fill="var(--channel-accent, var(--accent))" opacity="0.9" rx="1"/>` : ''}
      ${devH > 0 ? `<rect x="${x + sourceBarW + sourceGap}" y="${padTop + innerH - devH}" width="${sourceBarW}" height="${devH}" fill="var(--channel-accent, var(--accent))" opacity="0.38" rx="1"/>` : ''}
      ${labelTxt ? `<text x="${x + barInner / 2}" y="${labelY}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">${labelTxt}</text>` : ''}
      <text x="${x + barInner / 2}" y="${H - 3}" text-anchor="middle" font-size="10" fill="${isToday ? 'var(--text-primary)' : 'var(--text-muted)'}" font-weight="${isToday ? '700' : '400'}">${dayLetter(d.date)}</text>
    </g>`;
  }).join('');

  // SR readable summary
  const dayName = (date) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
  const srRows = days.map(d => {
    const total = d.sun + d.device;
    if (total < 0.0001) return `${dayName(d.date)}: no exposure`;
    if (d.device > 0 && d.sun > 0) return `${dayName(d.date)}: sunlight and device signal logged`;
    if (d.sun > 0) return `${dayName(d.date)}: sunlight signal logged`;
    return `${dayName(d.date)}: device signal logged`;
  }).join('. ');

  return `<div class="light-channel-weekchart" title="Last 7 days · solid = sunlight, faded = device">
    <div class="light-channel-weekchart-label">7-day rhythm <span class="light-channel-weekchart-legend"><span class="lc-leg-sun"></span> sunlight · <span class="lc-leg-dev"></span> device</span></div>
    <svg viewBox="0 0 ${W + 32} ${H}" width="100%" height="${H}" aria-label="7-day per-day exposure: ${escapeAttr(srRows)}" role="img">
      <desc>${escapeHTML(srRows)}</desc>
      ${bars}
    </svg>
  </div>`;
}

function _signalDays(days) {
  if (!Array.isArray(days)) return { any: 0, sun: 0, device: 0 };
  let any = 0, sun = 0, device = 0;
  for (const day of days) {
    if (_hasSignal(day.sun + day.device)) any++;
    if (_hasSignal(day.sun)) sun++;
    if (_hasSignal(day.device)) device++;
  }
  return { any, sun, device };
}

function _channelHero(sunCurrent, deviceCurrent, days7) {
  const counts = _signalDays(days7);
  const primary = _sourceSignalLabel(sunCurrent, deviceCurrent);
  const sourceDays = [counts.sun ? `sunlight on ${counts.sun} day${counts.sun === 1 ? '' : 's'}` : '', counts.device ? `device on ${counts.device} day${counts.device === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const sub = counts.any
    ? `${sourceDays}. This records exposure, not biological completion.`
    : 'No matching exposure was recorded this week. That is a logging result, not a deficiency.';
  return `<div class="light-channel-hero">
    <div class="light-channel-hero-top">
      <div class="light-channel-hero-primary">${escapeHTML(primary)}</div>
    </div>
    <div class="light-channel-hero-sub">${escapeHTML(sub)}</div>
  </div>`;
}

function _renderHowToReadNote(channelKey) {
  const NOTES = {
    vitamin_d:  'This shows when vitamin-D-effective UVB reached uncovered skin. It is not a reason to stay outside longer.',
    nir_solar:  'This records red and near-infrared exposure. Sunlight and a targeted device are not treated as the same experience.',
    circadian:  'For the body clock, timing matters most. Morning light and evening light can send different signals.',
    no_cv:      'This is a modeled skin-light signal, not a blood-pressure reading or a reason to seek more UVA.',
    pomc:       'This shows light that may start the skin pathway. It does not measure hormones or mood.',
    violet_eye: 'This is an early-stage pathway model. Use normal ambient outdoor light and never stare at the sun.',
  };
  const txt = NOTES[channelKey];
  if (!txt) return '';
  return `<p class="light-channel-banking-note"><strong>How to read it.</strong> ${escapeHTML(txt)}</p>`;
}

function _renderChannelSources(sun, device) {
  const hasSun = _hasSignal(sun);
  const hasDevice = _hasSignal(device);
  if (!hasSun && !hasDevice) return '';
  return `<div class="light-channel-sources" aria-label="Sources logged this week">
    <span class="light-channel-source ${hasSun ? 'is-logged' : 'is-empty'}"><span class="lc-leg-sun"></span>Sunlight: ${hasSun ? 'logged' : 'not logged'}</span>
    <span class="light-channel-source ${hasDevice ? 'is-logged' : 'is-empty'}"><span class="lc-leg-dev"></span>Device: ${hasDevice ? 'logged separately' : 'not logged'}</span>
    ${hasSun && hasDevice ? '<small>Both reached this pathway, but they are not combined into one score.</small>' : ''}
  </div>`;
}

// One plain-language takeaway. It explains the logged signal without asking
// the user to fill a channel or exposing an artificial sufficiency tier.
function _channelNextMove(channelKey, hasSun, hasDevice, devices, atm) {
  const matchingDevice = (devices || []).find(d => Array.isArray(d.channels) && d.channels.includes(channelKey));
  const peakTime = atm?.daily?.peakAt || null;
  const peakUVI = atm?.daily?.uvIndexMax ?? null;
  const peakHHMM = peakTime ? new Date(peakTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;

  const recipes = {
    vitamin_d: hasSun
      ? 'Vitamin-D-effective UVB reached uncovered skin in your sunlight log. Keep following the burn guide; more is not automatically better.'
      : `${peakHHMM && peakUVI >= 3 ? `UV is expected to peak near <strong>${peakHHMM}</strong> today. ` : ''}This signal only appears when vitamin-D-effective UVB reaches uncovered skin. Its absence is not a prompt to extend exposure.`,
    circadian: hasSun
      ? 'Outdoor light reached the eyes in your recent logs. Keep the timing steady; morning and evening light do not send the same message.'
      : 'Normal ambient outdoor light in the morning can provide a clear day signal. There is no need to look at the sun.',
    nir_solar: hasSun
      ? `Your sunlight log included red and near-infrared light.${hasDevice ? ' The device signal is shown separately because it is more targeted.' : ''}`
      : 'An outdoor session naturally includes red and near-infrared light as part of the wider daylight spectrum.',
    no_cv: hasSun
      ? 'A UVA-related skin signal was modeled in your sunlight log. This does not measure blood pressure or make extra UVA advisable.'
      : 'This signal appears when UVA reaches logged skin. No signal means it was not modeled, not that your body is deficient.',
    pomc: hasSun
      ? 'Sunlight reached a skin pathway linked with pigment and neuroendocrine signaling. The app does not measure hormones or mood.'
      : 'This pathway appears when the relevant sunlight reaches logged skin. It is something to observe, not a UV goal.',
    violet_eye: hasSun
      ? 'Ambient outdoor light reached this modeled eye pathway. Keep normal eye protection when needed and never stare at the sun.'
      : 'A normal outdoor walk can provide ambient violet light. The human biology is still being studied.',
  };
  const txt = recipes[channelKey] || '';
  if (!txt) return '';
  const showDev = !!matchingDevice;
  const buttons = `
    <button type="button" class="import-btn import-btn-primary light-channel-cta-btn" data-light-channel-action="quick-log-sun">☀ Log a sun session</button>
    ${showDev ? `<button type="button" class="import-btn import-btn-secondary light-channel-cta-btn" data-light-channel-action="quick-log-device">🔴 Log device session</button>` : ''}`;
  return `<section class="light-channel-nextmove">
    <div class="light-channel-nextmove-label">Simple takeaway</div>
    <p class="light-channel-nextmove-text">${txt}</p>
    <div class="light-channel-nextmove-actions">${buttons}</div>
  </section>`;
}

// Build the drill-down panel HTML for a single channel. Renders into the
// `[data-channel-detail-slot]` container when the user taps a pill.
//
// Layout (top → bottom):
//   1. Header: icon + title + close
//   2. Plain source-aware status
//   3. What it does: one-sentence description
//   4. Sunlight/device source labels
//   5. 7-day rhythm without a target line
//   6. Simple takeaway + action buttons
//   7. Research citations (expandable)
function _renderChannelDetailPanel(channelKey) {
  const ch = getChannelDisplay();
  const meta = ch[channelKey] || {};
  const sunTot7 = (typeof lightChannelDeps.rollingChannelTotals === 'function' ? lightChannelDeps.rollingChannelTotals(7) : null) || {};
  const devTot7 = (typeof lightChannelDeps.rollingDeviceTotals === 'function' ? lightChannelDeps.rollingDeviceTotals(7) : null) || {};
  const sun7 = sunTot7[channelKey] || 0;
  const dev7 = devTot7[channelKey] || 0;

  let days7 = [];
  try {
    const breakdown = lightChannelDeps.dailyChannelBreakdown;
    if (breakdown) {
      const days14 = breakdown(channelKey, 14);
      days7 = days14.slice(7);
    }
  } catch (e) {}

  const devices = lightChannelDeps.getDevices() || [];

  // Pull the Conditions Now atm if in cache so the next-move can quote
  // today's UV-peak time — way more actionable than "spend time outdoors."
  const atm = getCachedConditionsAtmosphere();

  return `<div class="light-channel-detail" data-channel="${escapeAttr(channelKey)}" id="light-pill-detail-${escapeAttr(channelKey)}" role="region" aria-label="${escapeHTML(meta.label || channelKey)} detail">
    <header class="light-channel-detail-head">
      <span class="light-channel-detail-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <h4 class="light-channel-detail-title">${escapeHTML(meta.label || channelKey)}</h4>
      <button type="button" class="light-channel-detail-close" aria-label="Close ${escapeAttr(meta.label || channelKey)} detail" data-light-channel-action="toggle-detail" data-channel="${escapeAttr(channelKey)}">×</button>
    </header>

    ${_channelHero(sun7, dev7, days7)}

    <p class="light-channel-detail-body">${escapeHTML(meta.what || '')}</p>

    ${_renderChannelSources(sun7, dev7)}

    ${_renderChannelWeekChart(channelKey)}

    ${_renderHowToReadNote(channelKey)}

    ${_channelNextMove(channelKey, _hasSignal(sun7), _hasSignal(dev7), devices, atm)}

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
  // user notices when they're already on the Light page and the panel may
  // be far below the fold.
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
  // Two rAFs keep the devices/env/tools slot from racing the toggle.
  const expandAfterNavigation = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    _toggleChannelDetail(channelKey);
    flashPanel();
  }));
  const navigation = lightChannelDeps.navigate('light');
  if (!navigation || typeof navigation.then !== 'function') { expandAfterNavigation(); return; }
  void navigation.then(expandAfterNavigation).catch(err => console.error('Failed to open Light & Sun channel', err));
}

// Toggle a per-channel detail panel below the pill row. One channel
// expanded at a time — opening another collapses the previous one.
// Re-clicking the same pill collapses it.
export function _toggleChannelDetail(channelKey) {
  const slot = /** @type {HTMLElement | null} */ (document.querySelector('[data-channel-detail-slot]'));
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
    if (/** @type {HTMLElement} */ (p).dataset.channel === channelKey) {
      p.setAttribute('aria-expanded', 'true');
      const panel = /** @type {HTMLElement | null} */ (slot.firstElementChild);
      if (panel) panel.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => panel && panel.focus({ preventScroll: false }));
      break;
    }
  }
}

function _weeklySessionSummary(sessions, start, end) {
  const completed = (Array.isArray(sessions) ? sessions : []).filter(session => {
    const timestamp = Number(session?.endedAt || 0);
    return timestamp >= start && timestamp < end;
  });
  const days = new Set(completed.map(session => {
    const date = new Date(Number(session.endedAt));
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }));
  return { sessions: completed.length, days: days.size };
}

function _sessionCountText(count, source) {
  return `${count} ${source} session${count === 1 ? '' : 's'}`;
}

// Calm seven-day summary for users without AI, and the grounding content
// shown before an AI review is requested. It compares logging patterns only:
// missing records never become a claim that the person received no light.
// Session arrays are optional so older consumers that only have channel
// totals still receive a useful source summary.
export function renderSuggestion(sunTotals7d = {}, deviceTotals7d = {}, sunSessions = null, deviceSessions = null) {
  const hasSun = Object.values(sunTotals7d).some(_hasSignal);
  const hasDevice = Object.values(deviceTotals7d).some(_hasSignal);
  const now = Date.now();
  const dayMs = 86400000;
  const hasSessionHistory = Array.isArray(sunSessions) || Array.isArray(deviceSessions);
  const currentSun = hasSessionHistory
    ? _weeklySessionSummary(sunSessions, now - 7 * dayMs, now)
    : { sessions: hasSun ? 1 : 0, days: hasSun ? 1 : 0 };
  const currentDevice = hasSessionHistory
    ? _weeklySessionSummary(deviceSessions, now - 7 * dayMs, now)
    : { sessions: hasDevice ? 1 : 0, days: hasDevice ? 1 : 0 };
  const previousSun = hasSessionHistory
    ? _weeklySessionSummary(sunSessions, now - 14 * dayMs, now - 7 * dayMs)
    : { sessions: 0, days: 0 };
  const previousDevice = hasSessionHistory
    ? _weeklySessionSummary(deviceSessions, now - 14 * dayMs, now - 7 * dayMs)
    : { sessions: 0, days: 0 };
  const currentTotal = currentSun.sessions + currentDevice.sessions;
  const previousTotal = previousSun.sessions + previousDevice.sessions;
  const loggedDays = new Set();
  if (hasSessionHistory) {
    for (const session of [...(sunSessions || []), ...(deviceSessions || [])]) {
      const timestamp = Number(session?.endedAt || 0);
      if (timestamp < now - 7 * dayMs || timestamp >= now) continue;
      const date = new Date(timestamp);
      loggedDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    }
  }

  let headline;
  let nextStep;
  if (currentTotal === 0) {
    headline = 'No outdoor or device sessions were logged in the past 7 days. We can’t tell whether you received little light or simply didn’t record it.';
    nextStep = 'If this reflects your week, a brief outdoor daylight break when practical can add a clear daytime signal. Ambient daylight is enough for the eyes; never stare at the sun.';
  } else {
    const sourceParts = [
      currentSun.sessions ? _sessionCountText(currentSun.sessions, 'outdoor') : '',
      currentDevice.sessions ? _sessionCountText(currentDevice.sessions, 'device') : '',
    ].filter(Boolean);
    const dayText = hasSessionHistory ? ` across ${loggedDays.size} logged day${loggedDays.size === 1 ? '' : 's'}` : '';
    headline = `The past 7 days contain ${sourceParts.join(' and ')}${dayText}.`;
    if (currentSun.sessions === 0 && currentDevice.sessions > 0) {
      nextStep = 'Devices supply targeted light. Outdoor daylight adds a wider spectrum and time-of-day context that a device does not copy.';
    } else if (currentSun.sessions > 0 && currentDevice.sessions > 0) {
      nextStep = 'Sunlight and device records stay separate; neither is added into a biological completion score.';
    } else {
      nextStep = 'The records show exposure, not whether every light-responsive pathway received enough stimulation.';
    }
  }

  let comparison;
  if (previousTotal === 0 && currentTotal === 0) comparison = 'There are no logged sessions in the previous 7 days either.';
  else if (previousTotal === 0) comparison = 'The previous 7 days contain no logged sessions for comparison.';
  else {
    comparison = `Previous 7 days: ${_sessionCountText(previousSun.sessions, 'outdoor')} and ${_sessionCountText(previousDevice.sessions, 'device')}.`;
  }

  return `<div class="light-suggestion light-weekly-fallback">
    <div class="light-weekly-period">Past 7 days</div>
    <p class="light-weekly-summary-text">${escapeHTML(headline)}</p>
    <p class="light-weekly-comparison">${escapeHTML(comparison)}</p>
    <p class="light-weekly-next-step">${escapeHTML(nextStep)}</p>
    ${currentTotal === 0 ? '<button type="button" class="dashboard-action-btn light-weekly-log-cta" data-light-page-action="quick-log-sun">Log outdoor exposure</button>' : ''}
  </div>`;
}
