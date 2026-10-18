import { renderHTML } from './components/ChangelogPresentation.svelte.html.js';
import type { ChangelogView } from './changelog-presentation.js';

/** Serialize synchronously; the original controller retains modal.innerHTML parsing. */
export function renderChangelog(view: ChangelogView): string {
  return renderHTML({ view });
}
