import type { ChangelogEntry } from './changelog-current.js';

/** Only the controller's unchanged sanitizer may supply item HTML. */
declare const sanitizedChangelogItem: unique symbol;
export type SanitizedChangelogItemHtml = string & {
  readonly [sanitizedChangelogItem]: true;
};

export interface ChangelogEntryView {
  version: string;
  title: string;
  date: string;
  items: readonly SanitizedChangelogItemHtml[];
}

export interface ChangelogView {
  entries: readonly ChangelogEntryView[];
}

const literal = (value: unknown): string => value === null || value === undefined ? '' : String(value);

/** Presentation facts only; preserve native for-of and field/coercion order. */
export function projectChangelogView(
  entries: readonly ChangelogEntry[],
  sanitizeItem: (item: string) => string,
): ChangelogView {
  const projected: ChangelogEntryView[] = [];
  for (const entry of entries) {
    const version = literal(entry.version);
    const title = literal(entry.title);
    const date = literal(entry.date);
    const items: SanitizedChangelogItemHtml[] = [];
    for (const item of entry.items) {
      // The brand documents this one trusted callback boundary, not a new sanitizer.
      items.push(sanitizeItem(item) as SanitizedChangelogItemHtml);
    }
    projected.push({ version, title, date, items });
  }
  return { entries: projected };
}
