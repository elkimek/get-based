// @ts-check
// sun-session-display-utils.js — compact confidence and safety labels.

import { escapeHTML, escapeAttr } from './utils.js';

export function sessionConfidenceBadge(sess) {
  const confidence = sess?.calculation?.confidence;
  if (!confidence?.level) return '';
  const pct = Number.isFinite(confidence.score) ? `${Math.round(confidence.score * 100)}%` : '';
  const reasons = Array.isArray(confidence.reasons) ? confidence.reasons.join(' ') : '';
  return `<span class="sun-session-confidence confidence-${escapeAttr(confidence.level)}" title="${escapeAttr(`${pct ? pct + ' input quality · ' : ''}${reasons} Biological-response uncertainty is separate.`)}">${escapeHTML(confidence.level)} input quality</span>`;
}
export function formattedSessionMed(sess, { compact = false } = {}) {
  const med = Number(sess?.safety?.medFraction);
  if (!Number.isFinite(med)) return compact ? '' : '—';
  const exact = sess?.calculation?.precision?.allowsExactSafety !== false;
  const rawPct = med * 100;
  const pct = exact ? Math.round(rawPct) : Math.round(rawPct / 10) * 10;
  let label = 'low recorded dose';
  if (med >= 1) label = 'over threshold';
  else if (med >= 0.7) label = 'high';
  else if (med >= 0.3) label = 'moderate';
  if (compact) return exact ? label : `~${pct}% modeled`;
  return `${exact ? '' : '~'}${pct}% · ${label}${exact ? '' : ' · rounded estimate'}`;
}
