// @ts-check
// biology-score-render.js — HTML rendering for Biology Score cards, details, and dashboard/lens widgets.

import { escapeAttr, escapeHTML } from './utils.js';
import { renderScoreAIAnswer, renderScoreQuestion } from './biology-score-sections.js';
import { hasCurrentBiologyScoreContextReview } from './biology-score-context-ai.js';
import { getBiologyProfileContext } from './profile-context.js';
import { TONE_LABELS, clamp, contextOnlyNeedsMoreData } from './biology-score-engine.js';
import { renderLensDashboardToggle } from './lens-page-shell.js';

function getMarkerTitle(item) {
  return item.displayValue != null
    ? `${item.label}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}`
    : item.label;
}

function markerDisplayLabel(item) {
  if (item?.dotKey === 'proteins.hsCRP') return 'hs-CRP';
  if (item?.dotKey === 'proteins.crp') return 'CRP';
  const byKey = {
    reverseT3: 'Reverse T3',
    tpoAb: 'TPO antibodies',
    tgAb: 'Thyroglobulin antibodies',
    platelets: 'Platelets',
    fibrinogen: 'Fibrinogen',
    dDimer: 'D-dimer',
    albumin: 'Albumin',
    sodium: 'Sodium',
    bunCreatRatio: 'BUN/creatinine ratio',
    crp: 'CRP',
    hsCrp: 'hs-CRP',
    homocysteine: 'Homocysteine',
    triglycerides: 'Triglycerides',
    tag: 'Triglycerides',
    alt: 'ALT',
    ast: 'AST',
    alp: 'ALP',
    ggt: 'GGT',
    glucose: 'Glucose',
    insulin: 'Insulin',
    hba1c: 'HbA1c',
    urea: 'Urea',
    creatinine: 'Creatinine',
    egfr: 'eGFR',
    wbc: 'WBC',
    neutrophils: 'Neutrophils',
    lymphocytes: 'Lymphocytes',
    eosinophils: 'Eosinophils',
    linoleic: 'Linoleic acid',
    arachidonic: 'Arachidonic acid',
    calcitriol: '1,25-(OH)₂D / calcitriol',
    magnesiumRBC: 'RBC magnesium',
    calcium: 'Total calcium',
    phosphorus: 'Phosphorus',
    ferritin: 'Ferritin',
    iron: 'Serum iron',
    lh: 'LH',
    fsh: 'FSH',
    prolactin: 'Prolactin',
    lpA: 'Lp(a)',
    lpa: 'Lp(a)',
    hct: 'Hematocrit',
    hgb: 'Hemoglobin',
    mch: 'MCH',
    mcv: 'MCV',
    apoB: 'ApoB',
    apoA1: 'ApoA1',
    shbg: 'SHBG',
    dheaS: 'DHEA-S',
    igf1: 'IGF-1',
    ft3: 'Free T3',
    tsh: 'TSH',
    ck: 'Creatine kinase',
    vitaminD: '25-OH vitamin D',
    b12: 'Vitamin B12',
    activeB12: 'Active B12',
  };
  if (item?.key && byKey[item.key]) return byKey[item.key];
  return String(item?.label || '')
    .replace(/^B12 status \(active or total B12\)$/i, 'Active or total B12')
    .replace(/\s+pituitary signal$/i, '')
    .replace(/\s+genetic risk$/i, '')
    .replace(/\s+concentration$/i, '')
    .replace(/\s+red-cell ironization$/i, '')
    .replace(/\s+red-cell size$/i, '')
    .replace(/\s*\/\s*plasma viscosity context/gi, '')
    .replace(/\s+brake context$/i, '')
    .replace(/\s+activation context$/i, '')
    .replace(/\s+hydration context$/i, '')
    .replace(/\s+plasma context$/i, '')
    .replace(/\s+storage context$/i, '')
    .replace(/\s+context for ferritin$/i, '')
    .replace(/\s+availability context$/i, '')
    .replace(/\s+adrenal reserve context$/i, '')
    .replace(/\s+repair signal$/i, '')
    .replace(/\s+recovery\/bone context$/i, '')
    .replace(/\s+oxygen-carrying context$/i, '')
    .replace(/\s+metabolic context$/i, '')
    .replace(/\s+tissue stress$/i, '')
    .replace(/\s+tissue-energy stress$/i, '')
    .replace(/\s+protein-turnover context$/i, '')
    .replace(/\s+muscle\/kidney context$/i, '')
    .replace(/\s+stress load$/i, '')
    .replace(/\s+stress skew$/i, '')
    .replace(/\s+stress suppression context$/i, '')
    .replace(/\s+stress context$/i, '')
    .replace(/\s+axis context$/i, '')
    .replace(/\s+androgen conversion context$/i, '')
    .replace(/\s+androgen precursor context$/i, '')
    .replace(/\s+adrenal androgen context$/i, '')
    .replace(/\s+hormone-axis context$/i, '')
    .replace(/\s+nerve support$/i, '')
    .replace(/\s+nerve\/vascular stress$/i, '')
    .replace(/\s+neuromuscular context$/i, '')
    .replace(/\s+nerve stress$/i, '')
    .replace(/\s+nerve context$/i, '')
    .replace(/\s+context$/i, '')
    .trim();
}

function renderMarkerToken(item, muted = false) {
  const title = getMarkerTitle(item);
  const label = markerDisplayLabel(item);
  if (item.id && !muted) {
    return `<button type="button" class="biology-score-token" title="${escapeAttr(title)}" data-biology-score-action="open-marker" data-biology-marker-id="${escapeAttr(item.id)}">${escapeHTML(label)}</button>`;
  }
  return `<span class="biology-score-token${muted ? ' biology-score-token-muted' : ''}" title="${escapeAttr(title)}">${escapeHTML(label)}</span>`;
}

function renderMarkerTableLink(item) {
  const title = getMarkerTitle(item);
  const label = markerDisplayLabel(item);
  if (item.id) {
    return `<button type="button" class="biology-score-marker-link" title="${escapeAttr(title)}" data-biology-score-action="open-marker" data-biology-marker-id="${escapeAttr(item.id)}">${escapeHTML(label)}</button>`;
  }
  return `<span class="biology-score-marker-link-static" title="${escapeAttr(title)}">${escapeHTML(label)}</span>`;
}

function renderScoreStatusItem(kind, label, value, tone = '') {
  return `<span class="biology-score-status biology-score-status-${escapeAttr(kind)}${tone ? ` biology-score-status-${escapeAttr(tone)}` : ''}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></span>`;
}

function getEvidenceBadge(evidence) {
  if (evidence === 'production') return 'Production';
  if (evidence === 'contextual') return 'Profile-aware';
  if (evidence === 'experimental') return 'Early model';
  return 'Unrated';
}

function getConfidenceFallback(score) {
  if (score.scoreConfidenceLabel) return { label: score.scoreConfidenceLabel, tone: score.scoreConfidence || 'unknown' };
  if ((score.recencyStatus || 'fresh') !== 'fresh') return { label: 'Retest needed', tone: score.recencyStatus || 'stale' };
  const coverage = Number(score.coverage || 0);
  if (coverage >= 0.8) return { label: 'High confidence', tone: 'high' };
  if (coverage >= 0.55) return { label: 'Medium confidence', tone: 'medium' };
  return { label: 'Low confidence', tone: 'low' };
}

function renderScoreStatusMeta(score, { weighted = false } = {}) {
  const recencyInvalid = score.recencyStatus && score.recencyStatus !== 'fresh';
  const parts = [];
  parts.push(renderScoreStatusItem('tone', 'Pattern', recencyInvalid ? 'Retest first' : (score.tone ? TONE_LABELS[score.tone] : 'Need inputs'), recencyInvalid ? (score.recencyStatus || 'stale') : (score.tone || 'unknown')));
  const coveragePct = Math.round((score.coverage || 0) * 100);
  const coverageLabel = score.coverageLabel || 'low';
  let coverageValue = `${coveragePct}%${weighted ? ' weighted' : ''}`;
  if (coveragePct < 45 && !recencyInvalid) coverageValue += ' · partial panel';
  else if (coveragePct >= 80) coverageValue += ' · full panel';
  parts.push(renderScoreStatusItem('coverage', 'Coverage', coverageValue, coverageLabel));
  const confidence = getConfidenceFallback(score);
  parts.push(renderScoreStatusItem('confidence', 'Confidence', confidence.label, confidence.tone));
  if (recencyInvalid) parts.push(renderScoreStatusItem('recency', 'Recency', score.recencyBadge || 'Retest needed', score.recencyStatus || 'stale'));
  parts.push(renderScoreStatusItem('evidence', 'Evidence', getEvidenceBadge(score.evidence), score.evidence || 'unknown'));
  return `<div class="biology-score-meta">${parts.join('')}</div>`;
}

function renderScoreRail(score, tone) {
  const left = Number.isFinite(score) ? clamp(score, 0, 100) : 0;
  return `<div class="biology-score-rail" aria-hidden="true">
    <div class="biology-score-rail-fill"></div>
    ${Number.isFinite(score) ? `<span class="biology-score-pin biology-score-pin-${escapeAttr(tone || 'unknown')}" style="left: calc(${left}% - 5px)"></span>` : ''}
  </div>`;
}

function renderBiologyScoreGate(variant = 'lens') {
  const compact = variant === 'dashboard';
  return `<section class="biology-score-context-gate biology-score-context-gate-${escapeAttr(variant)}">
    <div class="biology-scores-eyebrow">Waiting for context check</div>
    <h3>${compact ? 'Biology Scores locked' : 'Scores unlock after one context check'}</h3>
    <p>${compact ? 'Open Biology Scores and use the single unlock button there. The check is scoped to the active timeframe.' : 'Use the unlock button above. After the review finishes, scores render for this timeframe and any suggested context flags remain under your control.'}</p>
    ${compact ? '<button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" data-biology-score-action="open-lens">Open Biology Scores</button>' : ''}
  </section>`;
}

function renderScoreInputs(score) {
  const available = score.available.slice(0, 4).map((item) => renderMarkerToken(item)).join('');
  const missing = score.missing.slice(0, 4).map((item) => renderMarkerToken(item, true)).join('');
  if (!available && !missing) return '';
  return `<div class="biology-score-inputs">
    ${available ? `<div><span class="biology-score-input-label">Seen</span>${available}</div>` : ''}
    ${missing ? `<div><span class="biology-score-input-label">Missing</span>${missing}${score.missing.length > 4 ? `<span class="biology-score-token biology-score-token-muted">+${score.missing.length - 4}</span>` : ''}</div>` : ''}
  </div>`;
}

export function renderScoreDetail(score, options = {}) {
  const availableWeight = score.available.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const impactFor = (item) => availableWeight > 0
    ? ((100 - (Number(item.partial) || 0)) * (Number(item.weight) || 0)) / availableWeight
    : 0;
  const formatImpact = (item) => {
    if (item.profileContextOnly) return 'excluded from score';
    const impact = impactFor(item);
    if (!Number.isFinite(impact) || impact <= 0.05) return '0 pts';
    return `−${impact.toFixed(impact >= 10 ? 0 : 1)} pts`;
  };
  const used = score.available.length
    ? score.available
      .sort((a, b) => impactFor(b) - impactFor(a))
      .map((item) => `<tr><td>${renderMarkerTableLink(item)}</td><td>${escapeHTML(item.displayValue)}${item.unit ? ` ${escapeHTML(item.unit)}` : ''}</td><td>${escapeHTML(item.date || '—')}</td><td>${escapeHTML(item.profileContextOnly ? 'context' : `${Math.round(item.partial)}/100`)}</td><td>${escapeHTML(formatImpact(item))}</td></tr>`).join('')
    : `<tr><td colspan="5">No mapped inputs available yet.</td></tr>`;
  const missing = score.missing.length
    ? score.missing.map((item) => renderMarkerToken(item, true)).join('')
    : '<span class="biology-score-token biology-score-token-muted">None</span>';
  const topDrag = score.available
    .filter(item => !item.profileContextOnly && Number.isFinite(item.partial) && item.partial < 100)
    .sort((a, b) => impactFor(b) - impactFor(a))[0];
  const dragSummary = topDrag
    ? `<p class="biology-score-input-help"><strong>Main drag:</strong> ${escapeHTML(markerDisplayLabel(topDrag))} at ${Math.round(topDrag.partial)}/100 fit is pulling the score down most right now.</p>`
    : score.missing.length > 0
      ? `<p class="biology-score-input-help"><strong>Main gap:</strong> ${score.missing.length} mapped input${score.missing.length === 1 ? '' : 's'} missing. Filling ${escapeHTML(markerDisplayLabel(score.missing[0]) || 'the missing markers')} would improve this score most.</p>`
      : '';
  const flags = score.flags?.length
    ? `<div class="biology-score-flags"><div class="biology-score-input-label">Interpretation flags</div>${score.flags.map((flag) => `<p>${escapeHTML(flag)}</p>`).join('')}</div>`
    : '';
  const confidenceNote = score.scoreConfidenceWarning && score.scoreConfidence !== 'high'
    ? `<p class="biology-score-confidence-note biology-score-confidence-${escapeAttr(score.scoreConfidence || 'unknown')}">${escapeHTML(score.scoreConfidenceWarning)}</p>`
    : '';
  const showHeading = options.showHeading !== false;
  const detailHead = showHeading
    ? `<div class="biology-score-detail-head">
      <div>
        <div class="biology-score-kicker">${escapeHTML(score.kicker)}</div>
        <h3>${escapeHTML(score.title)}</h3>
        <p>${escapeHTML(score.summary)}</p>
      </div>
      <div class="biology-score-detail-metric"><strong>${Number.isFinite(score.score) ? escapeHTML(String(score.score)) : '—'}</strong><span>/100</span></div>
    </div>`
    : `<div class="biology-score-detail-head biology-score-detail-head-compact">
      <div class="biology-score-detail-metric"><strong>${Number.isFinite(score.score) ? escapeHTML(String(score.score)) : '—'}</strong><span>/100</span></div>
    </div>`;
  return `<section class="biology-score-detail${showHeading ? '' : ' biology-score-detail-embedded'}" id="biology-score-${escapeAttr(score.id)}">
    ${detailHead}
    ${renderScoreQuestion(score)}
    ${renderScoreRail(score.score, score.tone)}
    ${renderScoreAIAnswer(score)}
    ${renderScoreStatusMeta(score, { weighted: true })}
    ${confidenceNote}
    <details class="biology-score-debug"><summary><span>See what’s driving this</span></summary><div class="biology-score-detail-grid">
      <div>
        <div class="biology-score-input-label">Inputs affecting the score</div>
        ${dragSummary}
        <p class="biology-score-input-help">Fit means how well each marker matches the active range. Impact shows what is pulling the score down. Context rows are visible for interpretation but excluded from the math.</p>
        <div class="biology-score-table-wrap"><table class="biology-score-input-table"><thead><tr><th>Marker</th><th>Latest</th><th>Date</th><th title="Marker fit against the active range before weighting">Fit</th><th title="Weighted points this marker pulls from the composite score">Impact</th></tr></thead><tbody>${used}</tbody></table></div>
      </div>
      <div>
        <div class="biology-score-input-label">Useful missing labs</div>
        <div class="biology-score-missing-list">${missing}</div>
      </div>
    </div>${flags}</details>
  </section>`;
}

function renderScoreCard(score) {
  const tone = score.tone || 'unknown';
  const scoreValue = Number.isFinite(score.score) ? String(score.score) : '—';
  return `<article class="biology-score-card biology-score-card-${escapeAttr(tone)}" role="button" tabindex="0" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(score.id)}" aria-label="Open ${escapeAttr(score.title)} in Biology Scores lens">
    <div class="biology-score-card-head">
      <div>
        <div class="biology-score-kicker">${escapeHTML(score.kicker)}</div>
        <h4>${escapeHTML(score.title)}</h4>
      </div>
      <div class="biology-score-value"><strong>${escapeHTML(scoreValue)}</strong><span>/100</span></div>
    </div>
    <p class="biology-score-summary">${escapeHTML(score.summary)}</p>
    ${renderScoreRail(score.score, score.tone)}
    ${renderScoreStatusMeta(score)}
    ${renderScoreInputs(score)}
  </article>`;
}

function renderBiologicalCoherenceHero(score) {
  if (!score) return '';
  const scoreValue = Number.isFinite(score.score) ? String(score.score) : '—';
  const domains = [...(score.available || [])].sort((a, b) => Number(b.partial || 0) - Number(a.partial || 0));
  const strongest = domains[0];
  const weakest = domains.slice().sort((a, b) => Number(a.partial || 0) - Number(b.partial || 0))[0];
  const missingCount = score.missing?.length || 0;
  const domainRows = domains.map((item) => {
    const clickable = !!item.primaryScoreId;
    const attrs = clickable
      ? ` role="button" tabindex="0" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(item.primaryScoreId)}" title="Jump to ${escapeAttr(item.label)} score"`
      : ` title="${escapeAttr(item.label)} — no individual score available yet"`;
    const noJumpClass = clickable ? '' : ' biology-coherence-domain-no-jump';
    return `<div class="biology-coherence-domain-row${noJumpClass}"${attrs}><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(String(Math.round(item.partial || 0)))}</strong></div>`;
  }).join('');
  const summaryItems = [
    strongest ? ['Strongest', `${strongest.label} (${Math.round(strongest.partial || 0)}/100)`] : null,
    weakest && weakest !== strongest ? ['Most strained', `${weakest.label} (${Math.round(weakest.partial || 0)}/100)`] : null,
    ['Minimum panel', missingCount ? `${missingCount} domain${missingCount === 1 ? '' : 's'} still missing` : 'Enough data across domains'],
  ].filter(Boolean);
  const dashboardToggle = renderLensDashboardToggle('biology-score-biologicalCoherence');
  return `<section class="biology-coherence-hero biology-score-card-${escapeAttr(score.tone || 'unknown')}" id="biology-score-${escapeAttr(score.id)}">
    <div class="biology-coherence-copy">
      <div class="biology-scores-eyebrow">System-level score</div>
      <h2>${escapeHTML(score.title)}</h2>
      <p>${escapeHTML(score.summary)}</p>
      ${dashboardToggle ? `<div class="biology-coherence-tools">${dashboardToggle}</div>` : ''}
      <div class="biology-coherence-lines">${summaryItems.map(([label, value]) => `<div><strong>${escapeHTML(label)}</strong><span>${escapeHTML(value)}</span></div>`).join('')}</div>
    </div>
    <div class="biology-coherence-metric">
      <strong>${escapeHTML(scoreValue)}</strong><span>/100</span>
      ${renderScoreRail(score.score, score.tone)}
      ${renderScoreStatusMeta(score)}
    </div>
    ${domainRows ? `<div class="biology-coherence-domains">${domainRows}</div>` : ''}
  </section>`;
}

/**
 * Render helpers that need to call back into the orchestrator receive a compute
 * function instead of importing ./biology-scores.js to avoid ESM circular-import
 * issues in Node/Vitest.
 */

export function renderBiologicalCoherenceLensHero(ctx, computeBiologyScores) {
  const coherence = computeBiologyScores(ctx?.data || {}).find((score) => score.id === 'biologicalCoherence');
  return renderBiologicalCoherenceHero(coherence);
}

function renderDashboardScoreRail(score, tone) {
  const pct = Number.isFinite(score) ? clamp(score, 0, 100) : 0;
  const colorVar = tone === 'excellent' ? 'var(--green, #22c55e)' : tone === 'good' ? 'var(--accent)' : tone === 'strained' ? 'var(--yellow, #f59e0b)' : tone === 'poor' || tone === 'concerning' || tone === 'severe' ? 'var(--red, #ef4444)' : 'var(--text-muted)';
  return `<div class="db-hero-bio-bar db-hero-bio-bar-track" aria-hidden="true">
      <div class="db-hero-bio-bar-fill" style="width:${pct.toFixed(0)}%; background:${colorVar};"></div>
      <span class="db-hero-bio-bar-pin" style="left:${pct.toFixed(0)}%;"></span>
    </div>`;
}

export function renderDashboardBiologyScoreWidget(ctx, scoreId, computeBiologyScores) {
  if (!hasCurrentBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('dashboard');
  const score = computeBiologyScores(ctx?.data || {}).find(item => item.id === scoreId);
  if (!score) return '';
  const scoreValue = Number.isFinite(score.score) ? String(score.score) : '—';
  const tone = score.tone || 'unknown';
  const toneLabel = score.tone ? TONE_LABELS[score.tone] : 'Need inputs';
  const coveragePct = Math.round((score.coverage || 0) * 100);
  const strongestImpact = score.available
    .filter(item => !item.profileContextOnly && Number.isFinite(item.partial))
    .map(item => ({ item, impact: Number(item.weight || 0) * (100 - Number(item.partial)) }))
    .sort((a, b) => b.impact - a.impact)[0]?.item;
  const detailLine = strongestImpact && Number(strongestImpact.partial) < 100
    ? `Main drag: ${strongestImpact.label} (${Math.round(strongestImpact.partial)}/100 fit)`
    : score.missing?.length
      ? `${score.missing.length} mapped input${score.missing.length === 1 ? '' : 's'} missing`
      : 'No active marker drag';
  return `<button type="button" class="db-hero-bio db-hero-biology-score db-hero-biology-score-${escapeAttr(tone)}" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(scoreId)}" aria-label="Open ${escapeAttr(score.title)} in Biology Scores lens">
    <div class="db-hero-bio-left">
      <div class="db-hero-bio-num">${escapeHTML(scoreValue)}</div>
      <div class="db-hero-bio-label">
        <span class="top">${escapeHTML(score.title)}</span>
        <span class="actual">${escapeHTML(toneLabel)} · ${coveragePct}% coverage · ${escapeHTML(score.scoreConfidenceLabel || 'Confidence unknown')}</span>
        <span class="delta">${escapeHTML(detailLine)}</span>
      </div>
    </div>
    <div class="db-hero-bio-right">
      <div class="db-hero-row"><span>Inputs</span><strong>${score.available?.length || 0}/${(score.available?.length || 0) + (score.missing?.length || 0)}</strong></div>
      <div class="db-hero-row"><span>Recency</span><strong>${escapeHTML(score.recencyBadge || 'Dates aligned')}</strong></div>
      ${renderDashboardScoreRail(score.score, score.tone)}
      <div class="db-hero-scale"><span>0</span><span>50</span><span>100</span></div>
    </div>
    ${renderScoreStatusMeta(score)}
  </button>`;
}

export function renderDashboardBiologicalCoherenceWidget(ctx, computeBiologyScores) {
  if (!hasCurrentBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('dashboard');
  const score = computeBiologyScores(ctx?.data || {}).find(item => item.id === 'biologicalCoherence');
  if (!score) return '';
  const scoreValue = Number.isFinite(score.score) ? score.score : 0;
  const tone = score.tone || 'unknown';
  const toneLabel = score.tone ? TONE_LABELS[score.tone] : 'Need inputs';
  const domains = [...(score.available || [])].sort((a, b) => Number(b.partial || 0) - Number(a.partial || 0));
  const strongest = domains[0];
  const weakest = domains.slice().sort((a, b) => Number(a.partial || 0) - Number(b.partial || 0))[0];
  const missingCount = score.missing?.length || 0;
  const domainMicroBars = domains.map((item) => {
    const pct = clamp(Number(item.partial || 0), 0, 100);
    const clickable = !!item.primaryScoreId;
    const attrs = clickable
      ? ` role="button" tabindex="0" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(item.primaryScoreId)}" title="Jump to ${escapeAttr(item.label)} score"`
      : ` title="${escapeAttr(item.label)} — no individual score available yet"`;
    const noJumpClass = clickable ? '' : ' bc-micro-domain-no-jump';
    return `<div class="bc-micro-domain${noJumpClass}"${attrs}>
      <span class="bc-micro-domain-label">${escapeHTML(item.label)}</span>
      <div class="bc-micro-domain-bar" aria-hidden="true"><div style="width:${pct}%" class="bc-micro-domain-fill bc-micro-domain-fill-${pct >= 80 ? 'good' : pct >= 60 ? 'fair' : 'poor'}"></div></div>
      <span class="bc-micro-domain-score">${Math.round(pct)}</span>
    </div>`;
  }).join('');
  const insight = strongest
    ? `Strongest: ${strongest.label} · ${strongest.partial}/100${weakest && weakest !== strongest ? ` · Most strained: ${weakest.label} · ${weakest.partial}/100` : ''}`
    : missingCount
      ? `${missingCount} domain${missingCount === 1 ? '' : 's'} waiting for more markers`
      : 'Add labs to see your system-level coherence';
  return `<section class="db-bio-coherence-hero db-bio-coherence-${escapeAttr(tone)}">
    <div class="db-bio-coherence-header">
      <span class="db-bio-coherence-eyebrow">Biology overview</span>
      <span class="db-bio-coherence-status">${escapeHTML(toneLabel)}</span>
    </div>
    <div class="db-bio-coherence-body">
      <div class="db-bio-coherence-score">
        <div class="db-bio-coherence-ring" aria-hidden="true" style="--bc-score:${scoreValue}"></div>
        <div class="db-bio-coherence-number"><strong>${escapeHTML(String(Math.round(scoreValue)))}</strong><span>/100</span></div>
      </div>
      <div class="db-bio-coherence-summary">
        <h3>${escapeHTML(score.title)}</h3>
        <p>${escapeHTML(score.summary)}</p>
        <p class="db-bio-coherence-insight">${escapeHTML(insight)}</p>
        ${renderScoreStatusMeta(score)}
      </div>
    </div>
    ${domainMicroBars ? `<div class="db-bio-coherence-domains">${domainMicroBars}</div>` : ''}
  </section>`;
}

/** Legacy summary widget — still exported for backward compatibility. The dashboard
 * now uses renderDashboardBiologyScoreWidget for individual score cards and
 * renderDashboardBiologicalCoherenceWidget for the coherence hero. */
export function renderBiologyScoresWidget(ctx, options = {}, computeBiologyScores) {
  if (!hasCurrentBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('dashboard');
  const scores = computeBiologyScores(ctx?.data || {});
  const usefulScores = scores.filter((score) => score.score != null || score.coverage > 0);
  const displayScores = usefulScores.length ? usefulScores : scores.slice(0, 4);
  const best = usefulScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => b.score - a.score)[0];
  const weakest = usefulScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => a.score - b.score)[0];
  const lead = best
    ? `Best current signal: ${best.title} (${best.score}/100). ${weakest && weakest.id !== best.id ? `Most strained: ${weakest.title} (${weakest.score}/100).` : ''}`
    : 'Add labs to turn marker ranges into biology-level pattern scores.';
  return `<div class="biology-scores-widget">
    <div class="biology-scores-hero">
      <div>
        <div class="biology-scores-eyebrow">Composite lab widgets</div>
        <p>${escapeHTML(lead)}</p>
      </div>
      <span class="biology-scores-count">${usefulScores.length}/${scores.length} live</span>
    </div>
    <div class="biology-score-grid">
      ${displayScores.map(renderScoreCard).join('')}
    </div>
    <p class="biology-scores-note">Educational pattern score only. Score tone reflects the current marker pattern, coverage reflects missing inputs, and staleness is tracked separately.</p>
  </div>`;
}


export function renderBiologyScoresActionSummary(live, waiting) {
  if (!live.length) return '';
  const weakest = live.slice().sort((a, b) => a.score - b.score)[0];
  const lowConfidence = live.filter(score => score.scoreConfidence && score.scoreConfidence !== 'high');
  const strongest = live.slice().sort((a, b) => b.score - a.score)[0];
  const nextMissing = lowConfidence[0]?.missing?.find(item => item.core) || lowConfidence[0]?.missing?.[0] || waiting[0]?.missing?.[0];
  const rows = [
    weakest ? ['Watch first', `${weakest.title}: ${weakest.score}/100. Open this first; it is the most strained live domain.`] : null,
    strongest ? ['Looks strongest', `${strongest.title}: ${strongest.score}/100 — still check confidence before calling it “all clear”.`] : null,
    nextMissing ? ['Next useful lab', `${nextMissing.label} would improve confidence${lowConfidence[0] ? ` for ${lowConfidence[0].title}` : ''}.`] : null,
  ].filter(Boolean);
  return `<section class="biology-score-action-summary"><div class="biology-scores-eyebrow">What matters now</div>${rows.map(([label, text]) => `<div><strong>${escapeHTML(label)}</strong><span>${escapeHTML(text)}</span></div>`).join('')}</section>`;
}

function uniqueMissingMarkers(scores, { coreOnly = false, limit = 12 } = {}) {
  const seen = new Set();
  const markers = [];
  for (const score of scores) {
    const missing = effectiveMissingMarkers(score).filter(item => !coreOnly || item.core);
    for (const item of missing) {
      const key = item.coreGroup || item.key || item.label;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      markers.push({ ...item, scoreTitle: score.title, panelTier: score.panelTier });
      if (markers.length >= limit) return markers;
    }
  }
  return markers;
}

function effectiveMissingMarkers(score) {
  const coveredCoreGroups = new Set((score.available || [])
    .filter(item => item.coreGroup && item.core !== false)
    .map(item => item.coreGroup));
  const seenGroups = new Set();
  return (score.missing || [])
    .filter(item => !item.coreGroup || !coveredCoreGroups.has(item.coreGroup))
    .map(item => item.coreGroup ? { ...item, label: item.coreGroupLabel || item.label } : item)
    .filter(item => {
      if (!item.coreGroup) return true;
      if (seenGroups.has(item.coreGroup)) return false;
      seenGroups.add(item.coreGroup);
      return true;
    });
}

function effectiveContextMarkers(score, { unresolvedOnly = false } = {}) {
  const seen = new Set();
  return (score.available || [])
    .filter(item => item.profileContextOnly)
    .filter(item => !unresolvedOnly || contextOnlyNeedsMoreData(item))
    .filter(item => {
      const key = item.coreGroup || item.key || item.label;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderCoverageMarkerList(markers, emptyText) {
  if (!markers.length) return `<span class="biology-score-token biology-score-token-muted">${escapeHTML(emptyText)}</span>`;
  return markers.map(item => {
    const label = markerDisplayLabel(item);
    const title = item.contextReason || (item.scoreTitle ? `${item.scoreTitle}: ${item.label}` : item.label);
    return `<span class="biology-score-token biology-score-token-muted" title="${escapeAttr(title)}">${escapeHTML(label)}</span>`;
  }).join('');
}

export function renderBiologyScoreCoveragePlanner(detailScores, coherence) {
  const baselineScores = detailScores.filter(score => score.panelTier !== 'extended');
  const advancedScores = detailScores.filter(score => score.panelTier === 'extended');
  const baselineCoverage = Math.round(((coherence?.coverage || 0) * 100));
  const liveDomains = coherence?.available?.length || 0;
  const missingDomains = coherence?.missing?.length || 0;
  const baselineCoreMissing = uniqueMissingMarkers(baselineScores, { coreOnly: true, limit: 14 });
  const baselineUsefulMissing = uniqueMissingMarkers(baselineScores, { coreOnly: false, limit: 14 });
  const advancedMissing = uniqueMissingMarkers(advancedScores, { coreOnly: false, limit: 12 });
  const scoreRows = baselineScores.map(score => {
    const effectiveMissing = effectiveMissingMarkers(score);
    const contextNeeded = effectiveContextMarkers(score, { unresolvedOnly: true });
    const coreMissing = effectiveMissing.filter(item => item.core);
    const coreContext = contextNeeded.filter(item => item.core);
    const usefulMissing = coreMissing.length ? coreMissing : coreContext.length ? coreContext : effectiveMissing.length ? effectiveMissing.slice(0, 4) : contextNeeded.slice(0, 4);
    const coveragePct = Math.round((score.coverage || 0) * 100);
    return { score, usefulMissing, coreMissingCount: coreMissing.length, coreContextCount: coreContext.length, contextCount: contextNeeded.length, coveragePct };
  }).filter(row => row.usefulMissing.length).sort((a, b) => (b.coreMissingCount - a.coreMissingCount) || (b.coreContextCount - a.coreContextCount) || (a.coveragePct - b.coveragePct) || a.score.title.localeCompare(b.score.title)).map(row => {
    const confidence = Number.isFinite(row.score.score) ? (row.score.scoreConfidenceLabel || 'confidence unknown') : 'Needs markers';
    const gapLabel = row.coreMissingCount
      ? `<span>${row.coreMissingCount} core gap${row.coreMissingCount === 1 ? '' : 's'}</span>`
      : row.coreContextCount
        ? `<span>${row.coreContextCount} context needed</span>`
        : row.contextCount
          ? `<span>context needed</span>`
          : '';
    return `<div class="biology-coverage-score-row"><div class="biology-coverage-score-name"><strong>${escapeHTML(row.score.title)}</strong>${gapLabel}</div><div class="biology-coverage-score-markers"><div class="biology-coverage-marker-list">${renderCoverageMarkerList(row.usefulMissing, 'Core covered')}</div></div><div class="biology-coverage-score-status"><div class="biology-coverage-row-meter" aria-label="${escapeAttr(row.score.title)} coverage ${row.coveragePct}%"><span style="width:${Math.max(0, Math.min(100, row.coveragePct))}%"></span></div><div><strong>${row.coveragePct}%</strong><span>${escapeHTML(confidence)}</span></div></div></div>`;
  }).join('');
  const coreShortlist = baselineCoreMissing.length ? baselineCoreMissing : baselineUsefulMissing.slice(0, 6);
  const baselineIntro = baselineCoverage >= 80
    ? 'Good baseline coverage. These are confidence upgrades, not a reason to distrust the current score.'
    : 'Start here: cover core blood markers first. Missing data lowers confidence, not the score itself.';
  return `<section class="biology-score-coverage-planner">
    <div class="biology-score-coverage-head">
      <div class="biology-score-coverage-main"><div class="biology-scores-eyebrow">Coverage planner</div><h3>Improve coverage without over-testing</h3><p>${escapeHTML(baselineIntro)}</p><div class="biology-coverage-progress" aria-label="Baseline coverage ${baselineCoverage}%"><span style="width:${Math.max(0, Math.min(100, baselineCoverage))}%"></span></div><div class="biology-coverage-marker-list biology-coverage-marker-preview">${renderCoverageMarkerList(coreShortlist.slice(0, 5), 'Baseline core markers covered')}</div></div>
      <div class="biology-score-coverage-actions"><div class="biology-score-coverage-metric"><strong>${baselineCoverage}%</strong><span>baseline coverage</span></div><div class="biology-coverage-mini-stats"><span><b>${liveDomains}</b> live core domains</span><span><b>${missingDomains}</b> missing domains</span><span>Advanced depth stays optional</span></div><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-biology-score-action="plan-coverage-chat">Ask chat what to order</button></div>
    </div>
    <details class="biology-coverage-plan-details"><summary class="biology-disclosure-chip"><span class="biology-disclosure-open">Full marker plan</span><span class="biology-disclosure-close">Hide marker plan</span></summary>
      <div class="biology-score-coverage-grid biology-score-coverage-grid-core">
        <div><div class="biology-coverage-section-kicker">Baseline first</div><strong>Core baseline gaps</strong><p>Highest-value markers for Biological Coherence coverage.</p><div class="biology-coverage-marker-list">${renderCoverageMarkerList(coreShortlist, 'Baseline core markers covered')}</div></div>
        <div><div class="biology-coverage-section-kicker">Optional</div><strong>Advanced depth</strong><p>Specialty-panel extras for deeper users. Useful, but not required for baseline coherence.</p><div class="biology-coverage-marker-list">${renderCoverageMarkerList(advancedMissing.slice(0, 10), 'Advanced scores are optional')}</div></div>
      </div>
      <div class="biology-coverage-score-picker"><div class="biology-coverage-score-header"><h4>Score gaps</h4><span>Core gaps first, then lower coverage</span></div><div class="biology-coverage-score-table">${scoreRows || '<div class="biology-coverage-score-empty">Core score gaps are covered.</div>'}</div></div>
    </details>
  </section>`;
}

export function renderBiologyScoresLens(ctx, computeBiologyScores) {
  if (!hasCurrentBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('lens');
  const scores = computeBiologyScores(ctx?.data || {});
  const coherence = scores.find((score) => score.id === 'biologicalCoherence');
  const detailScores = scores.filter((score) => score.id !== 'biologicalCoherence');
  const live = detailScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => b.score - a.score);
  const waiting = detailScores.filter((score) => !Number.isFinite(score.score));
  const strongest = live[0];
  const weakest = live.slice().sort((a, b) => a.score - b.score)[0];
  const lead = strongest
    ? `Strongest current signal: ${strongest.title} (${strongest.score}/100). ${weakest && weakest.id !== strongest.id ? `Most strained: ${weakest.title} (${weakest.score}/100).` : ''}`
    : 'No overview score is live yet. Import labs or add missing markers to turn raw results into simple biology-level signals.';
  const pc = getBiologyProfileContext();
  const contextLabels = [[pc.lowMuscleMass, 'Low muscle / creatinine unreliable'], [pc.hormoneTherapy, 'Hormone therapy context'], [pc.cycleStatus && pc.cycleStatus !== 'regular', `Cycle: ${pc.cycleStatus}`], [pc.recentHardTraining, 'Recent hard training'], [pc.acuteInflammationContext, 'Acute illness/injury'], [Number.isFinite(pc.ageYears), `Age: ${pc.ageYears}y`]].filter(x => x[0]).map(x => `<span>${escapeHTML(String(x[1]))}</span>`).join('');
  return `<div class="biology-scores-lens">
    <div class="biology-scores-hero biology-scores-lens-hero"><div>
        <div class="biology-scores-eyebrow">Biology overview</div>
        <p>${escapeHTML(lead)}</p>
        ${contextLabels ? `<div class="biology-score-context-banner"><strong>Active context modifiers</strong>${contextLabels}</div>` : ''}
      </div>
      <span class="biology-scores-count">${live.length}/${detailScores.length} score signals</span></div>
    ${renderBiologicalCoherenceHero(coherence)}
    ${renderBiologyScoresActionSummary(live, waiting)}
    ${renderBiologyScoreCoveragePlanner(detailScores, coherence)}
    <div class="biology-score-detail-stack">${live.map(renderScoreDetail).join('')}${waiting.length ? `<details class="biology-score-unavailable-group"><summary>Show scores that need more markers or a retest</summary>${waiting.map(renderScoreDetail).join('')}</details>` : ''}</div>
    <p class="biology-scores-note">Educational pattern score only. This is reference/target-pattern coherence, not an outcome-validated diagnosis. Score tone reflects the current marker pattern; confidence reflects core-marker coverage; staleness is tracked separately.</p>
  </div>`;
}
