// lab-order-render.js — render controlled lab order cards in chat.

import { escapeHTML } from './utils.js';

function formatCzk(value) {
  if (value == null || value === '') return 'TBD';
  const n = Number(value) || 0;
  return `${n.toLocaleString('cs-CZ')} Kč`;
}

function providerLabel(draft) {
  if (draft.providerName) return draft.providerName;
  if (draft.providerId === 'cz.unilabs') return 'Unilabs.cz';
  if (draft.providerId === 'cz.labshop' || draft.provider === 'labshop' || draft.provider === 'cz.labshop') return 'Labshop';
  return 'Lab';
}

function statusLabel(status = 'draft') {
  return {
    draft: 'Draft',
    provider_selection: 'Compare labs',
    preparing: 'Preparing cart…',
    cart_created: 'Cart prepared',
    failed: 'Handoff boundary',
    cancelled: 'Cancelled',
  }[status] || status;
}

function joinCopySections(sections) {
  return sections.filter(Boolean).join('\n');
}

function markerLabel(marker) {
  return marker.displayName || marker.markerKey || marker;
}

function summarizeMarkerNames(markerKeys = [], markerNameByKey = new Map(), limit = 6) {
  const names = markerKeys.map(markerKey => markerNameByKey.get(markerKey) || markerKey.split('.').pop() || markerKey);
  const visible = names.slice(0, limit).join(', ');
  const hidden = names.length - limit;
  return hidden > 0 ? `${visible}, +${hidden} more` : visible;
}

function summarizeMissingDiagnostics(comparison, markerNameByKey) {
  const missingKeys = comparison?.missingMarkerKeys || [];
  if (!missingKeys.length) return '<em>Full requested coverage</em>';
  const names = summarizeMarkerNames(missingKeys, markerNameByKey);
  const labels = [...new Set(missingKeys
    .map(markerKey => comparison.cells?.[markerKey]?.diagnosticLabel)
    .filter(Boolean))];
  const detail = labels.length ? ` · ${labels.slice(0, 2).join(' / ')}` : '';
  return `<em>Not verified ${escapeHTML(String(missingKeys.length))}: ${escapeHTML(names)}${escapeHTML(detail)}</em>`;
}

function providerCatalogueWarning(comparisons = []) {
  if (!comparisons.length) return '';
  const emptyProviders = comparisons.filter(c => c && c.catalogueLoaded === false && Number(c.offerCount || 0) === 0);
  if (!emptyProviders.length) return '';
  const names = emptyProviders.map(c => c.name || c.providerId).join(', ');
  return `Provider catalogue not loaded for ${names}. Refresh the private catalogue in local dev, then reload the page.`;
}

function renderRequestedMarkers(draft) {
  const markers = Array.isArray(draft.requestedMarkers) ? draft.requestedMarkers : [];
  if (!markers.length) return '';
  const hasCalculatedMarkers = Array.isArray(draft.calculatedMarkers) && draft.calculatedMarkers.length > 0;
  const visibleLimit = 12;
  const visibleMarkers = markers.slice(0, visibleLimit);
  const hiddenMarkers = markers.slice(visibleLimit);
  const visibleHtml = visibleMarkers.map(m => `<span>${escapeHTML(markerLabel(m))}</span>`).join('');
  const overflowHtml = hiddenMarkers.length
    ? `<span class="lab-order-marker-overflow">+${escapeHTML(String(hiddenMarkers.length))} more</span>`
    : '';
  const allMarkersHtml = hiddenMarkers.length
    ? `<details class="lab-order-marker-details">
      <summary>Show all ${escapeHTML(String(markers.length))} ${hasCalculatedMarkers ? 'orderable' : 'requested'} tests</summary>
      <div class="lab-order-marker-list">${markers.map(m => `<span>${escapeHTML(markerLabel(m))}</span>`).join('')}</div>
    </details>`
    : '';
  return `<div class="lab-order-requested">
    <div class="lab-order-requested-head">
      <span>${hasCalculatedMarkers ? 'Orderable tests' : 'Requested tests'}</span>
      <strong>${escapeHTML(String(markers.length))}</strong>
    </div>
    <div class="lab-order-markers">${visibleHtml}${overflowHtml}</div>
    ${allMarkersHtml}
  </div>`;
}

function renderCalculatedMarkers(draft) {
  const markers = Array.isArray(draft.calculatedMarkers) ? draft.calculatedMarkers : [];
  if (!markers.length) return '';
  return `<div class="lab-order-calculated">
    <div class="lab-order-requested-head">
      <span>Calculated after results</span>
      <strong>${escapeHTML(String(markers.length))}</strong>
    </div>
    <div class="lab-order-markers">${markers.map(m => `<span>${escapeHTML(markerLabel(m))}</span>`).join('')}</div>
  </div>`;
}

function renderProviderRecommendation(draft) {
  const rec = draft.providerRecommendation;
  if (!rec?.bestCoverage && !rec?.cheapestComplete && !rec?.cheapestSplit) return '';
  const markerNameByKey = new Map((draft.requestedMarkers || []).map(m => [m.markerKey, m.displayName || m.markerKey]));
  const best = rec.bestCoverage ? `<div class="lab-provider-recommendation-row">
    <span>Best coverage</span>
    <strong>${escapeHTML(rec.bestCoverage.name || rec.bestCoverage.providerId)} · ${escapeHTML(String(rec.bestCoverage.coveredCount))}/${escapeHTML(String(rec.bestCoverage.requestedCount))} tests · ${escapeHTML(formatCzk(rec.bestCoverage.totalEstimateCzk))}</strong>
  </div>` : '';
  const cheapestComplete = rec.cheapestComplete ? `<div class="lab-provider-recommendation-row">
    <span>Cheapest complete single lab</span>
    <strong>${escapeHTML(rec.cheapestComplete.name || rec.cheapestComplete.providerId)} · ${escapeHTML(formatCzk(rec.cheapestComplete.totalEstimateCzk))}</strong>
  </div>` : '';
  const splitLabel = (rec.cheapestSplit?.providerCount || 0) > 1 ? 'Cheapest complete split' : 'Cheapest complete option';
  const split = rec.cheapestSplit?.complete ? `<div class="lab-provider-recommendation-row split">
    <span>${escapeHTML(splitLabel)}</span>
    <strong>${escapeHTML(formatCzk(rec.cheapestSplit.totalEstimateCzk))}</strong>
    <div class="lab-provider-split-lines">
      ${rec.cheapestSplit.providers.map(provider => `<div>${escapeHTML(provider.name || provider.providerId)}: ${escapeHTML((provider.markerKeys || []).map(markerKey => markerNameByKey.get(markerKey) || markerKey).join(', '))} · ${escapeHTML(formatCzk(provider.totalEstimateCzk))}</div>`).join('')}
    </div>
  </div>` : '';
  return `<div class="lab-provider-recommendation">
    ${best}
    ${cheapestComplete}
    ${split}
  </div>`;
}

function renderProviderSelection(draft, msgIndex) {
  const options = Array.isArray(draft.providerOptions) ? draft.providerOptions : [];
  const comparisons = Array.isArray(draft.providerComparisons) ? draft.providerComparisons : [];
  const catalogueWarning = providerCatalogueWarning(comparisons);
  const markerNameByKey = new Map((draft.requestedMarkers || []).map(m => [m.markerKey, markerLabel(m)]));
  const optionHtml = options.map(option => {
    const comparison = comparisons.find(c => c.providerId === option.providerId);
    const coverage = comparison
      ? `<span>Coverage: ${escapeHTML(String(comparison.coveredCount))}/${escapeHTML(String(comparison.requestedCount))} verified online offers · ${escapeHTML(formatCzk(comparison.totalEstimateCzk))}</span>`
      : `<span>${escapeHTML(option.summary || 'Show tests')}</span>`;
    const missing = summarizeMissingDiagnostics(comparison, markerNameByKey);
    return `<button type="button" class="lab-provider-option-card" data-lab-order-action="select-provider" data-lab-provider-id="${escapeHTML(option.providerId)}" data-msg-index="${msgIndex}">
    <span class="lab-provider-option-main">
      <strong>${escapeHTML(option.name || option.providerId)}</strong>
      ${coverage}
    </span>
    <span class="lab-provider-option-meta">${comparison ? missing : ''}</span>
  </button>`;
  }).join('');
  const comparisonHtml = comparisons.length ? `<div class="lab-provider-comparison">
    <div class="lab-order-kicker">Coverage and price comparison</div>
    ${catalogueWarning ? `<div class="lab-order-warning">${escapeHTML(catalogueWarning)}</div>` : ''}
    ${comparisons.map(c => `<div class="lab-provider-comparison-row">
      <span>${escapeHTML(c.name || c.providerId)}</span>
      <strong>${escapeHTML(String(c.coveredCount))}/${escapeHTML(String(c.requestedCount))} verified · ${escapeHTML(formatCzk(c.totalEstimateCzk))}</strong>
    </div>`).join('')}
  </div>` : '';
  return `<div class="lab-order-card" data-lab-order-id="${escapeHTML(draft.id || '')}">
    <div class="lab-order-head">
      <div>
        <div class="lab-order-kicker">Lab comparison</div>
        <div class="lab-order-title">Choose lab</div>
      </div>
      <span class="lab-order-status">Compare labs</span>
    </div>
    ${renderRequestedMarkers(draft)}
    ${renderCalculatedMarkers(draft)}
    ${comparisonHtml}
    ${renderProviderRecommendation(draft)}
    <div class="lab-provider-options">${optionHtml}</div>
    <div class="lab-order-boundary">${escapeHTML(draft.safetyBoundary || 'Choose a lab first. Final booking/payment stays user-in-loop.')}</div>
  </div>`;
}

export function renderLabPlanCard(plan, msgIndex) {
  if (!plan || !Array.isArray(plan.markers) || !plan.markers.length) return '';
  const markers = plan.markers;
  const visibleLimit = 8;
  const visible = markers.slice(0, visibleLimit);
  const hidden = markers.length - visible.length;
  const markerHtml = visible.map(marker => `<div class="lab-plan-marker">
    <strong>${escapeHTML(marker.displayName || marker.markerKey)}</strong>
    <span>${escapeHTML(marker.reason || 'Suggested from this conversation.')}</span>
  </div>`).join('');
  const moreHtml = hidden > 0 ? `<div class="lab-plan-more">+${escapeHTML(String(hidden))} more markers in this plan</div>` : '';
  const alreadyCompared = plan.status === 'compared';
  const isBusy = plan.status === 'mapping_nclp' || plan.status === 'comparing_labs';
  const actionsHtml = alreadyCompared
    ? '<div class="lab-plan-more">Lab comparison is shown below.</div>'
    : isBusy
      ? `<div class="lab-order-actions lab-order-actions-busy">
        <button type="button" class="lab-order-primary is-loading" data-lab-order-action="compare-labs-from-plan" data-msg-index="${msgIndex}" disabled aria-busy="true">Comparing labs…</button>
        <span class="lab-order-progress-note">${escapeHTML(plan.statusMessage || 'Checking lab catalogues. This can take a few seconds.')}</span>
      </div>`
      : `<div class="lab-order-actions">
      <button type="button" class="lab-order-primary" data-lab-order-action="compare-labs-from-plan" data-msg-index="${msgIndex}">Compare labs</button>
      <button type="button" class="lab-order-secondary" data-lab-order-action="dismiss-lab-plan" data-msg-index="${msgIndex}">Not now</button>
    </div>`;
  return `<div class="lab-order-card lab-plan-card" data-lab-plan-id="${escapeHTML(plan.id || '')}">
    <div class="lab-order-head">
      <div>
        <div class="lab-order-kicker">Next blood draw</div>
        <div class="lab-order-title">${escapeHTML(plan.title || 'Suggested lab plan')}</div>
      </div>
      <span class="lab-order-status${isBusy ? ' is-loading' : ''}">${alreadyCompared ? 'Plan compared' : isBusy ? 'Comparing labs…' : 'Plan first'}</span>
    </div>
    <div class="lab-plan-markers">${markerHtml}${moreHtml}</div>
    <div class="lab-order-boundary">${escapeHTML(plan.safetyBoundary || 'Review the plan before comparing labs or ordering.')}</div>
    ${actionsHtml}
  </div>`;
}

export function renderLabAdjunctCards(msg, msgIndex) {
  if (!msg || msg.role !== 'assistant') return '';
  if (msg.labOrderDraft) return renderLabOrderCard(msg.labOrderDraft, msgIndex);
  if (msg.labPlanDraft) return renderLabPlanCard(msg.labPlanDraft, msgIndex);
  return '';
}

export function buildLabPlanCopyText(plan) {
  if (!plan || !Array.isArray(plan.markers) || !plan.markers.length) return '';
  const lines = [
    plan.title || 'Suggested lab plan',
    '',
    ...plan.markers.map(marker => {
      const reason = marker.reason ? ` — ${marker.reason}` : '';
      return `- ${markerLabel(marker)}${reason}`;
    }),
  ];
  if (plan.safetyBoundary) lines.push('', plan.safetyBoundary);
  return lines.join('\n');
}

export function buildLabOrderCopyText(draft) {
  if (!draft) return '';
  if (draft.status === 'provider_selection' || draft.provider === 'provider_selection') {
    const markerNameByKey = new Map((draft.requestedMarkers || []).map(m => [m.markerKey, markerLabel(m)]));
    const lines = ['Lab comparison'];
    const markers = Array.isArray(draft.requestedMarkers) ? draft.requestedMarkers : [];
    if (markers.length) {
      const label = Array.isArray(draft.calculatedMarkers) && draft.calculatedMarkers.length ? 'Orderable tests' : 'Requested tests';
      lines.push('', `${label} (${markers.length}):`, ...markers.map(m => `- ${markerLabel(m)}`));
    }
    const calculatedMarkers = Array.isArray(draft.calculatedMarkers) ? draft.calculatedMarkers : [];
    if (calculatedMarkers.length) {
      lines.push('', `Calculated after results (${calculatedMarkers.length}):`, ...calculatedMarkers.map(m => `- ${markerLabel(m)}`));
    }
    const comparisons = Array.isArray(draft.providerComparisons) ? draft.providerComparisons : [];
    if (comparisons.length) {
      lines.push('', 'Verified online offer comparison:');
      const catalogueWarning = providerCatalogueWarning(comparisons);
      if (catalogueWarning) lines.push(catalogueWarning);
      for (const c of comparisons) {
        lines.push(`- ${c.name || c.providerId}: ${c.coveredCount}/${c.requestedCount} verified online offers — ${formatCzk(c.totalEstimateCzk)}`);
        if (Array.isArray(c.missingMarkerKeys) && c.missingMarkerKeys.length) {
          lines.push(`  Not verified in current online source: ${c.missingMarkerKeys.map(markerKey => markerNameByKey.get(markerKey) || markerKey).join(', ')}`);
        }
      }
    }
    if (draft.safetyBoundary) lines.push('', draft.safetyBoundary);
    return lines.join('\n');
  }

  const products = Array.isArray(draft.products) ? draft.products : [];
  const lines = [
    `${providerLabel(draft)} order preview`,
    `Status: ${statusLabel(draft.status || 'draft')}`,
  ];
  if (products.length) {
    lines.push('', 'Items:');
    for (const product of products) {
      lines.push(`- ${product.name || product.providerProductId || 'Lab product'} — ${formatCzk(product.priceCzk)}`);
      if (Array.isArray(product.markers) && product.markers.length) {
        lines.push(`  Markers: ${product.markers.join(', ')}`);
      }
    }
  }
  lines.push('', `Estimate: ${formatCzk(draft.totalEstimateCzk)}`);
  if (draft.result?.message) lines.push('', draft.result.message);
  if (draft.result?.checkoutUrl) lines.push(`Continue: ${draft.result.checkoutUrl}`);
  if (draft.safetyBoundary) lines.push('', draft.safetyBoundary);
  return joinCopySections(lines);
}

export function renderLabOrderCard(draft, msgIndex) {
  if (!draft) return '';
  if (draft.status === 'provider_selection' || draft.provider === 'provider_selection') {
    return renderProviderSelection(draft, msgIndex);
  }
  if (draft.provider !== 'labshop' && draft.provider !== 'cz.labshop' && draft.providerId !== 'cz.labshop' && draft.provider !== 'cz.unilabs' && draft.providerId !== 'cz.unilabs') return '';
  const products = Array.isArray(draft.products) ? draft.products : [];
  const status = draft.status || 'draft';
  const label = statusLabel(status);

  const itemHtml = products.map((p) => {
    const markerHtml = Array.isArray(p.markers) && p.markers.length
      ? `<div class="lab-order-markers">${p.markers.map(m => `<span>${escapeHTML(m)}</span>`).join('')}</div>`
      : '';
    return `<li class="lab-order-item">
      <div class="lab-order-item-main">
        <strong>${escapeHTML(p.name || p.providerProductId || 'Lab product')}</strong>
        <span>${escapeHTML(formatCzk(p.priceCzk))}</span>
      </div>
      ${markerHtml}
    </li>`;
  }).join('');

  const result = draft.result ? `<div class="lab-order-result ${draft.result.ok ? 'ok' : 'error'}">
    ${escapeHTML(draft.result.message || (draft.result.ok ? 'Cart prepared.' : 'Cart preparation failed.'))}
    ${draft.result.checkoutUrl ? `<br><a href="${escapeHTML(draft.result.checkoutUrl)}" target="_blank" rel="noopener">Continue on ${escapeHTML(providerLabel(draft))} →</a>` : ''}
  </div>` : '';

  const canPrepareLabshop = (draft.providerId === 'cz.labshop' || draft.provider === 'labshop' || draft.provider === 'cz.labshop') && (status === 'draft' || status === 'failed');
  const canPrepareUnilabs = (draft.providerId === 'cz.unilabs' || draft.provider === 'cz.unilabs') && (status === 'draft' || status === 'failed');
  const canChangeProvider = Array.isArray(draft.providerOptions) && draft.providerOptions.length > 1;
  const changeProviderButton = canChangeProvider
    ? `<button type="button" class="lab-order-secondary" data-lab-order-action="change-provider" data-msg-index="${msgIndex}">Change lab</button>`
    : '';
  const buttons = canPrepareLabshop ? `<div class="lab-order-actions">
    <button type="button" class="lab-order-primary" data-lab-order-action="prepare-cart" data-msg-index="${msgIndex}">Prepare Labshop cart</button>
    ${changeProviderButton}
    <button type="button" class="lab-order-secondary" data-lab-order-action="cancel" data-msg-index="${msgIndex}">Cancel</button>
  </div>` : canPrepareUnilabs ? `<div class="lab-order-actions">
    <button type="button" class="lab-order-primary" data-lab-order-action="prepare-unilabs-cart" data-msg-index="${msgIndex}">Prepare Unilabs cart</button>
    ${changeProviderButton}
    <button type="button" class="lab-order-secondary" data-lab-order-action="cancel" data-msg-index="${msgIndex}">Cancel</button>
  </div>` : canChangeProvider ? `<div class="lab-order-actions">
    ${changeProviderButton}
  </div>` : '';

  const totalHtml = draft.totalEstimateCzk != null
    ? `<div class="lab-order-total"><span>Estimate</span><strong>${escapeHTML(formatCzk(draft.totalEstimateCzk))}</strong></div>`
    : `<div class="lab-order-total"><span>Estimate</span><strong>TBD</strong></div>`;

  return `<div class="lab-order-card" data-lab-order-id="${escapeHTML(draft.id || '')}">
    <div class="lab-order-head">
      <div>
        <div class="lab-order-kicker">${escapeHTML(providerLabel(draft))} order preview</div>
        <div class="lab-order-title">Controlled handoff</div>
      </div>
      <span class="lab-order-status">${escapeHTML(label)}</span>
    </div>
    <ul class="lab-order-items">${itemHtml}</ul>
    ${totalHtml}
    <div class="lab-order-boundary">${escapeHTML(draft.safetyBoundary || 'Final booking/checkout/payment stays user-in-loop.')}</div>
    ${result}
    ${buttons}
  </div>`;
}
