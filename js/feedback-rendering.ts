import { renderHTML } from './components/FeedbackPresentation.svelte.html.js';

/** Clone authored markup through the original native template-content path. */
export function renderFeedbackForm(): Node {
  const template = document.createElement('template');
  template.innerHTML = renderHTML();
  return template.content.cloneNode(true);
}
