// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectTweaksTheme, projectTweaksAccent } from '../js/tweaks-presentation.js';
import { renderTweaksPanel } from '../js/tweaks-rendering.js';
import { THEMES, TWEAK_ACCENTS, accentSwatchSpec } from '../js/theme.js';
import * as theme from '../js/theme.js';
import { openTweaksPanel, closeTweaksPanel, updateTweaksUI } from '../js/settings-tweaks.js';

interface Sample {
  key: string;
  preferences: { theme: string; accent: string; sunset: boolean; crt: boolean; crtSupported: boolean };
  html: string;
  rawSHA256: string;
  rawPath: string;
}
interface Anchor {
  path: number[];
  value: string | null;
  joinText?: true;
}
interface Shape {
  tag?: string;
  attrs?: Record<string, string>;
  children?: Shape[];
  text?: string | null;
}
const fixtureBytes = readFileSync('tests/fixtures/tweaks/original-contract.json');
const fixture = JSON.parse(fixtureBytes.toString()) as {
  schemaVersion: number;
  provenance: {
    acceptedOriginalSealSHA256: string;
    originalControllerSHA256: string;
  };
  samples: Sample[];
};
const receivers = JSON.parse(readFileSync('tests/fixtures/tweaks/reviewed-receivers.json', 'utf8')) as {
  receiverTokens: Record<string, string[]>;
  uniqueTokenCount: number;
};
const comments = JSON.parse(readFileSync('tests/fixtures/tweaks/compiler-comments.json', 'utf8')) as {
  status: string;
  byKey: Record<string, Anchor[]> | null;
};
const originalHead = document.head.innerHTML;
const originalRootAttrs = [...document.documentElement.attributes].map(a => [a.name, a.value] as const);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  localStorage.clear();
  document.body.innerHTML = '<button id="tweaks-test-launcher">Open Tweaks</button>';
  document.getElementById('tweaks-test-launcher')!.focus();
});
afterEach(() => {
  closeTweaksPanel();
  vi.clearAllTimers();
  vi.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = originalHead;
  for (const a of [...document.documentElement.attributes]) document.documentElement.removeAttribute(a.name);
  for (const [name, value] of originalRootAttrs) document.documentElement.setAttribute(name, value);
});
function host(html: string): HTMLDivElement {
  const h = document.createElement('div');
  h.innerHTML = html;
  return h;
}
function stripReviewedAnchors(root: Node, key: string): void {
  const expected = comments.byKey?.[key];
  if (comments.status !== 'reviewed-actual-compiled-comments' || !expected) {
    throw new Error('Pending independently reviewed actual Tweaks compiler comments: ' + key);
  }
  const actual: Omit<Anchor, 'joinText'>[] = [], nodes: Comment[] = [];
  const visit = (parent: Node, path: number[]): void => [...parent.childNodes].forEach((node, index) => {
    const next = [...path, index];
    if (node.nodeType === Node.COMMENT_NODE) { actual.push({ path: next, value: node.nodeValue }); nodes.push(node as Comment); }
    visit(node, next);
  });
  visit(root, []);
  expect(actual).toEqual(expected.map(({ path, value }) => ({ path, value })));
  nodes.forEach((node, index) => {
    const previous = node.previousSibling, next = node.nextSibling;
    node.parentNode!.removeChild(node);
    if (expected[index]!.joinText) {
      expect(previous?.nodeType).toBe(Node.TEXT_NODE);
      expect(next?.nodeType).toBe(Node.TEXT_NODE);
      previous!.nodeValue = previous!.nodeValue! + next!.nodeValue!;
      next!.parentNode!.removeChild(next!);
    }
  });
}
function shape(node: Node): Shape {
  if (node instanceof Element) return { tag: node.tagName,
    attrs: Object.fromEntries([...node.attributes].map(a => [a.name, a.value])), children: [...node.childNodes].map(shape) };
  expect(node.nodeType).toBe(Node.TEXT_NODE);
  return { text: node.nodeValue }; // No whitespace, NBSP, leaf-text or attribute-value normalization.
}
const receiverSelectors: ReadonlyArray<readonly [string, string]> = [
  ['overlay', '#tweaks-panel-overlay'], ['panel', '#tweaks-panel'], ['head', '.tweaks-head'],
  ['close', '.modal-close'], ['body', '.tweaks-body'], ['section', '.tweaks-section'],
  ['section-title', '.tweaks-section-title'], ['theme-grid', '.tweaks-theme-grid'],
  ['theme-button', '.tweaks-theme-btn'], ['action-button', '.tweaks-action-grid button'],
  ['accent-row', '.tweaks-accent-row'], ['accent-button', '.tweaks-accent-btn'],
  ['accent-swatch', '.tweaks-accent-swatch'], ['option-row', '.tweaks-option-row'],
  ['option-copy', '.tweaks-option-row .settings-copy'], ['option-title', '.tweaks-option-row .settings-copy-title'],
  ['option-description', '.tweaks-option-row .settings-copy-desc'], ['action-grid', '.tweaks-action-grid'],
  ...THEMES.map((world): readonly [string, string] => ['theme-swatch-' + world.id, '.settings-theme-swatch-' + world.id]),
];
function receiversAt(root: Element, selector: string): Element[] {
  return [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
}
function parity(sample: Sample): HTMLElement {
  // The independent originals are after the public controller's real open/update.
  // Actual public domain setters and authored rendering are used, no copied native markup.
  theme.setTheme(sample.preferences.theme);
  theme.setAccentOverride(sample.preferences.accent);
  theme.setSunsetMode(sample.preferences.sunset);
  theme.setCrtEffectsEnabled(sample.preferences.crt);
  openTweaksPanel();
  const live = document.getElementById('tweaks-panel-overlay')!;
  const actual = live.cloneNode(true) as HTMLElement;
  const original = host(sample.html).firstElementChild!;
  stripReviewedAnchors(actual, sample.key);
  for (const [key, selector] of receiverSelectors) {
    const targets = receiversAt(actual, selector), sources = receiversAt(original, selector);
    expect(targets.length, key).toBe(sources.length);
    const expected = receivers.receiverTokens[key];
    if (!expected) throw new Error('Missing reviewed receiver: ' + key);
    for (let index = 0; index < targets.length; index++) {
      const current = targets[index]!, native = sources[index]!;
      const tokens = (current.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
      const additions = tokens.filter(token => token.startsWith('gb:'));
      expect(additions, key).toEqual(expected); // Unknown, missing, duplicate or misplaced additions fail.
      const nativeTokens = tokens.filter(token => !expected.includes(token));
      expect(nativeTokens, key).toEqual([...native.classList]); // Lifecycle classes remain in their real position.
      if (native.hasAttribute('class')) current.setAttribute('class', native.getAttribute('class')!);
      else current.removeAttribute('class');
    }
  }
  expect(shape(actual)).toEqual(shape(original));
  for (const id of ['tweaks-sunset-mode', 'tweaks-crt-effects']) {
    const a = live.querySelector<HTMLInputElement>('#' + id)!, o = original.querySelector<HTMLInputElement>('#' + id)!;
    expect({ value: a.value, defaultValue: a.defaultValue, checked: a.checked, defaultChecked: a.defaultChecked,
      valueAttribute: a.getAttribute('value'), type: a.type, disabled: a.disabled, formOwner: a.form })
      .toEqual({ value: o.value, defaultValue: o.defaultValue, checked: o.checked, defaultChecked: o.defaultChecked,
        valueAttribute: o.getAttribute('value'), type: o.type, disabled: o.disabled, formOwner: o.form });
  }
  for (const button of live.querySelectorAll('button')) {
    expect(button.type).toBe(button.classList.contains('modal-close') ? 'submit' : 'button');
  }
  expect(live.querySelectorAll('[onclick],[onchange],[oninput],script,img,iframe')).toHaveLength(0);
  return live;
}
it('uses the sealed native originals and independent exact receiver policy', () => {
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.provenance.acceptedOriginalSealSHA256).toBe('c3daaadf7c1b55093afb2cfa7a77b9495d0dde7052de582f1e79425905bff1dc');
  expect(fixture.provenance.originalControllerSHA256).toBe('7647dd11ef2e491f7f64e6c3c143d1b7a6004844ae86e8def2e8dfdbd514607c');
  expect(fixture.samples).toHaveLength(7);
  expect(receivers.uniqueTokenCount).toBe(40);
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe('fd7278a4bc9b93a45c3875139160c06c3c983dd844090f0b6c40c7a2b11e04c5');
});
it.each(fixture.samples)('preserves $key full literal DOM/native defaults via the real public controller', sample => {
  parity(sample);
});
it('keeps dirty checkedness separate from original defaults and preserves input identities during update', () => {
  const live = parity(fixture.samples.find(s => s.key === 'dark')!);
  const input = live.querySelector<HTMLInputElement>('#tweaks-sunset-mode')!;
  const defaultChecked = input.defaultChecked;
  theme.setSunsetMode(true);
  updateTweaksUI();
  expect(live.querySelector('#tweaks-sunset-mode')).toBe(input);
  expect(input.checked).toBe(true);
  expect(input.defaultChecked).toBe(defaultChecked);
  expect(input.hasAttribute('checked')).toBe(false);
  const form = document.createElement('form');
  form.appendChild(live); document.body.appendChild(form);
  form.reset();
  expect(input.checked).toBe(defaultChecked);
  updateTweaksUI();
  expect(input.checked).toBe(true);
});
it('renders literal theme/accent labels and attributes without HTML or event injection', () => {
  const marker = '<img src=x onerror="bad()"> & "\'\u00a0';
  const themes = THEMES.map(world => projectTweaksTheme({ ...world, label: marker }, 'dark'));
  const accents = TWEAK_ACCENTS.map(accent => projectTweaksAccent({ ...accent, label: marker }, '', accentSwatchSpec(accent, 'dark')));
  const h = host(renderTweaksPanel({ themes, accents, sunset: false, crt: false, crtSupported: false }));
  expect(h.querySelectorAll('img,script,[onerror],[onclick]')).toHaveLength(0);
  expect(h.querySelector('.tweaks-theme-btn span:last-child')!.textContent).toBe(marker);
  expect(h.querySelector('.tweaks-accent-btn')!.getAttribute('title')).toBe(marker);
  expect(h.querySelector('.tweaks-accent-btn')!.getAttribute('aria-label')).toBe(marker);
});
it('retains the original nullish/false/zero conversion and strict active identity', () => {
  expect(projectTweaksTheme({ id: null, label: false }, null)).toEqual({ id: '', label: 'false', active: true });
  expect(projectTweaksTheme({ id: 0, label: undefined }, '0')).toEqual({ id: '0', label: '', active: false });
  expect(projectTweaksAccent({ id: '', label: 0 }, '', { color: false, gradient: null }))
    .toEqual({ id: '', title: '0', ariaLabel: '0', color: 'false', gradient: '', active: true });
});
it('preserves theme getter/conversion order and does not convert the active-ID read again', () => {
  const trace: string[] = [], id = { toString() { trace.push('id.string'); return 'dark'; } };
  const view = projectTweaksTheme({ get id() { trace.push('id.read'); return id; },
    get label() { trace.push('label.read'); return { toString() { trace.push('label.string'); return 'literal'; } }; } }, id);
  expect(trace).toEqual(['id.read', 'id.string', 'label.read', 'label.string', 'id.read']);
  expect(view).toEqual({ id: 'dark', label: 'literal', active: true });
});
it('preserves accent active-first order and both independently converted label reads', () => {
  const trace: string[] = []; let labels = 0;
  const view = projectTweaksAccent({ get id() { trace.push('id.read'); return ''; },
    get label() { const n = ++labels; trace.push('label.read' + n); return { toString() { trace.push('label.string' + n); return 'Label ' + n; } }; } }, '',
    { get color() { trace.push('color.read'); return { toString() { trace.push('color.string'); return 'red'; } }; },
      get gradient() { trace.push('gradient.read'); return { toString() { trace.push('gradient.string'); return 'none'; } }; } });
  expect(trace).toEqual(['id.read', 'id.read', 'label.read1', 'label.string1', 'label.read2', 'label.string2', 'color.read', 'color.string', 'gradient.read', 'gradient.string']);
  expect(view.title).toBe('Label 1'); expect(view.ariaLabel).toBe('Label 2');
});
it.each(['theme-id', 'theme-label', 'accent-second-label', 'accent-color'] as const)('short-circuits %s with the original conversion error', stop => {
  const sentinel = new Error('Original conversion boundary'), trace: string[] = []; let labels = 0;
  const value = (name: string) => ({ toString() { trace.push(name); if (name === stop) throw sentinel; return name; } });
  let caught: unknown;
  try {
    if (stop.startsWith('theme')) projectTweaksTheme({ id: value('theme-id'), label: value('theme-label') }, 'dark');
    else projectTweaksAccent({ id: '', get label() { return value(++labels === 2 ? 'accent-second-label' : 'accent-first-label'); } }, '',
      { color: value('accent-color'), gradient: value('accent-gradient') });
  } catch (error) { caught = error; }
  expect(caught).toBe(sentinel);
  const order = stop.startsWith('theme') ? ['theme-id', 'theme-label'] : ['accent-first-label', 'accent-second-label', 'accent-color', 'accent-gradient'];
  expect(trace).toEqual(order.slice(0, order.indexOf(stop) + 1));
});
