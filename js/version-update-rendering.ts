import { renderHTML as renderBody } from './components/VersionUpdateBody.svelte.html.js';
import { renderHTML as renderCopy } from './components/VersionUpdateCopy.svelte.html.js';

/** Authored fragments only; worker identity, user consent and reload stay in the controller. */
export function renderVersionUpdateBody(): string {
  return renderBody();
}

export function renderVersionUpdateCopy(installed: boolean): string {
  return renderCopy({ installed });
}
