#!/usr/bin/env node
// test-markdown.js — Markdown rendering + XSS surface assertions.
// markdown.js runs on every streamed AI response. Surfaced as E's
// priority-1 gap in the 2026-04-20 audit.
//
// Run: node tests/test-markdown.js

// utils.js does an Object.assign(window, ...) at module load to expose
// handlers to inline-onclick attributes — markdown.js imports escapeHTML
// from utils.js, so we shim window first via the shared shim.
import './_node-shim.js';

const { applyInlineMarkdown, renderMarkdown } = await import('../js/markdown.js');

let passed = 0, failed = 0;
const fails = [];
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Markdown Rendering + XSS Tests ===\n');

// ─── 1. Inline markdown basics ───
console.log('1. Inline basics');

assert('bold renders as <strong>',
  applyInlineMarkdown('**bold**') === '<strong>bold</strong>');
assert('italic renders as <em>',
  applyInlineMarkdown('*italic*') === '<em>italic</em>');
assert('inline code renders as <code>',
  applyInlineMarkdown('`code`') === '<code>code</code>');
assert('bold + italic combine',
  applyInlineMarkdown('**bold** and *italic*') === '<strong>bold</strong> and <em>italic</em>');

// ─── 2. XSS: raw HTML tags must be escaped ───
console.log('\n2. XSS — raw tags escaped');

const scriptTag = applyInlineMarkdown('<script>alert(1)</script>');
assert('<script> tag is escaped to &lt;script&gt;',
  scriptTag.includes('&lt;script&gt;') && !scriptTag.includes('<script>'));

const imgTag = applyInlineMarkdown('<img src=x onerror=alert(1)>');
assert('<img onerror> is escaped',
  imgTag.includes('&lt;img') && !imgTag.toLowerCase().includes('<img'),
  'raw img tag must not reach the DOM');

const ampersand = applyInlineMarkdown('AT&T and <div>');
assert('ampersand and < both encoded',
  ampersand.includes('AT&amp;T') && ampersand.includes('&lt;div&gt;'));

// ─── 3. XSS: link URL scheme allowlist ───
console.log('\n3. XSS — link URL scheme');

const jsLink = applyInlineMarkdown('[click](javascript:alert(1))');
assert('javascript: URL in link is neutralized to #',
  jsLink.includes('href="#"') && !jsLink.toLowerCase().includes('javascript:'),
  'markdown links must only accept http(s) and mailto');

const dataLink = applyInlineMarkdown('[img](data:text/html,<script>alert(1)</script>)');
assert('data: URL in link is neutralized to #',
  dataLink.includes('href="#"') && !dataLink.toLowerCase().includes('data:'));

const vbLink = applyInlineMarkdown('[x](vbscript:msgbox(1))');
assert('vbscript: URL in link is neutralized',
  vbLink.includes('href="#"') && !vbLink.toLowerCase().includes('vbscript:'));

const fileLink = applyInlineMarkdown('[read](file:///etc/passwd)');
assert('file: URL in link is neutralized',
  fileLink.includes('href="#"') && !fileLink.toLowerCase().includes('file:'));

const httpLink = applyInlineMarkdown('[ok](http://example.com/path)');
assert('http:// URL passes through unchanged',
  httpLink.includes('href="http://example.com/path"'));

const httpsLink = applyInlineMarkdown('[ok](https://example.com)');
assert('https:// URL passes through unchanged',
  httpsLink.includes('href="https://example.com"'));

const mailLink = applyInlineMarkdown('[mail](mailto:a@b.c)');
assert('mailto: URL passes through',
  mailLink.includes('href="mailto:a@b.c"'));

// ─── 4. XSS: attribute breakout via quote in URL ───
console.log('\n4. XSS — attribute breakout');

const quotedUrl = applyInlineMarkdown('[x](https://example.com/"onmouseover=alert(1))');
assert('double-quote in URL is escaped to &quot;',
  !quotedUrl.includes('"onmouseover') && !quotedUrl.includes('" onmouseover'),
  'raw " inside href= breaks out of the attribute');

const quotedLabel = applyInlineMarkdown('["](https://example.com)');
assert('double-quote in link label is escaped',
  !/>"<\/a>/.test(quotedLabel),
  'label should pass through escapeHTML which now encodes both quote styles');

// ─── 5. Autolinks (bare URLs become <a>) ───
console.log('\n5. Autolinks');

const autolink = applyInlineMarkdown('Visit https://example.com today');
assert('bare https URL becomes <a>',
  autolink.includes('<a href="https://example.com"'));

const plainText = applyInlineMarkdown('Not a URL: just plain text');
assert('plain text has no <a>',
  !plainText.includes('<a '));

// ─── 6. renderMarkdown block-level ───
console.log('\n6. Block-level rendering');

const heading = renderMarkdown('# H1 heading');
assert('h1 renders chat-h1 class',
  heading.includes('class="chat-h1"') && heading.includes('H1 heading'));

const h2 = renderMarkdown('## Second');
assert('h2 renders chat-h2 class',
  h2.includes('class="chat-h2"'));

const codeFence = renderMarkdown('```js\nconst x = <div>evil</div>;\n```');
assert('fenced code block escapes content',
  codeFence.includes('&lt;div&gt;') && !codeFence.includes('<div>evil'),
  'code blocks must not let <tags> reach the DOM');

const untaggedFence = renderMarkdown('```\nline one\nline two\n```');
assert('untagged fence becomes callout div',
  untaggedFence.includes('chat-callout'));

const blockquote = renderMarkdown('> quoted text\n> second line');
assert('blockquote wraps in <blockquote>',
  blockquote.includes('<blockquote') && blockquote.includes('quoted text'));

const ul = renderMarkdown('- first\n- second');
assert('unordered list renders <ul>',
  ul.includes('<ul class="chat-list">') && ul.includes('<li>first</li>'));

const ol = renderMarkdown('1. first\n2. second');
assert('ordered list renders <ol>',
  ol.includes('<ol class="chat-list">') && ol.includes('<li>first</li>'));

const hr = renderMarkdown('---');
assert('horizontal rule renders <hr>',
  hr.includes('<hr class="chat-hr">'));

const table = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
assert('pipe-table renders <table>',
  table.includes('<table class="chat-table">') && table.includes('<th>a</th>') && table.includes('<td>1</td>'));

// ─── 7. XSS: injections inside block contexts ───
console.log('\n7. XSS in block contexts');

const headingXss = renderMarkdown('# <script>alert(1)</script>');
assert('heading content is escaped',
  headingXss.includes('&lt;script&gt;') && !headingXss.includes('<script>'));

const listXss = renderMarkdown('- <img src=x onerror=alert(1)>');
assert('list-item content is escaped',
  !listXss.toLowerCase().includes('<img'));

const tableXss = renderMarkdown('| col |\n|---|\n| <script>alert(1)</script> |');
assert('table cell content is escaped',
  tableXss.includes('&lt;script&gt;') && !tableXss.includes('<script>alert'));

// ─── 8. Robustness ───
console.log('\n8. Robustness');

assert('unclosed bold leaves ** literal',
  applyInlineMarkdown('**unclosed') === '**unclosed');

let threw = false;
try { applyInlineMarkdown(''); renderMarkdown(''); } catch { threw = true; }
assert('empty string does not throw', !threw);

const big = 'word '.repeat(5000);
const t0 = performance.now();
const bigOut = applyInlineMarkdown(big);
const dt = performance.now() - t0;
assert('25 KB plaintext renders in under 200 ms', dt < 200, `took ${dt.toFixed(0)} ms`);
assert('large-input output has no corruption',
  bigOut.length >= big.length);

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed) console.log('Failures:', fails);
process.exit(failed > 0 ? 1 : 0);
