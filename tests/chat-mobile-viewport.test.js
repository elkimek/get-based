// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getMobileChatViewportInsets,
  startMobileChatViewportSync,
  stopMobileChatViewportSync,
  syncMobileChatViewport,
} from '../js/chat-mobile-viewport.js';

const runtimeProperties = ['innerHeight', 'innerWidth', 'matchMedia', 'visualViewport'];
const savedDescriptors = new Map(
  runtimeProperties.map(property => [property, Object.getOwnPropertyDescriptor(window, property)]),
);

function setRuntimeProperty(property, value) {
  Object.defineProperty(window, property, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreRuntimeProperties() {
  for (const property of runtimeProperties) {
    const descriptor = savedDescriptors.get(property);
    if (descriptor) Object.defineProperty(window, property, descriptor);
    else delete window[property];
  }
}

function installViewport({ height, offsetTop, mobile = true }) {
  const visualViewport = new EventTarget();
  Object.assign(visualViewport, { height, offsetTop });
  setRuntimeProperty('innerHeight', 844);
  setRuntimeProperty('innerWidth', 390);
  setRuntimeProperty('matchMedia', () => ({ matches: mobile }));
  setRuntimeProperty('visualViewport', visualViewport);
  return visualViewport;
}

function renderOpenPanel() {
  document.body.innerHTML = '<aside id="chat-panel" class="chat-panel open"></aside>';
  return document.getElementById('chat-panel');
}

describe('mobile chat visual viewport', () => {
  beforeEach(() => {
    stopMobileChatViewportSync();
  });

  afterEach(() => {
    stopMobileChatViewportSync();
    restoreRuntimeProperties();
    document.body.innerHTML = '';
  });

  it('keeps the panel between iOS-style top and keyboard bottom insets', () => {
    const visualViewport = installViewport({ height: 500, offsetTop: 96 });
    const panel = renderOpenPanel();

    expect(getMobileChatViewportInsets()).toEqual({ top: 96, bottom: 248 });
    expect(startMobileChatViewportSync(panel)).toBe(true);
    expect(panel.style.getPropertyValue('--chat-visual-viewport-top')).toBe('96px');
    expect(panel.style.getPropertyValue('--chat-visual-viewport-bottom')).toBe('248px');

    visualViewport.offsetTop = 0;
    visualViewport.height = 532;
    visualViewport.dispatchEvent(new Event('resize'));

    expect(panel.style.getPropertyValue('--chat-visual-viewport-top')).toBe('0px');
    expect(panel.style.getPropertyValue('--chat-visual-viewport-bottom')).toBe('312px');
  });

  it('clears viewport overrides when the panel closes or leaves mobile layout', () => {
    installViewport({ height: 500, offsetTop: 0 });
    const panel = renderOpenPanel();

    startMobileChatViewportSync(panel);
    panel.classList.remove('open');
    expect(syncMobileChatViewport(panel)).toBe(false);
    expect(panel.style.getPropertyValue('--chat-visual-viewport-top')).toBe('');
    expect(panel.style.getPropertyValue('--chat-visual-viewport-bottom')).toBe('');

    panel.classList.add('open');
    setRuntimeProperty('matchMedia', () => ({ matches: false }));
    expect(syncMobileChatViewport(panel)).toBe(false);
    expect(panel.style.getPropertyValue('--chat-visual-viewport-top')).toBe('');
    expect(panel.style.getPropertyValue('--chat-visual-viewport-bottom')).toBe('');
  });

  it('ignores incomplete visual viewport geometry', () => {
    installViewport({ height: 500, offsetTop: 0 });
    setRuntimeProperty('visualViewport', { offsetTop: 20 });

    expect(getMobileChatViewportInsets()).toBeNull();
  });
});
