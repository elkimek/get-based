import { renderHTML } from './components/ProfileButtonPresentation.svelte.html.js';
import type { ProfileButtonView } from './profile-button-presentation.js';

/** The native controller retains synchronous container.innerHTML parsing. */
export function renderProfileButtonView(view: ProfileButtonView): string {
  return renderHTML({ view });
}
