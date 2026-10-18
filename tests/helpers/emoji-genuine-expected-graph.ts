import { JSDOM } from 'jsdom';

/** Add only the explicit genuine SSR graph to an untouched native expected tree. */
export function expectedEmojiSSR(nativeMarkup: string): string {
  const dom = new JSDOM('');
  try {
    const document = dom.window.document;
    const template = document.createElement('template'); template.innerHTML = nativeMarkup;
    const comment = (value: string): Comment => document.createComment(value);
    const cats = template.content.querySelector('.emoji-picker-cats')!;
    const reset = cats.querySelector('[data-cat="__reset"]');
    cats.prepend(comment(reset ? '[0' : '[-1'));
    if (reset) reset.after(comment(']')); else cats.firstChild!.after(comment(']'));
    const buttons = [...cats.querySelectorAll('button:not([data-cat="__reset"])')];
    const first = buttons[0];
    if (first) first.before(comment('[')); else cats.append(comment('['));
    for (const button of buttons) {
      button.before(comment(button.classList.contains('active') ? '[0' : '[-1'));
      button.after(comment(']'));
    }
    cats.append(comment(']'));
    const grid = template.content.querySelector('.emoji-picker-grid')!;
    const labels = [...grid.querySelectorAll('.emoji-picker-label')];
    for (const label of labels) {
      let boundary = label.nextSibling;
      while (boundary && !(boundary instanceof dom.window.Element && boundary.classList.contains('emoji-picker-label')))
        boundary = boundary.nextSibling;
      label.after(comment('['));
      grid.insertBefore(comment(']'), boundary);
    }
    grid.prepend(comment('[')); grid.append(comment(']'));
    template.content.prepend(comment('[')); template.content.append(comment(']'));
    return template.innerHTML;
  } finally { dom.window.close(); }
}
/** Exact test oracle, separate from the production serializer. */
export function requireEmojiGraph(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Changed genuine Emoji graph');
}
