export interface FrozenStyleBlock { selector: string; declarations: string; media: string | null }

/** Prefix top-level selectors while retaining commas inside :where/:not. */
export function scopedFrozenStyles(blocks: FrozenStyleBlock[]) {
  return blocks.map(block => {
    const source = block.selector.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors: string[] = []; let depth = 0, start = 0;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === '(' || char === '[') depth++;
      else if (char === ')' || char === ']') depth--;
      else if (char === ',' && depth === 0) { selectors.push(source.slice(start, index).trim()); start = index + 1; }
    }
    selectors.push(source.slice(start).trim());
    const rule = `${selectors.map(selector => `[data-original] ${selector}`).join(',')} {${block.declarations}}`;
    return block.media ? `@media ${block.media} {${rule}}` : rule;
  }).join('\n');
}
