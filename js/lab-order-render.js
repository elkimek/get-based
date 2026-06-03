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
  if (draft.providerId === 'cz.labshop' || draft.provider === 'labshop') return 'Labshop';
  return 'Lab';
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

function renderRequestedMarkers(draft) {
  const markers = Array.isArray(draft.requestedMarkers) ? draft.requestedMarkers : [];
  if (!markers.length) return '';
  const visibleLimit = 12;
  const visibleMarkers = markers.slice(0, visibleLimit);
  const hiddenMarkers = markers.slice(visibleLimit);
  const visibleHtml = visibleMarkers.map(m => `<span>${escapeHTML(markerLabel(m))}</span>`).join('');
  const overflowHtml = hiddenMarkers.length
    ? `<span class="lab-order-marker-overflow">+${escapeHTML(String(hiddenMarkers.length))} more</span>`
    : '';
  const allMarkersHtml = hiddenMarkers.length
    ? `<details class="lab-order-marker-details">
      <summary>Show all ${escapeHTML(String(markers.length))} requested tests</summary>
      <div class="lab-order-marker-list">${markers.map(m => `<span>${escapeHTML(markerLabel(m))}</span>`).join('')}</div>
    </details>`
    : '';
  return `<div class="lab-order-requested">
    <div class="lab-order-requested-head">
      <span>Requested tests</span>
      <strong>${escapeHTML(String(markers.length))}</strong>
    </div>
    <div class="lab-order-markers">${visibleHtml}${overflowHtml}</div>
    ${allMarkersHtml}
  </div>`;
}

function renderProviderRecommendation(draft) {
  const rec = draft.providerRecommendation;
  if (!rec?.bestCoverage && !rec?.cheapestSplit) return '';
  const markerNameByKey = new Map((draft.requestedMarkers || []).map(m => [m.markerKey, m.displayName || m.markerKey]));
  const best = rec.bestCoverage ? `<div class="lab-provider-recommendation-row">
    <span>Best coverage</span>
    <strong>${escapeHTML(rec.bestCoverage.name || rec.bestCoverage.providerId)} · ${escapeHTML(String(rec.bestCoverage.coveredCount))}/${escapeHTML(String(rec.bestCoverage.requestedCount))} tests · ${escapeHTML(formatCzk(rec.bestCoverage.totalEstimateCzk))}</strong>
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
    ${split}
  </div>`;
}

function renderProviderSelection(draft, msgIndex) {
  const options = Array.isArray(draft.providerOptions) ? draft.providerOptions : [];
  const comparisons = Array.isArray(draft.providerComparisons) ? draft.providerComparisons : [];
  const markerNameByKey = new Map((draft.requestedMarkers || []).map(m => [m.markerKey, markerLabel(m)]));
  const optionHtml = options.map(option => {
    const comparison = comparisons.find(c => c.providerId === option.providerId);
    const coverage = comparison
      ? `<span>Coverage: ${escapeHTML(String(comparison.coveredCount))}/${escapeHTML(String(comparison.requestedCount))} tests · ${escapeHTML(formatCzk(comparison.totalEstimateCzk))}</span>`
      : `<span>${escapeHTML(option.summary || 'Show tests')}</span>`;
    const missing = comparison?.missingMarkerKeys?.length
      ? `<em>Missing ${escapeHTML(String(comparison.missingMarkerKeys.length))}: ${escapeHTML(summarizeMarkerNames(comparison.missingMarkerKeys, markerNameByKey))}</em>`
      : '<em>Full requested coverage</em>';
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
    ${comparisons.map(c => `<div class="lab-provider-comparison-row">
      <span>${escapeHTML(c.name || c.providerId)}</span>
      <strong>${escapeHTML(String(c.coveredCount))}/${escapeHTML(String(c.requestedCount))} tests · ${escapeHTML(formatCzk(c.totalEstimateCzk))}</strong>
    </div>`).join('')}
  </div>` : '';
  return `<div class="lab-order-card" data-lab-order-id="${escapeHTML(draft.id || '')}">
    <div class="lab-order-head">
      <div>
        <div class="lab-order-kicker">Lab order</div>
        <div class="lab-order-title">Choose lab</div>
      </div>
      <span class="lab-order-status">Compare labs</span>
    </div>
    ${renderRequestedMarkers(draft)}
    ${comparisonHtml}
    ${renderProviderRecommendation(draft)}
    <div class="lab-provider-options">${optionHtml}</div>
    <div class="lab-order-boundary">${escapeHTML(draft.safetyBoundary || 'Choose a lab first. Final booking/payment stays user-in-loop.')}</div>
  </div>`;
}

export function renderLabOrderCard(draft, msgIndex) {
  if (!draft) return '';
  if (draft.status === 'provider_selection' || draft.provider === 'provider_selection') {
    return renderProviderSelection(draft, msgIndex);
  }
  if (draft.provider !== 'labshop' && draft.provider !== 'cz.labshop' && draft.providerId !== 'cz.labshop' && draft.provider !== 'cz.unilabs' && draft.providerId !== 'cz.unilabs') return '';
  const products = Array.isArray(draft.products) ? draft.products : [];
  const status = draft.status || 'draft';
  const statusLabel = {
    draft: 'Draft',
    preparing: 'Preparing cart…',
    cart_created: 'Cart prepared',
    failed: 'Failed',
    cancelled: 'Cancelled',
  }[status] || status;

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
      <span class="lab-order-status">${escapeHTML(statusLabel)}</span>
    </div>
    <ul class="lab-order-items">${itemHtml}</ul>
    ${totalHtml}
    <div class="lab-order-boundary">${escapeHTML(draft.safetyBoundary || 'Final booking/checkout/payment stays user-in-loop.')}</div>
    ${result}
    ${buttons}
  </div>`;
}
