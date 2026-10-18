import {renderHTML as commitLinkHTML} from './components/FooterCommitLink.svelte.html.js';

const COMMIT_URL = 'https://github.com/elkimek/get-based/commit/';

/** Browser-only public anchor serializer. Static Footer SSR composes its own
 * component; this compatibility boundary validates a single anchor using the
 * HTML DOM, independently of the renderer's inert outer annotations. */
export function renderFooterCommitLink(
  full: string,
  short: string,
  ownerDocument: Document = globalThis.document,
): string {
  // Preserve the genuine renderer's default-hint URL coercion, then its
  // null-safe String text coercion. No input is read or coerced a second time.
  const href = COMMIT_URL + full;
  const text = String(short ?? '');
  const raw = commitLinkHTML({full: href.slice(COMMIT_URL.length), short: text});

  const expected = ownerDocument.createElement('a');
  expected.setAttribute('href', href);
  expected.setAttribute('target', '_blank');
  expected.setAttribute('rel', 'noopener');
  expected.textContent = text;
  // Round-trip the projected anchor through the same standard HTML parser so
  // CR/newline/NUL normalization remains identical to the original caller.
  const expectedFragment = ownerDocument.createElement('template');
  expectedFragment.innerHTML = expected.outerHTML;
  const expectedAnchor = expectedFragment.content.firstElementChild;
  const fragment = ownerDocument.createElement('template');
  fragment.innerHTML = raw;
  const anchor = fragment.content.firstElementChild;
  const visible = [...fragment.content.childNodes].filter(node => node.nodeType !== 8);
  const attributes = (element: Element): string => JSON.stringify(
    [...element.attributes].map(attribute => [attribute.namespaceURI, attribute.name, attribute.value]),
  );
  if (!anchor || !expectedAnchor || visible.length !== 1 || visible[0] !== anchor
    || !anchor.isEqualNode(expectedAnchor) || attributes(anchor) !== attributes(expectedAnchor)) {
    throw new Error('Unexpected footer commit anchor DOM');
  }
  return anchor.outerHTML;
}
