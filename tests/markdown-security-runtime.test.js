// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { applyInlineMarkdown, renderMarkdown } from '../js/markdown.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_TAGS = new Set([
  'A', 'BLOCKQUOTE', 'CODE', 'DIV', 'EM', 'HR', 'LI', 'OL', 'PRE',
  'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
]);

function renderIntoDom(markdown) {
  const root = document.createElement('main');
  root.innerHTML = renderMarkdown(markdown);
  return root;
}

function expectAllowlistedDom(root) {
  for (const element of root.querySelectorAll('*')) {
    expect(ALLOWED_TAGS.has(element.tagName), `unexpected tag <${element.tagName.toLowerCase()}>`).toBe(true);
    for (const attribute of element.attributes) {
      expect(attribute.name.startsWith('on'), `event attribute ${attribute.name}`).toBe(false);
      if (element.tagName === 'A') {
        expect(['href', 'target', 'rel'].includes(attribute.name)).toBe(true);
      } else {
        expect(attribute.name).toBe('class');
      }
    }
  }

  for (const anchor of root.querySelectorAll('a')) {
    expect(anchor.getAttribute('href')).toMatch(/^(?:https?:\/\/|mailto:|#)/i);
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(anchor.rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  }
}

describe('Markdown renderer DOM security boundary', () => {
  it('renders every supported chat shape through the fixed tag allowlist', () => {
    const root = renderIntoDom([
      '# Main heading',
      'A **strong** and *emphasized* paragraph with `inline <code>`.',
      '[Source & details](https://example.com/path?a=1&b=2)',
      'Bare link: https://example.org/report.',
      '> A quoted result',
      '- first item',
      '- second item',
      '1. ordered item',
      '| Marker | Value |',
      '|---|---|',
      '| hs-CRP | &lt;1.0 |',
      '```js',
      'const marker = "<unsafe-looking>";',
      '```',
      '```',
      'plain **callout**',
      '```',
    ].join('\n'));

    expectAllowlistedDom(root);
    expect(root.textContent).toContain('Source & details');
    expect(root.textContent).toContain('https://example.org/report.');
    expect(root.textContent).toContain('hs-CRP');
    expect(root.textContent).toContain('<1.0');
    expect(root.textContent).toContain('const marker = "<unsafe-looking>";');
  });

  it('keeps a representative HTML, SVG, MathML, and attribute attack corpus inert', () => {
    const attacks = [
      '<script>globalThis.__markdownPwned = true</script>',
      '<img src=x onerror=alert(1)>',
      '<svg><animate onbegin=alert(1) attributeName=x></animate></svg>',
      '<math><mtext><table><mglyph><style><!--</style><img title=--><img src=1 onerror=alert(1)>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<a href=javascript:alert(1)>click</a>',
      '&lt;img src=x onerror=alert(1)&gt;',
      '&#60;svg onload=alert(1)&#62;',
      '# <script>alert(1)</script>',
      '- <img src=x onerror=alert(1)>',
      '> <svg onload=alert(1)>',
      '| value |\n|---|\n| <iframe src=javascript:alert(1)> |',
      '```\n<img src=x onerror=alert(1)>\n```',
      '```html\n<script>alert(1)</script>\n```',
    ];

    for (const attack of attacks) {
      const root = renderIntoDom(attack);
      expectAllowlistedDom(root);
      expect(root.querySelector('script,img,svg,math,iframe,object,embed,style,form,input')).toBeNull();
    }
    expect(globalThis.__markdownPwned).toBeUndefined();
  });

  it('allows only explicit web and email links without nested anchors or code autolinks', () => {
    const root = renderIntoDom([
      '[web](HTTPS://example.com/path)',
      '[mail](mailto:person@example.com)',
      '[script](javascript:alert(1))',
      '[data](data:text/html,<script>alert(1)</script>)',
      '[spaced]( https://example.com)',
      '[internal space](https://example.com/a b)',
      '[A & B](https://example.com)',
      '[https://label.example](https://target.example)',
      '`https://inside-code.example`',
      'https://bare.example/path.',
    ].join('\n'));

    expectAllowlistedDom(root);
    const anchors = [...root.querySelectorAll('a')];
    expect(anchors.filter(anchor => anchor.textContent === 'https://label.example')).toHaveLength(1);
    expect(root.querySelector('a a')).toBeNull();
    expect(root.querySelector('code a')).toBeNull();
    expect(root.querySelector('code')?.textContent).toBe('https://inside-code.example');
    expect(anchors.find(anchor => anchor.textContent === 'A & B')).toBeTruthy();
    expect(anchors.find(anchor => anchor.textContent === 'script')?.getAttribute('href')).toBe('#');
    expect(anchors.find(anchor => anchor.textContent === 'data')?.getAttribute('href')).toBe('#');
    expect(anchors.find(anchor => anchor.textContent === 'spaced')?.getAttribute('href')).toBe('#');
    expect(anchors.find(anchor => anchor.textContent === 'internal space')?.getAttribute('href')).toBe('#');
    expect(anchors.find(anchor => anchor.textContent === 'https://bare.example/path.')?.getAttribute('href'))
      .toBe('https://bare.example/path.');
  });

  it('preserves URL-valid suffixes and delimits adjacent protected Markdown', () => {
    const root = renderIntoDom([
      'https://example.com/path. https://example.com/path, https://example.com/path;',
      'https://example.com/path: https://example.com/path! https://example.com/query?',
      'https://source.example/report[details](https://target.example/report)',
      'https://code.example/result`code`',
    ].join('\n'));

    expectAllowlistedDom(root);
    const anchors = [...root.querySelectorAll('a')];
    for (const suffix of ['.', ',', ';', ':', '!', '?']) {
      expect(anchors.some(anchor => anchor.getAttribute('href') === `https://example.com/${suffix === '?' ? 'query' : 'path'}${suffix}`)).toBe(true);
    }
    expect(anchors.find(anchor => anchor.textContent === 'https://source.example/report')?.getAttribute('href'))
      .toBe('https://source.example/report');
    expect(anchors.find(anchor => anchor.textContent === 'details')?.getAttribute('href'))
      .toBe('https://target.example/report');
    expect(anchors.find(anchor => anchor.textContent === 'https://code.example/result')?.getAttribute('href'))
      .toBe('https://code.example/result');
    expect(root.querySelector('code')?.textContent).toBe('code');
    expect(root.querySelector('a a')).toBeNull();
    expect(root.querySelector('a code')).toBeNull();
  });

  it('normalizes comparison entities once while leaving encoded tags as text', () => {
    const root = renderIntoDom('&lt;1, &gt;3, &le;4.5, &ge;10; &#60;script&#62;safe&#60;/script&#62;');
    expect(root.textContent).toBe('<1, >3, ≤4.5, ≥10; <script>safe</script>');
    expect(root.querySelector('script')).toBeNull();
    expectAllowlistedDom(root);
  });

  it('bounds pathological quote nesting and handles non-string empty values', () => {
    const root = renderIntoDom(`${'>'.repeat(12_000)} deeply quoted`);
    expect(root.querySelectorAll('blockquote').length).toBeLessThanOrEqual(9);
    expect(root.textContent).toContain('deeply quoted');
    expect(renderMarkdown(null)).toBe('');
    expect(applyInlineMarkdown(undefined)).toBe('');
  });

  it('resolves dense protected Markdown without leaking internal placeholders', () => {
    const dense = Array.from({ length: 2_000 }, (_, index) => index % 2 === 0
      ? `\`code-${index}\``
      : `[link-${index}](https://example.com/${index})`).join(' ');
    const html = applyInlineMarkdown(dense);
    expect(html).not.toContain('\u0000gbmd:');
    expect((html.match(/<code>/g) || [])).toHaveLength(1_000);
    expect((html.match(/<a href=/g) || [])).toHaveLength(1_000);
  });
});

describe('AI Markdown rendering paths', () => {
  it('keeps chat streaming text inert and routes final and restored model text through renderMarkdown', () => {
    const sources = Object.fromEntries([
      'chat-send.js',
      'chat-render.js',
      'chat-discussion-round-view.js',
      'chat-summaries.js',
    ].map(name => [name, fs.readFileSync(path.join(ROOT, 'js', name), 'utf8')]));

    expect(sources['chat-send.js']).toContain('el.textContent = target.slice(0, displayed)');
    expect(sources['chat-send.js']).toContain('el.textContent = target');
    expect(sources['chat-send.js']).toContain('aiMsgEl.innerHTML = renderMarkdown(fullText)');
    expect(sources['chat-render.js']).toContain('renderMarkdown(msg.content)');
    expect(sources['chat-discussion-round-view.js']).toContain('aiMsgEl.innerHTML = renderMarkdown(fullText)');
    expect(sources['chat-summaries.js']).toContain('body.innerHTML = renderMarkdown(partial)');
  });

  it('routes Biology Score and EMF model output through the same renderer', () => {
    const biologySections = fs.readFileSync(path.join(ROOT, 'js', 'biology-score-sections.js'), 'utf8');
    const biologyScores = fs.readFileSync(path.join(ROOT, 'js', 'biology-scores.js'), 'utf8');
    const emfInterpretation = fs.readFileSync(path.join(ROOT, 'js', 'emf-interpretation.js'), 'utf8');

    expect(biologySections).toContain('renderMarkdown(cached)');
    expect(biologyScores).toContain('answerEl.innerHTML = renderMarkdown(answer)');
    expect(emfInterpretation).toContain('body.innerHTML = renderMarkdown(clean)');
    expect(emfInterpretation).toContain('body.innerHTML = finalText ? renderMarkdown(finalText)');
  });
});
