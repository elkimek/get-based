/** Changelog-owned declarations only; keep native class names and shared chrome. */
const utilities = {
  'panel': 'gb:changelog-panel:changelog-panel-block',
  'entry': [
    'gb:changelog-entry:changelog-entry-block',
    'gb:changelog-entry-next:changelog-entry-next-block',
  ].join(' '),
  'header': 'gb:changelog-header:changelog-header-block',
  'version': 'gb:changelog-version:changelog-version-block',
  'date': 'gb:changelog-date:changelog-date-block',
  'items': 'gb:changelog-items:changelog-items-block',
  'item': [
    'gb:changelog-item:changelog-item-block',
    'gb:changelog-item-marker:changelog-item-marker-block',
    'gb:changelog-item-link:changelog-item-link-block',
    'gb:changelog-item-link-hover:changelog-item-link-hover-block',
  ].join(' '),
} as const;
export type ChangelogReceiver = keyof typeof utilities;

/** Native classes retain their exact order; scoped utilities are appended once. */
export function changelogClasses(nativeNames: string, receiver: ChangelogReceiver): string {
  return `${nativeNames} ${utilities[receiver]}`;
}
