// @ts-check
// biology-score-render.js — HTML rendering for Biology Score cards, details, and dashboard/lens widgets.

import { specimenLabel } from './biology-score-panel-policy.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { renderScoreAIAnswer, renderScoreAISummary } from './biology-score-sections.js';
import { getBiologyProfileContext } from './profile-context.js';
import { TONE_LABELS, clamp, resolveScoreTone, coreScoreDrivers } from './biology-score-engine.js';
import { renderLensDashboardToggle } from './lens-page-shell.js';
import {
  buildBiologyScoreCoveragePlannerModel,
  effectiveMissingMarkers, optionalMarkerReason,
  effectiveContextMarkers,
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
  if (evidence === 'production') return 'Established marker biology · heuristic score';
  if (evidence === 'contextual') return 'Contextual proxy · heuristic score';
  if (evidence === 'experimental') return 'Exploratory pattern · heuristic score';
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
  else if (coveragePct === 100) coverageValue += ' · core complete';
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

function renderScoreInputs(score) {
  const available = score.available.slice(0, 4).map((item) => renderMarkerToken(item)).join('');
  const missing = score.missing.slice(0, 4).map((item) => renderMarkerToken(item, true)).join('');
  if (!available && !missing) return '';
  return `<div class="biology-score-inputs">
    ${available ? `<div><span class="biology-score-input-label">Seen</span>${available}</div>` : ''}
    ${missing ? `<div><span class="biology-score-input-label">Missing</span>${missing}${score.missing.length > 4 ? `<span class="biology-score-token biology-score-token-muted">+${score.missing.length - 4}</span>` : ''}</div>` : ''}
  </div>`;
}

function rangeText(item) {
  const bound = value => Number.isFinite(value) ? String(Number(Number(value).toPrecision(5))) : '—';
  if (item.range?.min == null && item.range?.max == null) return 'Not available';
  return `${item.range?.min == null ? `≤${bound(item.range?.max)}` : item.range?.max == null ? `≥${bound(item.range?.min)}` : `${bound(item.range.min)}–${bound(item.range.max)}`} ${item.unit || ''}`.trim();
}

export function getScorePresentation(score) {
  score = score.historicalSnapshot || score;
  const historical = !Number.isFinite(score.score) && Number.isFinite(score.rawScore)
    && ['stale', 'mixed-dates'].includes(score.recencyStatus);
  const value = Number.isFinite(score.score) ? score.score : historical ? score.rawScore : null;
  const dates = [...new Set((score.presentationDates || (score.available || []).filter(i => i.core && !i.profileContextOnly).map(i => i.date)).filter(Boolean))].sort();
  const date = text => { const d = new Date(`${text}T00:00:00Z`); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''; };
  const period = dates.length ? dates[0] === dates.at(-1) ? date(dates[0]) : `${date(dates[0])} – ${date(dates.at(-1))}` : '';
  const tone = historical ? score.attention && value >= 70 ? 'strained' : resolveScoreTone(value) : score.tone;
  const status = historical ? score.recencyStatus === 'mixed-dates' ? 'Mixed-date estimate' : 'Historical score'
    : value == null ? 'Needs markers or context' : score.coverage < 1 ? 'Partial panel' : TONE_LABELS[tone] || 'Range fit';
  return { value, historical, period, tone, status };
}

// Priority is a reading order, independent of AI state and clinical urgency.
export function groupBiologyScores(scores) {
  /** @type {{ baseline: any[], advanced: any[], waiting: any[] }} */
  const groups = { baseline: [], advanced: [], waiting: [] };
  const priority = score => {
    const p = getScorePresentation(score);
    return p.historical ? 2 : score.attention || p.value < 70 ? 0 : 1;
  };
  for (const score of scores.filter(s => s.id !== 'biologicalCoherence')) {
    const group = getScorePresentation(score).value == null ? 'waiting' : score.panelTier === 'extended' ? 'advanced' : 'baseline';
    groups[group].push(score);
  }
  for (const group of [groups.baseline, groups.advanced]) group.sort((a, b) => priority(a) - priority(b) || getScorePresentation(a).value - getScorePresentation(b).value || a.title.localeCompare(b.title));
  groups.waiting.sort((a, b) => Number(a.panelTier === 'extended') - Number(b.panelTier === 'extended') || (b.coverage || 0) - (a.coverage || 0) || a.title.localeCompare(b.title));
  return groups;
}

function scoreColor(value, tone = resolveScoreTone(value)) {
  return !Number.isFinite(value) ? 'var(--text-muted)' : tone === 'excellent' || tone === 'good' ? 'var(--green, #34d399)' : tone === 'strained' ? 'var(--yellow, #fbbf24)' : 'var(--red, #f87171)';
}

function renderScoreMetric(score) {
  const { value, tone, historical } = getScorePresentation(score);
  const color = scoreColor(value, tone);
  return `<span class="biology-score-dial${value === 0 ? ' biology-score-dial-zero' : ''}${historical ? ' biology-score-dial-historical' : ''}" style="--score-value:${value ?? 0};--score-color:${color}"><span class="biology-score-dial-number">${value ?? '—'}<small>${value == null ? 'No score yet' : '/100'}</small></span></span>`;
}

function renderReadingFacts(facts) {
  return `<dl class="biology-reading-facts">${facts.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>`;
}

function renderInterpretationNotes(flags = []) {
  return flags.length ? `<details class="biology-reading-notes"><summary>Interpretation notes <span class="biology-section-count">${flags.length}</span></summary><ul>${flags.map(flag => `<li>${escapeHTML(flag)}</li>`).join('')}</ul></details>` : '';
}

function renderMethodology(score) {
  const coreWeight = score.available.filter(i => i.core && !i.profileContextOnly).reduce((n, i) => n + (i.effectiveWeight ?? i.weight ?? 0), 0);
  const familyLabel = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  return `<details class="biology-score-methodology biology-reading-panel"><summary>How this score works</summary><div class="biology-reading-body">
    <p class="biology-reading-lead">${escapeHTML(score.question || score.summary)}</p><p>${escapeHTML(score.methodology || score.summary)}</p>
    ${renderReadingFacts([
      ['Core score', 'Weighted range fit of available core markers. Related measurements share a capped family weight. Missing core markers make the result provisional.'],
      ['Additional markers', 'Support the core pattern, differ from it, or add a separate dimension. More tests do not automatically mean more confidence.'],
      ['Range fit', 'Within the selected range = 100. Departure reduces fit linearly to a minimum of 0. The number describes range agreement, not a health probability.'],
      ['Collection window', 'Current scores use results from the last 180 days, with core draws within 90 days of each other. Older and mixed-date estimates keep their date labels.'],
    ])}
    <div class="biology-reading-source"><span>${escapeHTML(getEvidenceBadge(score.evidence))}</span>${score.sourceUrl ? `<a href="${escapeAttr(score.sourceUrl)}" target="_blank" rel="noopener noreferrer">Biological background ↗</a>` : ''}</div>
    <details class="biology-reading-notes"><summary>Calculation details &amp; weights</summary><p>Two-sided ranges reach 0 one range-width beyond the boundary. One-sided ranges use half the boundary magnitude. Core share is the weight used after grouping related markers. Family budgets stay fixed when an accepted alternative is used. These curves are design choices; core completeness describes inputs, not scientific certainty. Model ${escapeHTML(score.algorithmVersion || 'legacy')}. The expanded-panel fit (${Number.isFinite(score.refinedScore) ? score.refinedScore : 'unavailable'}/100) is a diagnostic calculation over this exact panel, not a confidence measure or a stable trend.</p>
      <div class="biology-score-table-scroll" tabindex="0" role="region" aria-label="Marker weights"><table class="data-table biology-score-table"><thead><tr><th scope="col">Marker</th><th scope="col">Related group</th><th scope="col">Assigned weight</th><th scope="col">Core share</th><th scope="col">Role</th></tr></thead><tbody>${score.available.map(i => `<tr><th scope="row">${escapeHTML(i.label)}</th><td>${escapeHTML(familyLabel(i.evidenceGroup || i.key))}</td><td class="value-cell">${escapeHTML(String(i.configuredWeight ?? i.weight ?? 0))}</td><td class="value-cell">${i.core && !i.profileContextOnly && coreWeight ? `${((i.effectiveWeight ?? i.weight ?? 0) / coreWeight * 100).toFixed(1)}%` : "—"}</td><td>${i.core ? 'Core' : 'Additional'}</td></tr>`).join('')}</tbody></table></div>
    </details></div></details>`;
}

function scoreSentence(score) {
  const presentation = getScorePresentation(score);
  if (presentation.historical) return presentation.period;
  if (!Number.isFinite(score.score)) return score.panelLabel ? `Complete the ${score.panelLabel.toLowerCase()} to score this route.` : 'Review the core markers and collection context in Details.';
  const alerted = score.available.find(i => i.referenceDirection);
  if (alerted) return `${alerted.label} is ${alerted.referenceDirection} its reference range${alerted.profileContextOnly ? ' (context result)' : ''}.`;
  if (score.scoreConfidenceWarning) return score.coverage < 1 ? 'The core panel is incomplete; check the missing inputs in Details.' : 'Collection or profile context limits interpretation; check Details.';
  const weakest = coreScoreDrivers(score)[0]?.item;
  if (weakest?.partial < 35) return `${weakest.label} is far from the selected range.`;
  return weakest && weakest.partial < 100 ? `${weakest.label} contributes most to the lower fit.` : 'Core markers align with your selected ranges.';
}

export function renderScoreDetail(score, options = {}) {
  const coreWeight = score.available.filter(i => i.core && !i.profileContextOnly).reduce((n, i) => n + (i.effectiveWeight || i.weight || 0), 0);
  const row = item => {
    const weight = item.effectiveWeight || item.weight || 0;
    const impact = item.core && !item.profileContextOnly && coreWeight ? (100 - item.partial) * weight / coreWeight : null;
    return `<tr><th scope="row">${renderMarkerTableLink(item)}${specimenLabel(item) || item.method ? `<small>${escapeHTML([specimenLabel(item), item.method].filter(Boolean).join(' · '))}</small>` : ''}</th><td class="value-cell">${escapeHTML(item.displayValue)} <span class="unit-col">${escapeHTML(item.unit || '')}</span></td><td class="ref-col">${escapeHTML(rangeText(item))}<small>${escapeHTML(item.rangeLabel || '')}</small></td><td>${escapeHTML(item.date || 'Unknown')}</td><td><span class="biology-fit-badge" style="--score-color:${scoreColor(item.profileContextOnly ? null : item.partial)}">${item.profileContextOnly ? 'Context only' : `${Math.round(item.partial)}/100`}</span><small>${escapeHTML(item.contextReason || (impact == null ? item.evidenceRole || 'Additional context' : `−${impact.toFixed(1)} core points`))}</small></td></tr>`;
  };
  const table = core => {
    const items = score.available.filter(i => !!i.core === core);
    const missing = effectiveMissingMarkers(score).filter(i => !!i.core === core);
    return `<section class="biology-score-marker-section"><header><h4>${core ? 'Core markers' : 'Additional markers'} <span class="biology-section-count">${items.length}</span></h4><p>${core ? 'These markers determine the headline score.' : 'Optional results add context and help interpret the core panel.'}</p></header>
      ${items.length ? `<p class="biology-table-scroll-hint">Swipe or scroll sideways for dates and contributions ↔</p><div class="biology-score-table-scroll" tabindex="0" role="region" aria-label="${core ? 'Core' : 'Additional'} marker results"><table class="data-table biology-score-table"><thead><tr><th scope="col">Marker</th><th scope="col">Result</th><th scope="col">Scoring range</th><th scope="col">Collected</th><th scope="col">Range fit / contribution</th></tr></thead><tbody>${items.map(row).join('')}</tbody></table></div>` : '<p>No results yet.</p>'}
      ${missing.length ? `<p class="biology-score-missing"><strong>Missing:</strong> ${missing.map(i => escapeHTML(i.coreGroupLabel || i.label)).join(', ')}</p>` : ''}</section>`;
  };
  const status = `${score.coreCovered ?? 0}/${score.coreTotal ?? 0} core · ${score.optionalAvailable ?? 0} additional${score.evidence === 'experimental' ? ' · Exploratory' : ''}`;
  const presentation = getScorePresentation(score);
  return `<article class="biology-score-detail biology-score-compact" id="biology-score-${escapeAttr(score.id)}">
    <div class="biology-score-summary"><span class="biology-score-title">${escapeHTML(score.title)}${score.panelLabel || score.scopeLabel ? `<small class="biology-score-scope">${escapeHTML(score.panelLabel || score.scopeLabel)}</small>` : ''}</span>${renderScoreMetric(score)}<span class="biology-score-summary-copy"><strong>${escapeHTML(presentation.status)}</strong><span>${escapeHTML(scoreSentence(score))}</span></span>${renderScoreAISummary(score)}<span class="biology-score-summary-footer"><span class="biology-score-footer-meta">${renderMembershipBadge(score)}<small>${escapeHTML(status)}</small></span><button type="button" class="biology-score-details-label" data-biology-score-action="toggle-score" aria-expanded="false" aria-controls="biology-score-panel-${escapeAttr(score.id)}" aria-label="Details for ${escapeAttr(score.title)}">Details <span aria-hidden="true">⌄</span></button></span></div>
    <div class="biology-score-expanded" id="biology-score-panel-${escapeAttr(score.id)}">
      <div class="biology-score-detail-tools"><!--score-tools-->${options.showDashboardToggle ? renderLensDashboardToggle(`biology-score-${score.id}`) : ''}</div>
      ${presentation.historical ? `<p class="biology-score-history-note">${escapeHTML(presentation.status)} · ${escapeHTML(presentation.period)}. ${escapeHTML(score.recencyMessage || 'Not a current, simultaneous panel.')}</p>` : ''}
      <div class="biology-score-detail-heading"><h3>${escapeHTML(score.title)}</h3>${score.boundary ? `<p>${escapeHTML(score.boundary)}</p>` : ''}</div>
      <div class="biology-score-ai-details">${renderScoreAIAnswer(score)}</div>
      ${renderInterpretationNotes(score.flags)}
      ${table(true)}${table(false)}
      ${score.descriptiveRatio ? `<p>${escapeHTML(score.descriptiveRatio.label)}: ${escapeHTML(score.descriptiveRatio.value)} · ${escapeHTML(score.descriptiveRatio.date)} · context only</p>` : ''}
      ${renderMethodology(score)}
    </div>
  </article>`;
}

function renderScoreCard(score) {
  const tone = score.tone || 'unknown';
  const scoreValue = String(getScorePresentation(score).value ?? '—');
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

function renderOverviewMembership(score) {
  if (!score.membership?.length) return '';
  const included = score.membership.filter(item => item.included).length;
  return `<details id="biology-score-membership" class="biology-overview-membership biology-reading-panel"><summary>Overview contributors <span class="biology-membership-count">${included}/${score.membership.length} included</span></summary><div class="biology-reading-body"><p>13 baseline scores form 12 domains. Iron Handling and Blood Flow Context share the blood domain.</p><div class="biology-membership-list">${score.membership.map(item => `<button type="button" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(item.id)}"><span>${escapeHTML(item.title)}${item.domain === 'blood' ? '<small>Shared blood domain</small>' : ''}</span><span class="biology-membership-badge" data-overview-membership="${item.included ? 'included' : 'excluded'}">${escapeHTML(item.label)}</span></button>`).join('')}</div></div></details>`;
}

function renderMembershipBadge(score) {
  const membership = score.overviewMembership;
  return membership ? `<span class="biology-membership-badge" data-overview-membership="${membership.optional ? 'optional' : membership.included ? 'included' : 'excluded'}">${escapeHTML(membership.label)}</span>` : '';
}

function renderBiologicalCoherenceHero(score) {
  if (!score) return '';
  const sourceScore = score;
  score = score.historicalSnapshot || score;
  const domains = (score.available || []).filter(item => Number.isFinite(item.partial));
  const presentation = getScorePresentation(score);
  const explanation = score.anchorWarning || (presentation.historical ? `${presentation.status} · ${presentation.period}` : score.coverage < 1 ? 'Your available core domains, brought together.' : 'Your core domains at a glance.');
  return `<section class="biology-coherence-hero biology-coherence-visual" id="biology-score-biologicalCoherence">
    <div class="biology-coherence-overview">${renderScoreMetric(score)}<div><h2>Biological Coherence</h2><p>${escapeHTML(explanation)}</p><small>${domains.length}/${domains.length + score.missing.length} domains · ${Math.round(score.coverage * 100)}% core coverage</small></div></div>
    <div class="biology-coherence-ai">${renderScoreAISummary(sourceScore)}<p class="biology-scores-note">AI runs when requested. Update missing insights reuses saved answers; provider charges may apply. Scores are calculated locally.</p></div>
    ${domains.length ? `<div class="biology-coherence-domains">${domains.map(item => `<button type="button" class="biology-coherence-domain-row" style="--score-color:${scoreColor(item.partial)}" title="${item.partial}/100 · Open ${escapeAttr(item.label)}" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(item.primaryScoreId || '')}"><span class="biology-domain-label">${escapeHTML(item.label)}</span><span class="biology-domain-meter" aria-hidden="true"><span style="width:${clamp(item.partial, 0, 100)}%"></span></span><strong>${item.partial}</strong></button>`).join('')}</div>` : ''}
    ${renderOverviewMembership(sourceScore)}
    <details class="biology-coherence-interpretation"><summary>Explanation</summary>${renderScoreAIAnswer(sourceScore)}</details>
    <details class="biology-coherence-breakdown"><summary>How the overview works</summary>
      <div class="biology-reading-body">${renderReadingFacts([
        ['What is combined', '13 baseline scores form 12 domains: Iron Handling and Blood Flow Context share one domain. An overview needs at least 3 domains and 25% core coverage. Available domain results remain visible below that threshold. Excluded domains remain reflected in coverage; open Overview contributors to see exactly which scores are included.'],
        ['What the colors mean', 'Green: strong range fit (70–100). Amber: review pattern (50–69). Red: lower range fit (0–49). These describe range agreement, not clinical severity.'],
        ['Coverage stays separate', 'Missing core inputs reduce coverage. Additional tests add context without increasing a domain’s vote. Five optional scores stay outside the baseline.'],
        ['Dates stay visible', presentation.historical ? `${presentation.status}: ${presentation.period}. This estimate combines the available historical results, not a current simultaneous panel.` : 'Current domains use the collection-date limits. Historical and mixed-date estimates are labeled separately.'],
      ])}${renderInterpretationNotes(score.flags)}<div class="biology-reading-source">${renderLensDashboardToggle('biology-score-biologicalCoherence')}</div></div>
    </details>
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

function renderDashboardScoreHeadline(score, meta, detailLine) {
  const presentation = getScorePresentation(score);
  return `<button type="button" class="db-hero-bio db-hero-biology-score" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(score.id)}" aria-label="Open ${escapeAttr(score.title)} in Biology Scores lens">
    <span class="db-hero-bio-left"><span class="db-hero-bio-num">${presentation.value ?? '—'}<small>/100</small></span><span class="db-hero-bio-label"><span class="top">${escapeHTML(presentation.status)}</span><span class="actual">${escapeHTML(meta)}</span><span class="delta">${escapeHTML(detailLine)}</span></span></span>
    <span class="db-hero-bio-right">${renderDashboardScoreRail(presentation.value, presentation.tone)}<span class="db-hero-scale"><span>0</span><span>50</span><span>100</span></span></span>
  </button>`;
}

export function renderDashboardBiologyScoreWidget(ctx, scoreId, computeBiologyScores) {
  const score = computeBiologyScores(ctx?.data || {}).find(item => item.id === scoreId);
  if (!score) return '';
  const presentation = getScorePresentation(score);
  const meta = `${score.coreCovered ?? 0}/${score.coreTotal ?? 0} core${score.overviewMembership ? ` · ${score.overviewMembership.label}` : ''}`;
  const detail = presentation.historical ? `${presentation.period}. Open to review the markers.` : scoreSentence(score);
  return renderDashboardScoreHeadline(score, meta, detail);
}

export function renderDashboardBiologicalCoherenceWidget(ctx, computeBiologyScores) {
  const currentScore = computeBiologyScores(ctx?.data || {}).find(item => item.id === 'biologicalCoherence');
  const score = currentScore?.historicalSnapshot || currentScore;
  if (!score) return '';
  const domains = (score.available || []).filter(item => Number.isFinite(item.partial)).sort((a, b) => Number(b.partial || 0) - Number(a.partial || 0));
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
      <div class="bc-micro-domain-bar" aria-hidden="true"><div style="width:${pct}%;background:${scoreColor(pct)}" class="bc-micro-domain-fill bc-micro-domain-fill-${pct >= 70 ? 'good' : pct >= 50 ? 'fair' : 'poor'}"></div></div>
      <span class="bc-micro-domain-score">${Math.round(pct)}</span>
    </div>`;
  }).join('');
  const insight = weakest ? `Review first: ${weakest.label} (${weakest.partial}/100).` : 'Open Biology Scores to review missing markers or collection context.';
  const presentation = getScorePresentation(score);
  const meta = `${domains.length}/${domains.length + missingCount} domains${presentation.historical ? ` · ${presentation.period}` : ''}`;
  return `<section class="db-bio-coherence-hero">
    ${renderDashboardScoreHeadline(score, meta, insight)}
    ${domainMicroBars ? `<div class="db-bio-coherence-domains">${domainMicroBars}</div>` : ''}
  </section>`;
}

/** Legacy summary widget — still exported for backward compatibility. The dashboard
 * now uses renderDashboardBiologyScoreWidget for individual score cards and
 * renderDashboardBiologicalCoherenceWidget for the coherence hero. */
export function renderBiologyScoresWidget(ctx, computeBiologyScores) {
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
  if (!live.length && !waiting.length) return '';
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
  const stale = waiting.find(score => score.recencyStatus && score.recencyStatus !== 'fresh');
  const nextMissing = lowConfidence
    .flatMap(score => effectiveMissingMarkers(score).filter(item => item.core).map(item => ({ ...item, scoreTitle: score.title })))
    [0]
    || lowConfidence.flatMap(score => effectiveMissingMarkers(score).slice(0, 1).map(item => ({ ...item, scoreTitle: score.title })))[0]
    || waiting.flatMap(score => effectiveMissingMarkers(score).slice(0, 1).map(item => ({ ...item, scoreTitle: score.title })))[0];
  const contextCheck = [...live, ...waiting].filter(s => s.panelTier !== 'extended').flatMap(s => effectiveContextMarkers(s, { unresolvedOnly: true }).filter(i => i.core).map(i => ({ ...i, score: s })))[0];
  const rows = [
    openFirst ? { label: 'Open first', text: `${openFirst.title}: lowest range fit in your available results.`, scoreId: openFirst.id } : null,
    contextCheck ? { label: 'Review collection context', text: `${contextCheck.score.title}: ${markerDisplayLabel(contextCheck)} needs collection or profile details. Check the existing result before ordering more tests.`, scoreId: contextCheck.score.id } : nextMissing ? { label: 'Complete the core panel', text: `${markerDisplayLabel(nextMissing)} would improve coverage${nextMissing.scoreTitle ? ` for ${nextMissing.scoreTitle}` : ''}.` } : null,
    stale ? { label: 'Retest together', text: `${stale.title}: ${stale.recencyBadge || 'some inputs are stale or date-mismatched'}.`, scoreId: stale.id } : null,
  ].filter(row => row !== null);
  return `<details open class="biology-score-action-summary biology-planning-card"><summary>Suggested next checks</summary><div class="biology-next-checks">${rows.map((row) => {
    const inner = `<strong>${escapeHTML(row.label)}${row.scoreId ? ' <span aria-hidden="true">↗</span>' : ''}</strong><span>${escapeHTML(row.text)}</span>`;
    return row.scoreId
      ? `<button type="button" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(row.scoreId)}">${inner}</button>`
      : `<div>${inner}</div>`;
  }).join('')}</div></details>`;
}


function renderCoverageMarkerList(markers, emptyText) {
  if (!markers.length) return `<span class="biology-score-token biology-score-token-muted">${escapeHTML(emptyText)}</span>`;
  return markers.map(item => {
    const label = markerDisplayLabel(item);
    const title = item.contextReason || (!item.core ? optionalMarkerReason(item) : '') || (item.scoreTitle ? `${item.scoreTitle}: ${item.label}` : item.label);
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
  const { baselineCoverage, coreShortlist, optionalUpgrades, advancedDepth, baselineIntro } = planner;
  return `<details open id="biology-score-coverage" class="biology-score-coverage-planner biology-planning-card"><summary>Plan additional labs</summary>
    <div class="biology-score-coverage-head">
      <div class="biology-score-coverage-main"><div class="biology-score-coverage-title-row"><div class="biology-score-coverage-metric"><strong>${baselineCoverage}%</strong><span>baseline coverage</span></div><div><p>${escapeHTML(baselineIntro)}</p></div></div></div>
      <div class="biology-score-coverage-actions"><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-biology-score-action="plan-coverage-chat">Make lab plan</button></div>
      <div class="biology-coverage-progress-row"><div class="biology-coverage-progress" role="progressbar" aria-label="Baseline coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${baselineCoverage}"><span style="width:${Math.max(0, Math.min(100, baselineCoverage))}%"></span></div></div>
    </div>
    ${!coreShortlist.length && optionalUpgrades.length ? `<div class="biology-coverage-questions">${optionalUpgrades.slice(0, 2).map(item => `<p><strong>${escapeHTML(markerDisplayLabel(item))}</strong> · ${escapeHTML(optionalMarkerReason(item))}</p>`).join('')}</div>` : ''}
    ${coreShortlist.length ? `<div class="biology-coverage-priority">${renderCoverageBundle('Baseline first', coreShortlist.slice(0, 4), '')}</div>` : ''}
    <details class="biology-reading-notes biology-coverage-more"><summary>All suggested markers &amp; optional extras</summary><div class="biology-coverage-bundle-grid">
      ${renderCoverageBundle('Baseline first', coreShortlist, 'Baseline core markers covered')}
      ${renderCoverageBundle('Optional context', optionalUpgrades, 'No obvious baseline upgrades')}
      ${renderCoverageBundle('Optional score panels', advancedDepth, 'Optional score markers covered')}
    </div></details>
  </details>`;
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
        <p>${escapeHTML(lead)}</p>
        ${contextLabels ? `<div class="biology-score-context-banner"><strong>Active context modifiers</strong>${contextLabels}</div>` : ''}
      </div>
      <span class="biology-scores-count">${live.length}/${detailScores.length} score signals</span></div>
    ${renderBiologicalCoherenceHero(coherence)}
    ${renderBiologyScoresActionSummary(live, waiting, coherence)}
    ${renderBiologyScoreCoveragePlanner(detailScores, coherence)}
    <div class="biology-score-detail-stack">${detailScores.map(score => renderScoreDetail(score, { showDashboardToggle: true })).join('')}</div>
    <p class="biology-scores-note">Educational pattern score only. This is reference/target-pattern coherence, not an outcome-validated diagnosis. Score tone reflects the current marker pattern; confidence reflects core-marker coverage; staleness is tracked separately.</p>
  </div>`;
}
