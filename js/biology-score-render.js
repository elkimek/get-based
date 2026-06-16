// @ts-check
// biology-score-render.js — HTML rendering for Biology Score cards, details, and dashboard/lens widgets.

import { escapeAttr, escapeHTML } from './utils.js';
import { renderScoreAIAnswer, renderScoreQuestion } from './biology-score-sections.js';
import { getBiologyProfileContext } from './profile-context.js';
import { TONE_LABELS, clamp } from './biology-score-engine.js';

function getMarkerTitle(item) {
  return item.displayValue != null
    ? `${item.label}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}`
    : item.label;
}

function renderMarkerToken(item, muted = false) {
  const title = getMarkerTitle(item);
  if (item.id && !muted) {
    return `<button type="button" class="biology-score-token" title="${escapeAttr(title)}" data-biology-score-action="open-marker" data-biology-marker-id="${escapeAttr(item.id)}">${escapeHTML(item.label)}</button>`;
  }
  return `<span class="biology-score-token${muted ? ' biology-score-token-muted' : ''}" title="${escapeAttr(title)}">${escapeHTML(item.label)}</span>`;
}

function renderMarkerTableLink(item) {
  const title = getMarkerTitle(item);
  if (item.id) {
    return `<button type="button" class="biology-score-marker-link" title="${escapeAttr(title)}" data-biology-score-action="open-marker" data-biology-marker-id="${escapeAttr(item.id)}">${escapeHTML(item.label)}</button>`;
  }
  return `<span class="biology-score-marker-link-static" title="${escapeAttr(title)}">${escapeHTML(item.label)}</span>`;
}

function renderScoreStatusItem(kind, label, value, tone = '') {
  return `<span class="biology-score-status biology-score-status-${escapeAttr(kind)}${tone ? ` biology-score-status-${escapeAttr(tone)}` : ''}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></span>`;
}

function renderScoreStatusMeta(score, { weighted = false } = {}) {
  const recencyInvalid = score.recencyStatus && score.recencyStatus !== 'fresh';
  const parts = [];
  if (!recencyInvalid) parts.push(renderScoreStatusItem('tone', 'Pattern', score.tone ? TONE_LABELS[score.tone] : 'Need inputs', score.tone || 'unknown'));
  parts.push(renderScoreStatusItem('coverage', 'Coverage', `${Math.round((score.coverage || 0) * 100)}%${weighted ? ' weighted' : ''}`, score.coverageLabel || 'low'));
  if (recencyInvalid) parts.push(renderScoreStatusItem('recency', 'Recency', score.recencyBadge || 'Retest needed', score.recencyStatus || 'stale'));
  return `<div class="biology-score-meta">${parts.join('')}</div>`;
}

function renderScoreRail(score, tone) {
  const left = Number.isFinite(score) ? clamp(score, 0, 100) : 0;
  return `<div class="biology-score-rail" aria-hidden="true">
    <div class="biology-score-rail-fill"></div>
    ${Number.isFinite(score) ? `<span class="biology-score-pin biology-score-pin-${escapeAttr(tone || 'unknown')}" style="left: calc(${left}% - 5px)"></span>` : ''}
  </div>`;
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
  const flags = score.flags?.length
    ? `<div class="biology-score-flags"><div class="biology-score-input-label">Interpretation flags</div>${score.flags.map((flag) => `<p>${escapeHTML(flag)}</p>`).join('')}</div>`
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
    ${renderScoreAIAnswer(score)}
    ${renderScoreRail(score.score, score.tone)}
    ${renderScoreStatusMeta(score, { weighted: true })}
    <details class="biology-score-debug"><summary><span>See what’s driving this</span></summary><div class="biology-score-detail-grid">
      <div>
        <div class="biology-score-input-label">Inputs affecting the score</div>
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
  return `<article class="biology-score-card biology-score-card-${escapeAttr(tone)}">
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
  const domainRows = domains.slice(0, 8).map((item) => `<div class="biology-coherence-domain-row"><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(String(Math.round(item.partial || 0)))}</strong></div>`).join('');
  const summaryItems = [
    strongest ? ['Strongest', `${strongest.label} (${Math.round(strongest.partial || 0)}/100)`] : null,
    weakest && weakest !== strongest ? ['Most strained', `${weakest.label} (${Math.round(weakest.partial || 0)}/100)`] : null,
    ['Minimum panel', missingCount ? `${missingCount} domain${missingCount === 1 ? '' : 's'} still missing` : 'Domains live'],
  ].filter(Boolean);
  return `<section class="biology-coherence-hero biology-score-card-${escapeAttr(score.tone || 'unknown')}" id="biology-score-${escapeAttr(score.id)}">
    <div class="biology-coherence-copy">
      <div class="biology-scores-eyebrow">System-level score</div>
      <h2>${escapeHTML(score.title)}</h2>
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

export function renderDashboardBiologyScoreWidget(ctx, scoreId, computeBiologyScores) {
  const score = computeBiologyScores(ctx?.data || {}).find(item => item.id === scoreId);
  if (!score) return '';
  const scoreValue = Number.isFinite(score.score) ? String(score.score) : '—';
  const tone = score.tone || 'unknown';
  const toneLabel = score.tone ? TONE_LABELS[score.tone] : 'Need inputs';
  const coveragePct = Math.round((score.coverage || 0) * 100);
  const strongestImpact = score.available
    .map(item => ({ item, impact: Number(item.weight || 0) * (100 - Number(item.partial || 0)) }))
    .sort((a, b) => b.impact - a.impact)[0]?.item;
  const detailLine = strongestImpact && Number(strongestImpact.partial) < 100
    ? `Main drag: ${strongestImpact.label} (${Math.round(strongestImpact.partial)}/100 fit)`
    : score.missing?.length
      ? `${score.missing.length} mapped input${score.missing.length === 1 ? '' : 's'} missing`
      : 'No active marker drag';
  const railScore = Number.isFinite(score.score) ? clamp(score.score, 0, 100) : 0;
  return `<button type="button" class="db-hero-bio db-hero-biology-score db-hero-biology-score-${escapeAttr(tone)}" data-biology-score-action="open-lens" aria-label="Open Biology Scores lens for ${escapeAttr(score.title)}">
    <div class="db-hero-bio-left">
      <div class="db-hero-bio-num">${escapeHTML(scoreValue)}</div>
      <div class="db-hero-bio-label">
        <span class="top">${escapeHTML(score.title)}</span>
        <span class="actual">${escapeHTML(toneLabel)} · ${coveragePct}% coverage</span>
        <span class="delta">${escapeHTML(detailLine)}</span>
      </div>
    </div>
    <div class="db-hero-bio-right">
      <div class="db-hero-row"><span>Inputs</span><strong>${score.available.length}/${score.available.length + score.missing.length || 0}</strong></div>
      <div class="db-hero-row"><span>Recency</span><strong>${escapeHTML(score.recencyBadge || 'Dates aligned')}</strong></div>
      <div class="db-hero-bio-bar biology-score-rail-mini"><div style="width:${railScore.toFixed(0)}%"></div></div>
      <div class="db-hero-scale"><span>0</span><span>50</span><span>100</span></div>
    </div>
  </button>`;
}

export function renderBiologyScoresWidget(ctx, options = {}, computeBiologyScores) {
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
    ${options.hideOpenLens ? '' : `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary biology-scores-open" data-biology-score-action="open-lens">Open full Biology Scores lens</button>`}
    <p class="biology-scores-note">Educational pattern score only. Score tone reflects the current marker pattern, coverage reflects missing inputs, and staleness is tracked separately.</p>
  </div>`;
}

export function renderBiologyScoresLens(ctx, computeBiologyScores) {
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
    <div class="biology-score-detail-stack">${live.map(renderScoreDetail).join('')}${waiting.length ? `<details class="biology-score-unavailable-group"><summary>Show scores that need more markers or a retest</summary>${waiting.map(renderScoreDetail).join('')}</details>` : ''}</div>
    <p class="biology-scores-note">Educational pattern score only. Score tone reflects the current marker pattern, coverage reflects missing inputs, and staleness is tracked separately.</p>
  </div>`;
}
