// @ts-check
// biology-score-render.js — HTML rendering for Biology Score cards, details, and dashboard/lens widgets.

import { escapeAttr, escapeHTML } from './utils.js';
import { renderScoreAIAnswer, renderScoreQuestion } from './biology-score-sections.js';
import { hasBiologyScoreContextReview } from './biology-score-context-ai.js';
import { getBiologyProfileContext } from './profile-context.js';
import { TONE_LABELS, clamp, resolveScoreTone } from './biology-score-engine.js';
import { renderLensDashboardToggle } from './lens-page-shell.js';
import {
  buildBiologyScoreCoveragePlannerModel,
  effectiveMissingMarkers,
  markerDisplayLabel,
} from './biology-score-coverage-planner.js';

function getMarkerTitle(item) {
  return item.displayValue != null
    ? `${item.label}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}`
    : item.label;
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
  if (evidence === 'contextual') return 'Contextual';
  if (evidence === 'experimental') return 'Experimental';
  return 'Unrated';
}

function isDirectionalOnly(score) {
  const coverage = Number(score?.coverage || 0);
  return score?.evidence === 'experimental' && coverage < 0.25;
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
  const directional = isDirectionalOnly(score);
  const parts = [];
  parts.push(renderScoreStatusItem('tone', 'Pattern', directional ? 'Directional only' : recencyInvalid ? 'Retest first' : (score.tone ? TONE_LABELS[score.tone] : 'Need inputs'), directional ? 'directional' : recencyInvalid ? (score.recencyStatus || 'stale') : (score.tone || 'unknown')));
  const coveragePct = Math.round((score.coverage || 0) * 100);
  const coverageLabel = score.coverageLabel || 'low';
  let coverageValue = `${coveragePct}%${weighted ? ' weighted' : ''}`;
  if (directional) coverageValue += ' · thin evidence';
  else if (coveragePct < 45 && !recencyInvalid) coverageValue += ' · partial panel';
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
  const directional = isDirectionalOnly(score);
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
    ? `<div class="biology-score-detail-head${directional ? ' biology-score-detail-head-directional' : ''}">
      <div>
        <div class="biology-score-kicker">${escapeHTML(score.kicker)}</div>
        <h3>${escapeHTML(score.title)}</h3>
        <p>${escapeHTML(score.summary)}</p>
      </div>
      <div class="biology-score-detail-metric"><strong>${directional ? 'Directional' : Number.isFinite(score.score) ? escapeHTML(String(score.score)) : '—'}</strong><span>${directional ? 'only' : '/100'}</span></div>
    </div>`
    : `<div class="biology-score-detail-head biology-score-detail-head-compact${directional ? ' biology-score-detail-head-directional' : ''}">
      <div class="biology-score-detail-metric"><strong>${directional ? 'Directional' : Number.isFinite(score.score) ? escapeHTML(String(score.score)) : '—'}</strong><span>${directional ? 'only' : '/100'}</span></div>
    </div>`;
  const directionalNote = directional
    ? '<p class="biology-score-confidence-note biology-score-confidence-low">Not enough data for a full score. Treat this as an advanced directional clue until the specialty marker panel is filled.</p>'
    : '';
  return `<section class="biology-score-detail${showHeading ? '' : ' biology-score-detail-embedded'}" id="biology-score-${escapeAttr(score.id)}">
    ${detailHead}
    ${renderScoreQuestion(score)}
    ${renderScoreRail(score.score, score.tone)}
    ${renderScoreAIAnswer(score)}
    ${renderScoreStatusMeta(score, { weighted: true })}
    ${directionalNote}
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
    const toneClass = ` biology-coherence-domain-${escapeAttr(resolveScoreTone(Number(item.partial)) || 'unknown')}`;
    return `<div class="biology-coherence-domain-row${noJumpClass}${toneClass}"${attrs}><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(String(Math.round(item.partial || 0)))}</strong></div>`;
  }).join('');
  const summaryItems = [
    strongest ? ['Strongest', `${strongest.label} (${Math.round(strongest.partial || 0)}/100)`] : null,
    weakest && weakest !== strongest ? ['Most strained', `${weakest.label} (${Math.round(weakest.partial || 0)}/100)`] : null,
    ['Minimum panel', missingCount ? `${missingCount} domain${missingCount === 1 ? '' : 's'} still missing` : 'Enough data across domains'],
  ].filter(item => item !== null);
  const dashboardToggle = renderLensDashboardToggle('biology-score-biologicalCoherence');
  return `<section class="biology-coherence-hero biology-score-card-${escapeAttr(score.tone || 'unknown')}" id="biology-score-${escapeAttr(score.id)}">
    <div class="biology-coherence-copy">
      <div class="biology-coherence-title-row">
        <div><h2>${escapeHTML(score.title)}</h2></div>
        ${dashboardToggle ? `<div class="biology-coherence-tools">${dashboardToggle}</div>` : ''}
      </div>
      <p>${escapeHTML(score.summary)}</p>
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
  const colorVar = tone === 'excellent' || tone === 'good' ? 'var(--green, #22c55e)' : tone === 'strained' ? 'var(--yellow, #f59e0b)' : tone === 'poor' || tone === 'concerning' || tone === 'severe' ? 'var(--red, #ef4444)' : 'var(--text-muted)';
  return `<div class="db-hero-bio-bar db-hero-bio-bar-track" aria-hidden="true">
      <div class="db-hero-bio-bar-fill" style="width:${pct.toFixed(0)}%; background:${colorVar};"></div>
      <span class="db-hero-bio-bar-pin" style="left:${pct.toFixed(0)}%;"></span>
    </div>`;
}

export function renderDashboardBiologyScoreWidget(ctx, scoreId, computeBiologyScores) {
  if (!hasBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('dashboard');
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
  if (!hasBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('dashboard');
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
      <span class="db-bio-coherence-status">${escapeHTML(toneLabel)}</span>
    </div>
    <div class="db-bio-coherence-body">
      <div class="db-bio-coherence-score">
        <div class="db-bio-coherence-ring" aria-hidden="true" style="--bc-score:${scoreValue}"></div>
        <div class="db-bio-coherence-number"><strong>${escapeHTML(String(Math.round(scoreValue)))}</strong><span>/100</span></div>
      </div>
      <div class="db-bio-coherence-summary">
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
export function renderBiologyScoresWidget(ctx, computeBiologyScores) {
  if (!hasBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('dashboard');
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


/**
 * @param {any[]} live
 * @param {any[]} waiting
 * @param {{ available?: any[] } | null} [coherence]
 */
export function renderBiologyScoresActionSummary(live, waiting, coherence = null) {
  if (!live.length) return '';
  const weakest = live.slice().sort((a, b) => a.score - b.score)[0];
  const weakestCoherenceDomain = (coherence?.available || [])
    .filter(item => item.primaryScoreId && Number.isFinite(Number(item.partial)))
    .slice()
    .sort((a, b) => Number(a.partial || 0) - Number(b.partial || 0))[0];
  const openFirst = weakestCoherenceDomain
    ? { id: weakestCoherenceDomain.primaryScoreId, title: weakestCoherenceDomain.label }
    : weakest
      ? { id: weakest.id, title: weakest.title }
      : null;
  const lowConfidence = live.filter(score => score.scoreConfidence && score.scoreConfidence !== 'high').sort((a, b) => a.score - b.score);
  const stale = live.find(score => score.recencyStatus && score.recencyStatus !== 'fresh');
  const nextMissing = lowConfidence
    .flatMap(score => effectiveMissingMarkers(score).filter(item => item.core).map(item => ({ ...item, scoreTitle: score.title })))
    [0]
    || lowConfidence.flatMap(score => effectiveMissingMarkers(score).slice(0, 1).map(item => ({ ...item, scoreTitle: score.title })))[0]
    || waiting.flatMap(score => effectiveMissingMarkers(score).slice(0, 1).map(item => ({ ...item, scoreTitle: score.title })))[0];
  const rows = [
    openFirst ? { label: 'Open first', text: `${openFirst.title}: marker-level explanation behind the most strained domain.`, scoreId: openFirst.id } : null,
    nextMissing ? { label: 'Improve confidence', text: `${markerDisplayLabel(nextMissing)} would improve coverage${nextMissing.scoreTitle ? ` for ${nextMissing.scoreTitle}` : ''}.` } : null,
    stale ? { label: 'Retest together', text: `${stale.title}: ${stale.recencyBadge || 'some inputs are stale or date-mismatched'}.`, scoreId: stale.id } : { label: 'Avoid over-testing', text: 'Advanced and specialty markers add depth; they do not lower baseline Biological Coherence when absent.' },
  ].filter(row => row !== null);
  return `<section class="biology-score-action-summary"><div class="biology-scores-eyebrow">What matters now</div>${rows.map((row) => {
    const inner = `<strong>${escapeHTML(row.label)}</strong><span>${escapeHTML(row.text)}</span>`;
    return row.scoreId
      ? `<button type="button" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(row.scoreId)}">${inner}</button>`
      : `<div>${inner}</div>`;
  }).join('')}</section>`;
}


function renderCoverageMarkerList(markers, emptyText) {
  if (!markers.length) return `<span class="biology-score-token biology-score-token-muted">${escapeHTML(emptyText)}</span>`;
  return markers.map(item => {
    const label = markerDisplayLabel(item);
    const title = item.contextReason || (item.scoreTitle ? `${item.scoreTitle}: ${item.label}` : item.label);
    return `<span class="biology-score-token biology-score-token-muted" title="${escapeAttr(title)}">${escapeHTML(label)}</span>`;
  }).join('');
}

function renderCoverageBundle(title, markers, emptyText) {
  return `<div class="biology-coverage-bundle-card">
    <strong>${escapeHTML(title)}</strong>
    <div class="biology-coverage-marker-list">${renderCoverageMarkerList(markers, emptyText)}</div>
  </div>`;
}

export function renderBiologyScoreCoveragePlanner(detailScores, coherence) {
  const planner = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
  const { baselineCoverage, liveDomains, missingDomains, coreShortlist, optionalUpgrades, advancedDepth, baselineIntro } = planner;
  return `<section class="biology-score-coverage-planner">
    <div class="biology-score-coverage-head">
      <div class="biology-score-coverage-main"><div class="biology-score-coverage-title-row"><div class="biology-score-coverage-metric"><strong>${baselineCoverage}%</strong><span>baseline coverage</span></div><div><h3>Improve lab coverage</h3><p>${escapeHTML(baselineIntro)}</p></div></div></div>
      <div class="biology-score-coverage-actions"><div class="biology-coverage-mini-stats"><span><b>${liveDomains}</b> live core domains</span><span><b>${missingDomains}</b> missing domains</span><span>Advanced depth stays optional</span></div><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-biology-score-action="plan-coverage-chat">Make lab plan</button></div>
      <div class="biology-coverage-progress-row"><div class="biology-coverage-progress" aria-label="Baseline coverage ${baselineCoverage}%"><span style="width:${Math.max(0, Math.min(100, baselineCoverage))}%"></span></div></div>
    </div>
    <div class="biology-coverage-bundle-grid">
      ${renderCoverageBundle('Baseline first', coreShortlist, 'Baseline core markers covered')}
      ${renderCoverageBundle('Optional upgrades', optionalUpgrades, 'No obvious baseline upgrades')}
      ${renderCoverageBundle('Advanced depth', advancedDepth, 'Advanced scores are optional')}
    </div>
  </section>`;
}

export function renderBiologyScoresLens(ctx, computeBiologyScores) {
  if (!hasBiologyScoreContextReview(ctx?.data || {})) return renderBiologyScoreGate('lens');
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
        <p>${escapeHTML(lead)}</p>
        ${contextLabels ? `<div class="biology-score-context-banner"><strong>Active context modifiers</strong>${contextLabels}</div>` : ''}
      </div>
      <span class="biology-scores-count">${live.length}/${detailScores.length} score signals</span></div>
    ${renderBiologicalCoherenceHero(coherence)}
    ${renderBiologyScoresActionSummary(live, waiting, coherence)}
    ${renderBiologyScoreCoveragePlanner(detailScores, coherence)}
    <div class="biology-score-detail-stack">${live.map(renderScoreDetail).join('')}${waiting.length ? `<details class="biology-score-unavailable-group"><summary>Show scores that need more markers or a retest</summary>${waiting.map(renderScoreDetail).join('')}</details>` : ''}</div>
    <p class="biology-scores-note">Educational pattern score only. This is reference/target-pattern coherence, not an outcome-validated diagnosis. Score tone reflects the current marker pattern; confidence reflects core-marker coverage; staleness is tracked separately.</p>
  </div>`;
}
