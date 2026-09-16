// @ts-check
// Preserve custom marker definitions and assay metadata in the active view.

/** @param {any} data @param {Record<string, any>} custom */
export function mergeCustomMarkerDefinitions(data, custom = {}) {
  // Merge custom markers into categories
  for (const [fullKey, def] of Object.entries(custom)) {
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey) continue;
    if (!data.categories[catKey]) {
      // Create new category — infer icon from label/key
      const _label = (def.categoryLabel || catKey).toLowerCase();
      const _inferIcon = (l) => {
        if (/urine|urinal/.test(l)) return '\uD83E\uDDEA';
        if (/environ|toxic|heavy.?metal|pollut/.test(l)) return '\uD83C\uDF0D';
        if (/amino/.test(l)) return '\uD83E\uDDEC';
        if (/antioxid/.test(l)) return '\uD83D\uDEE1\uFE0F';
        if (/fatty.?acid|omega|lipid/.test(l)) return '\uD83D\uDC1F';
        if (/vitamin/.test(l)) return '\u2600\uFE0F';
        if (/mineral|element/.test(l)) return '\u2696\uFE0F';
        if (/hormone|endocrin/.test(l)) return '\uD83E\uDDEC';
        if (/liver|hepat/.test(l)) return '\uD83E\uDDEA';
        if (/kidney|renal/.test(l)) return '\uD83E\uDDEB';
        if (/thyroid/.test(l)) return '\uD83E\uDD8B';
        if (/bone|osteo/.test(l)) return '\uD83E\uDDB4';
        if (/immune|inflam/.test(l)) return '\uD83D\uDEE1\uFE0F';
        if (/cardio|heart/.test(l)) return '\uD83E\uDEC0';
        if (/neuro|brain/.test(l)) return '\uD83E\uDDE0';
        if (/digest|gut|gi|gastro|microb/.test(l)) return '\uD83E\uDDA0';
        if (/blood|hemat/.test(l)) return '\uD83E\uDE78';
        if (/metabol|energy|mitochond/.test(l)) return '\u26A1';
        if (/oxalate|organic.?acid/.test(l)) return '\u2697\uFE0F';
        if (/nutri|diet/.test(l)) return '\uD83C\uDF4E';
        return null;
      };
      data.categories[catKey] = {
        label: def.categoryLabel || catKey.charAt(0).toUpperCase() + catKey.slice(1),
        icon: def.icon || _inferIcon(_label) || '\uD83D\uDD16',
        singlePoint: !!def.singlePoint,
        group: def.group || null,
        markers: {}
      };
    }
    // Add marker if not already in schema
    if (!data.categories[catKey].markers[markerKey]) {
      data.categories[catKey].markers[markerKey] = {
        name: def.name,
        unit: def.unit || '',
        refMin: def.refMin,
        refMax: def.refMax,
        custom: true,
        referenceRangeSource: def.referenceRangeSource || ((def.refMin != null || def.refMax != null) ? 'custom' : '')
      };
    }
    const marker = data.categories[catKey].markers[markerKey];
    for (const field of ['specimen', 'method', 'referenceSampleTime', 'referenceRangeSource', 'optimalRangeSource']) {
      if (def[field] != null) marker[field] = def[field];
    }
  }
}
