import postcss from 'postcss';

/** Match an exact owned selector and its declarations, without concatenating owners. */
export function ownedRule(
  css: string,
  selector: string,
  declarations: Readonly<Record<string, string>>,
  media?: string,
): boolean {
  let found = false;
  postcss.parse(css).walkRules(rule => {
    if (rule.selector !== selector) return;
    if (media !== undefined) {
      let parent: postcss.Rule['parent'] | postcss.Document = rule.parent;
      while (parent && parent.type !== 'atrule') parent = parent.parent;
      if (!parent || parent.type !== 'atrule' || parent.name !== 'media' || parent.params !== media) return;
    }
    if (Object.entries(declarations).every(([property, value]) =>
      rule.nodes.some(node => node.type === 'decl' && node.prop === property && node.value === value),
    )) found = true;
  });
  return found;
}

/** Tailwind emits these literal class names with CSS punctuation escaped. */
export function escapedClass(token: string): string {
  return '.' + token.replace(/[^a-zA-Z0-9_-]/g, character => '\\' + character);
}
