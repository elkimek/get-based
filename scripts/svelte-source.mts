// Expose authored component scripts to the native TypeScript source readers.
import { parse } from 'svelte/compiler';

export function scriptSource(file: string, source: string): string {
  if (!file.endsWith('.svelte')) return source;
  const ast = parse(source, { filename: file, modern: true });
  // Preserve source offsets/line numbers for dependency diagnostics. Module and
  // instance scripts are both included; markup is never parsed as TypeScript.
  const ranges = [ast.module?.content, ast.instance?.content]
    .filter((range): range is NonNullable<typeof range> => !!range);
  const offsets = ranges.map(range => {
    // Svelte's parser provides offsets not declared by the ESTree Program type.
    if (!('start' in range) || !('end' in range)
      || typeof range.start !== 'number' || typeof range.end !== 'number'
      || range.start < 0 || range.end > source.length || range.start > range.end) {
      throw new Error(`Missing Svelte script offsets: ${file}`);
    }
    return { start: range.start, end: range.end };
  });
  return source.split('').map((character, offset) =>
    offsets.some(range => offset >= range.start && offset < range.end)
      || character === '\n' || character === '\r' ? character : ' ').join('');
}
export function syntaxFile(file: string): string {
  return file.endsWith('.svelte') ? `${file}.ts` : file;
}
