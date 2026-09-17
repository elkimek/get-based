// Local illustrative copy, not model output. Always read the real score result;
// never manufacture a number or cache a claim across changed ranges/windows.
export function buildDemoBiologyInsight(score, materialFingerprint) {
  const presented = score.historicalSnapshot || score;
  const core = (presented.available || []).filter(item => item.core && !item.profileContextOnly && Number.isFinite(item.partial));
  const weakest = [...core].sort((a, b) => a.partial - b.partial)[0];
  const label = String(weakest?.label || 'The leading core marker').replace(/[\n\r*#`<>\[\]]/g, '').slice(0, 65);
  const historical = !!score.historicalSnapshot || ['stale', 'mixed-dates'].includes(score.recencyStatus);
  const overview = score.id === 'biologicalCoherence';
  const signal = !Number.isFinite(presented.score)
    ? 'This sample needs more usable core evidence before it can show a current score.'
    : overview
      ? 'This overview combines the eligible baseline domains in the sample.'
      : weakest?.partial < 100
        ? `${label} falls outside the selected range in this sample.`
        : 'The available core markers fit the selected ranges in this sample.';
  const summary = `${historical ? 'Older results: ' : ''}${signal} ${overview
    ? 'Open the contributors to see what is included. Advanced scores remain separate.'
    : 'Optional results add context. Compare Reference and Optimal to explore how the same markers are rated.'}`;
  const inputs = [...core].sort((a, b) => a.partial - b.partial).slice(0, 3)
    .map(item => `${item.label}: ${item.displayValue ?? item.value}${item.unit ? ` ${item.unit}` : ''}`).join('; ');
  const limit = presented.boundary || 'Range fit describes the selected marker pattern, not organ performance or disease risk.';
  const context = presented.attention || presented.anchorWarning || presented.scoreConfidenceLabel || 'Review the core and additional marker tables for the evidence behind this pattern.';
  return {
    source: 'demo', summary, materialFingerprint,
    text: `## Main signal\n${signal}${inputs ? `\n\n${inputs}.` : ''}\n\n## Context\n${limit}\n\n${context}\n\n## Next check\nCompare the dates and range modes, then open ${overview ? 'Overview contributors' : 'the core marker table'} to follow the inputs. These are synthetic examples for exploring the feature, not a suggested testing schedule. This explanation is generated locally from the score; no AI request was made.`,
  };
}
