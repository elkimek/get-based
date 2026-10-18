import FocusCardBody, {mount, unmount, flushSync} from './components/FocusCardBody.svelte.native.js';
import type {FocusCardBodyView} from './focus-card-presentation.js';

interface BodyOwner {
  setView(view: FocusCardBodyView): void;
  getStreamElement(): HTMLSpanElement | null;
}
const owners = new WeakMap<HTMLElement, BodyOwner>();

/** The document delegate keeps ownership of refresh; Svelte owns body content. */
export function replaceFocusCardBody(target: HTMLElement, view: FocusCardBodyView): BodyOwner {
  const previous = owners.get(target);
  if (previous) { void unmount(previous); flushSync(); }
  target.replaceChildren();
  const owner = mount(FocusCardBody, {target, props: {view}});
  flushSync();
  owners.set(target, owner);
  return owner;
}

/** Keep one span throughout a stream, including decreasing partial responses. */
export function createFocusCardStream(target: HTMLElement): {
  attach(): void;
  setText(text: string): void;
} {
  let owner: BodyOwner | null = null;
  let text = '';
  return {
    attach() {
      if (!owner?.getStreamElement()?.parentNode) {
        owner = replaceFocusCardBody(target, {kind: 'stream', text});
      }
    },
    setText(next) {
      text = next;
      if (owner) { owner.setView({kind: 'stream', text}); flushSync(); }
    }
  };
}
