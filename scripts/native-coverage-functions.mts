import assert from 'node:assert/strict';
import * as ts from 'typescript/unstable/ast';
import {skipTrivia, createScanner} from 'typescript/unstable/ast/scanner';
import {decode} from '@jridgewell/sourcemap-codec';
import type {Profiler} from 'node:inspector';
import {withParsedSource} from './native-typescript-ast.js';
import type {NativeTransform} from './native-coverage-types.mjs';
interface Token {start: number; end: number; kind: string; text: string;}
interface FunctionFact {
  start: number; end: number; logicalStart: number; bodyStart: number;
  form: string; async: boolean; generator: boolean; block: boolean;
  entry?: Token; body?: Token; tail?: Token; unsupported?: string;
}
/** Only these explicitly unsupported identity cases lose credit; malformed input still rejects. */
export class UnmappedNativeFunction extends Error {}
function supported(ok: unknown, reason: string): asserts ok {if (!ok) throw new UnmappedNativeFunction(reason);}
function first(source: string, at: number): Token {
  const scanner = createScanner(true, undefined, source, at, source.length - at), kind = scanner.scan();
  supported(scanner.getTokenStart() === at && scanner.getTokenEnd() > at && !scanner.isUnterminated(), 'TOKEN_UNSUPPORTED');
  return {start: at, end: scanner.getTokenEnd(), kind: ts.SyntaxKind[kind]!, text: source.slice(at, scanner.getTokenEnd())};
}
function tail(node: ts.Node, ast: ts.SourceFile, source: string): Token {
  const end = node.end, start = node.getStart(ast);
  const token = (a: number, kind: string): Token => ({start: a, end, kind, text: source.slice(a, end)});
  if (ts.isBlock(node) || ts.isObjectLiteralExpression(node) || ts.isClassExpression(node) || ts.isClassDeclaration(node)) {supported(source[end - 1] === '}', 'TAIL_DELIMITER'); return token(end - 1, 'CloseBraceToken');}
  if (ts.isParenthesizedExpression(node) || ts.isCallExpression(node) || (ts.isNewExpression(node) && node.arguments)) {supported(source[end - 1] === ')', 'TAIL_DELIMITER'); return token(end - 1, 'CloseParenToken');}
  if (ts.isElementAccessExpression(node) || ts.isArrayLiteralExpression(node)) {supported(source[end - 1] === ']', 'TAIL_DELIMITER'); return token(end - 1, 'CloseBracketToken');}
  if (ts.isPostfixUnaryExpression(node)) {supported(source.slice(end - 2, end) === (node.operator === ts.SyntaxKind.PlusPlusToken ? '++' : '--'), 'TAIL_OPERATOR'); return token(end - 2, ts.SyntaxKind[node.operator]!);}
  const leaves: readonly ts.SyntaxKind[] = [ts.SyntaxKind.Identifier, ts.SyntaxKind.PrivateIdentifier, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.BigIntLiteral, ts.SyntaxKind.RegularExpressionLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.ThisKeyword, ts.SyntaxKind.SuperKeyword];
  if (leaves.includes(node.kind)) return token(start, ts.SyntaxKind[node.kind]!);
  const ending: ts.Node[] = []; node.forEachChild(child => {if (child.end === end) ending.push(child);});
  supported(ending.length === 1, 'TAIL_UNSUPPORTED'); return tail(ending[0]!, ast, source);
}
function facts(source: string, file: string): FunctionFact[] {
  return withParsedSource(source, file, (ast, project) => {
    assert.equal(project.program.getSyntacticDiagnostics().length, 0, 'Malformed native source syntax'); const result: FunctionFact[] = [];
    function visit(node: ts.Node): void {
      if (ts.isFunctionLikeDeclaration(node) && node.body) {
        let body = node.body; while (ts.isParenthesizedExpression(body)) body = body.expression;
        const modifiers = node.modifiers ?? [], row: FunctionFact = {
          start: node.getStart(ast), end: node.end, logicalStart: node.getStart(ast), bodyStart: body.getStart(ast),
          form: ts.isArrowFunction(node) ? 'arrow' : ts.isGetAccessorDeclaration(node) ? 'get' : ts.isSetAccessorDeclaration(node) ? 'set' : ts.isConstructorDeclaration(node) ? 'constructor' : ts.isMethodDeclaration(node) ? 'method' : 'function',
          async: modifiers.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), generator: 'asteriskToken' in node && !!node.asteriskToken, block: ts.isBlock(node.body),
        };
        try {
          for (const modifier of modifiers) {
            const moduleOnly = [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(modifier.kind) && ts.isFunctionDeclaration(node);
            const methodOnly = modifier.kind === ts.SyntaxKind.StaticKeyword && (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node));
            if (moduleOnly || methodOnly) {supported(modifier.getStart(ast) === row.logicalStart, 'MODIFIER_PREFIX'); row.logicalStart = skipTrivia(source, modifier.end);}
            else if (modifier.kind === ts.SyntaxKind.AsyncKeyword) break;
            else throw new UnmappedNativeFunction('MODIFIER_UNSUPPORTED');
          }
          row.entry = first(source, row.logicalStart); row.body = first(source, row.bodyStart); row.tail = tail(node.body, ast, source);
          supported(row.tail.end === row.end, 'TAIL_END');
        } catch (error) {if (!(error instanceof UnmappedNativeFunction)) throw error; row.unsupported = error.message;}
        result.push(row);
      }
      node.forEachChild(visit);
    }
    visit(ast); return result;
  });
}
const lineStarts = (source: string): number[] => {const out = [0]; for (let i = 0; i < source.length; i++) if (source[i] === '\n') out.push(i + 1); return out;};
function position(source: string, lines: number[], line: number, column: number): number {
  assert(Number.isSafeInteger(line) && line >= 0 && line < lines.length && Number.isSafeInteger(column) && column >= 0, 'Malformed source map coordinates');
  const start = lines[line]!, next = source.indexOf('\n', start); assert(start + column <= (next < 0 ? source.length : next), 'Source map coordinates outside line'); return start + column;
}
/** Exact scalar own-entry mapping. No byte-overlap, nearest point, name, or body-hash credit. */
export function nativeFunctionMapper(transform: NativeTransform): (native: Profiler.FunctionCoverage) => {start: number; end: number; count: number} {
  const {runtime, canonical, map, offset, code, file} = transform, canonicalFacts = facts(canonical, file), runtimeFacts = facts(runtime, file + '.runtime.js');
  const forward = new Map<number, number[]>(), reverse = new Map<number, Set<number>>();
  if (map) {
    assert(map.version === 3 && map.sources.length === 1 && map.sources[0] === file && map.sourcesContent?.[0] === canonical, 'Source map does not bind canonical source');
    const generatedLines = lineStarts(code), originalLines = lineStarts(canonical);
    for (const [line, segments] of decode(map.mappings).entries()) for (const segment of segments) {
      const generated = position(code, generatedLines, line, segment[0]); const values = forward.get(generated) ?? [];
      if (segment.length >= 4) {assert(segment[1] === 0, 'Unexpected source map source'); const origin = position(canonical, originalLines, segment[2]!, segment[3]!); values.push(origin); const points = reverse.get(origin) ?? new Set<number>(); points.add(generated); reverse.set(origin, points);}
      else values.push(-1);
      forward.set(generated, values);
    }
  } else assert.equal(runtime, canonical, 'Direct native source differs from canonical bytes');
  function anchor(at: number): number {
    supported(Number.isSafeInteger(at) && at >= 0 && at < runtime.length, 'MAP_BOUNDS'); if (!map) return at;
    const generated = at - offset; supported(generated >= 0 && generated < code.length, 'MAP_BOUNDS'); const values = forward.get(generated) ?? [];
    supported(values.length === 1 && values[0]! >= 0, 'MAP_EXACT'); const original = values[0]!, points = reverse.get(original); supported(points?.size === 1 && points.has(generated), 'MAP_REVERSE'); return original;
  }
  function span(a: Token, b: Token): void {
    assert(runtime.slice(a.start, a.end) === a.text && canonical.slice(b.start, b.end) === b.text, 'Corrupt parsed token');
    supported(a.kind === b.kind && a.text === b.text && a.end - a.start === b.end - b.start, 'TOKEN_SPAN'); const origin = anchor(a.start); supported(origin === b.start, 'TOKEN_ORIGIN');
    if (a.end - a.start === 1 && ['{', '}', '(', ')', '[', ']'].includes(a.text)) supported(origin + 1 === b.end, 'TOKEN_SPAN');
    else supported(anchor(a.end) === b.end, 'TOKEN_SPAN');
  }
  return native => {
    assert(native.ranges.length > 0, 'Missing native own entry'); const entry = native.ranges[0]!;
    for (const range of native.ranges) assert(Number.isSafeInteger(range.startOffset) && Number.isSafeInteger(range.endOffset) && Number.isSafeInteger(range.count) && range.count >= 0 && range.startOffset >= 0 && range.endOffset > range.startOffset && range.endOffset <= runtime.length, 'Malformed native own range');
    const matches = runtimeFacts.filter(fn => fn.logicalStart === entry.startOffset && fn.end === entry.endOffset); supported(matches.length === 1, 'RUNTIME_IDENTITY'); const fn = matches[0]!;
    supported(!fn.unsupported && fn.entry && fn.body && fn.tail, fn.unsupported ?? 'TOKEN_UNSUPPORTED');
    const logical = anchor(fn.logicalStart), body = anchor(fn.bodyStart), candidates = canonicalFacts.filter(candidate => candidate.logicalStart === logical && candidate.bodyStart === body);
    supported(candidates.length === 1, 'CANONICAL_IDENTITY'); const original = candidates[0]!;
    supported(!original.unsupported && original.entry && original.body && original.tail, original.unsupported ?? 'TOKEN_UNSUPPORTED');
    supported(fn.form === original.form && fn.async === original.async && fn.generator === original.generator, 'FUNCTION_SYNTAX');
    span(fn.entry, original.entry); span(fn.body, original.body); span(fn.tail, original.tail);
    supported(fn.tail.end === fn.end && original.tail.end === original.end, 'TAIL_END');
    if (fn.block) supported(original.block && fn.tail.kind === 'CloseBraceToken' && fn.tail.text === '}' && fn.tail.end - fn.tail.start === 1, 'BLOCK_END');
    return {start: original.start, end: original.end, count: entry.count};
  };
}
