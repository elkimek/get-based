import * as ts from 'typescript/unstable/ast';
import { parse } from 'svelte/compiler';
import { withParsedSource } from '../../scripts/native-typescript-ast.js';

/** This delegated supplement surface prohibits serialized on* attributes, not JS variable names. */
export function hasSerializedEventAttribute(source: string, kind: 'javascript' | 'svelte'): boolean {
  if (kind === 'svelte') {
    const visit = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      if ('type' in node && ['EventHandler', 'OnDirective'].includes(String(node.type))) return true;
      if ('type' in node && node.type === 'Attribute' && 'name' in node
        && typeof node.name === 'string' && /^on[a-z]+$/i.test(node.name)) return true;
      return Object.values(node).some(value => Array.isArray(value) ? value.some(visit) : visit(value));
    };
    return visit(parse(source, { modern: true }));
  }
  return withParsedSource(source, 'supplement-contract.js', file => {
    if (!file || file.flags & ts.NodeFlags.ThisNodeOrAnySubNodesHasError) throw new Error('Invalid supplement JavaScript');
    const stringKinds = new Set([
      ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail,
    ]);
    let found = false;
    const visit = (node: ts.Node): void => {
      if (stringKinds.has(node.kind) && 'text' in node && typeof node.text === 'string'
        && /(?:^|\s)on[a-z]+\s*=/i.test(node.text)) found = true;
      node.forEachChild(visit);
    };
    visit(file);
    return found;
  });
}
