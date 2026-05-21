// chat-icons.js - shared chat SVG icons and icon-button DOM helpers

export const CHAT_ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
export const CHAT_ICON_REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.6 6.1"/><path d="M3 12A9 9 0 0 1 18.6 5.9"/><path d="M18 2v4h4"/><path d="M6 22v-4H2"/></svg>';
export const CHAT_ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
export const CHAT_ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function createChatIcon(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = (d) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', d);
    svg.appendChild(el);
  };
  if (kind === 'send') {
    path('m22 2-7 20-4-9-9-4Z');
    path('M22 2 11 13');
  } else if (kind === 'stop') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '7');
    rect.setAttribute('y', '7');
    rect.setAttribute('width', '10');
    rect.setAttribute('height', '10');
    rect.setAttribute('rx', '1');
    svg.appendChild(rect);
  } else if (kind === 'copy') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '9');
    rect.setAttribute('y', '9');
    rect.setAttribute('width', '13');
    rect.setAttribute('height', '13');
    rect.setAttribute('rx', '2');
    svg.appendChild(rect);
    path('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
  } else if (kind === 'check') {
    path('M20 6 9 17l-5-5');
  } else {
    path('M18 6 6 18');
    path('m6 6 12 12');
  }
  return svg;
}

export function setIconButtonContent(btn, kind, label = '') {
  if (!btn) return;
  const nodes = [createChatIcon(kind)];
  if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    nodes.push(span);
  }
  btn.replaceChildren(...nodes);
}
