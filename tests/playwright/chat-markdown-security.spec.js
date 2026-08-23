import { expect, test } from './coverage-fixture.js';

test('chat Markdown stays formatted and inert in the browser DOM', async ({ page }) => {
  await page.route('**/chat-markdown-security', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/chat-markdown-security', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const markdown = await import(`/js/markdown.js?chatMarkdownSecurity=${Date.now()}`);
    const fixture = document.getElementById('fixture');
    const source = [
      '# hs-CRP interpretation',
      '**Main takeaway:** &lt;1.0 is the lower-risk stratum.',
      '- &gt;3.0 is a higher stratum',
      '- &ge;10 often warrants contextual review',
      '[A & B](https://example.com/range?a=1&b=2)',
      '[https://label.example](https://target.example)',
      '[blocked](javascript:alert(1))',
      '`https://inside-code.example`',
      '| Marker | Value |',
      '|---|---|',
      '| hs-CRP | <img src=x onerror=alert(1)> |',
      '> <svg onload=alert(1)>',
      '```html',
      '<script>globalThis.__markdownPwned = true</script>',
      '```',
    ].join('\n');

    fixture.innerHTML = markdown.renderMarkdown(source);
    const elements = [...fixture.querySelectorAll('*')];
    const eventAttributes = elements.flatMap(element => [...element.attributes]
      .filter(attribute => attribute.name.startsWith('on'))
      .map(attribute => `${element.tagName}.${attribute.name}`));
    const deep = document.createElement('div');
    deep.innerHTML = markdown.renderMarkdown(`${'>'.repeat(12_000)} bounded quote`);

    return {
      text: fixture.textContent,
      hasExpectedShapes: Boolean(
        fixture.querySelector('.chat-h1')
        && fixture.querySelector('strong')
        && fixture.querySelector('ul.chat-list')
        && fixture.querySelector('table.chat-table')
        && fixture.querySelector('blockquote.chat-blockquote')
        && fixture.querySelector('pre.chat-code-block code')
      ),
      dangerousTags: fixture.querySelectorAll('script,img,svg,math,iframe,object,embed,style,form,input').length,
      eventAttributes,
      nestedAnchors: fixture.querySelectorAll('a a').length,
      codeLinks: fixture.querySelectorAll('code a').length,
      blockedHref: [...fixture.querySelectorAll('a')]
        .find(anchor => anchor.textContent === 'blocked')?.getAttribute('href'),
      protectedRel: [...fixture.querySelectorAll('a')]
        .filter(anchor => anchor.getAttribute('href') !== '#')
        .every(anchor => anchor.rel.includes('noopener') && anchor.rel.includes('noreferrer')),
      deepQuoteCount: deep.querySelectorAll('blockquote').length,
      deepText: deep.textContent,
      executed: globalThis.__markdownPwned === true,
    };
  });

  expect(result.text).toContain('<1.0 is the lower-risk stratum.');
  expect(result.text).toContain('>3.0 is a higher stratum');
  expect(result.text).toContain('≥10 often warrants contextual review');
  expect(result.text).toContain('A & B');
  expect(result.hasExpectedShapes).toBe(true);
  expect(result.dangerousTags).toBe(0);
  expect(result.eventAttributes).toEqual([]);
  expect(result.nestedAnchors).toBe(0);
  expect(result.codeLinks).toBe(0);
  expect(result.blockedHref).toBe('#');
  expect(result.protectedRel).toBe(true);
  expect(result.deepQuoteCount).toBeLessThanOrEqual(9);
  expect(result.deepText).toContain('bounded quote');
  expect(result.executed).toBe(false);
});
