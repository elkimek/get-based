import {expect} from 'vitest';

interface RenderedElement {
  tag: string;
  attributes: string[][];
  text: string;
  checked?: boolean;
  value?: string;
  children: RenderedElement[];
}

function renderedElement(element: Element): RenderedElement {
  return {
    tag: element.tagName,
    attributes: Array.from(element.attributes, ({name, value}) => [
      name, name === 'style' && element instanceof HTMLElement ? element.style.cssText : value,
    ]).filter(([name]) => !(element instanceof HTMLInputElement && (name === 'checked' || name === 'value')))
      .sort(([first], [second]) => first!.localeCompare(second!)),
    text: Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(),
    ...(element instanceof HTMLInputElement ? {checked: element.checked, value: element.value} : {}),
    children: Array.from(element.children, renderedElement),
  };
}

export async function expectNativeReview(
  referenceHtml: string, mount: (root: HTMLElement) => () => Promise<void>,
  verify?: (root: HTMLElement) => void,
) {
  const reference = document.createElement('div');
  reference.innerHTML = referenceHtml;
  const host = document.createElement('div'), sibling = document.createElement('button');
  sibling.textContent = 'Outside the review';
  document.body.append(host, sibling);
  let dispose: (() => Promise<void>) | undefined;
  try {
    dispose = mount(host);
    expect(renderedElement(host)).toEqual(renderedElement(reference));
    const focusable = host.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), summary');
    if (focusable) {
      focusable.focus();
      expect(document.activeElement).toBe(focusable);
    }
    verify?.(host);
  } finally {
    try {
      if (dispose) {
        await dispose();
        expect(host.childElementCount).toBe(0);
        expect(sibling.isConnected).toBe(true);
      }
    } finally {
      host.remove();
      sibling.remove();
    }
  }
}
