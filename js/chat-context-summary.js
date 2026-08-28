// @ts-check
// chat-context-summary.js - exact-context disclosure for completed AI responses

const CONTEXT_AREA_LABELS = {
  profile: 'Profile', genetics: 'Genome', wearables: 'Wearables',
  nutrition: 'Meals & Nutrition', nutritionHistory: 'Meals & Nutrition',
  emfAssessment: 'EMF Assessment', contextNotes: 'Context Notes', sun: 'Light & Sun',
};

function sectionDetail(name, content) {
  if (name === 'wearables') return content.match(/^## Wearables \(([^)]+)\)/m)?.[1] || '';
  if (name === 'nutrition') {
    const selected = [...content.matchAll(/Last (\d+) days: (\d+) meals.*? across (\d+\/\d+) days/gi)].at(-1);
    return selected ? `${selected[1]}-day context · ${selected[2]} meals · ${selected[3]} days · aggregate only` : 'aggregate only';
  }
  if (name === 'nutritionHistory') {
    const label = content.match(/^## Meals & Nutrition — (.+?) one-off history$/m)?.[1];
    return label ? `${label} one-off history · aggregate only` : 'one-off history · aggregate only';
  }
  if (name !== 'sun') return '';
  const parts = [];
  const outdoor = Number(content.match(/Outdoor sessions:\s*(\d+)/i)?.[1] || 0);
  const deviceSessions = Number(content.match(/device sessions:\s*(\d+)/i)?.[1] || 0);
  const devices = Number(content.match(/devices in library:\s*(\d+)/i)?.[1] || 0);
  if (outdoor > 0) parts.push('outdoor');
  if (deviceSessions > 0 || devices > 0) parts.push('devices');
  if (/### Indoor light environment/i.test(content)) parts.push('indoor');
  if (/### Light audits/i.test(content)) parts.push('audits');
  if (/### Weekly light trend|### Session cadence/i.test(content)) parts.push('trends');
  if (/### Calibration anchor/i.test(content)) parts.push('calibration');
  if (/### Sun-channel .* correlations/i.test(content)) parts.push('correlations');
  return parts.join(' · ') || 'aggregate only';
}

/** Build the disclosure from the exact final context sent with this response. */
export function getContextSummary(context = '') {
  const areas = [];
  const seen = new Map();
  const labSections = [];
  const sections = /^\[section:([A-Za-z][\w-]*)([^\]]*)\]\r?\n([\s\S]*?)^\[\/section:\1\][ \t]*$/gm;
  for (const match of String(context || '').matchAll(sections)) {
    const name = match[1], attrs = match[2], content = match[3];
    if (attrs.includes('updated:')) {
      labSections.push(content);
      continue;
    }
    const label = name.startsWith('biology')
      ? 'Biology Scores'
      : /^marker(Value)?Notes$/.test(name)
        ? 'Lab Notes'
        : CONTEXT_AREA_LABELS[name] || content.match(/^##\s+(.+)$/m)?.[1]?.trim() || name.replace(/([a-z])([A-Z])/g, '$1 $2');
    const detail = sectionDetail(name, content);
    const prior = seen.get(label);
    if (prior) prior.detail = [...new Set([prior.detail, detail].filter(Boolean))].join(' · ');
    else {
      const area = { label, detail };
      areas.push(area);
      seen.set(label, area);
    }
  }
  if (labSections.length) {
    const markerCount = labSections.reduce((sum, content) => sum + (content.match(/^\s*- /gm) || []).length, 0);
    const detail = `${markerCount} marker${markerCount === 1 ? '' : 's'} · ${labSections.length} section${labSections.length === 1 ? '' : 's'}`;
    const collectionIndex = areas.findIndex(area => area.label === 'Lab Collection Context');
    areas.splice(collectionIndex >= 0 ? collectionIndex : Math.min(1, areas.length), 0, { label: 'Lab values', detail });
  }
  const critical = String(context).match(/^\[critical\]\s*\nFlagged markers[^:]*:\s*([^\n]+)\n\[\/critical\]/m)?.[1];
  if (critical) areas.push({ label: 'Flagged Results', detail: `${critical.split(',').filter(Boolean).length} flagged` });
  return areas;
}
