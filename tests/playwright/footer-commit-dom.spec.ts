import {expect, test} from './coverage-fixture.js';

const sha = 'abc<&"\'> <img src=x onerror=alert(1)>';
const commitUrl = 'https://github.com/elkimek/get-based/commit/';

test('public footer fetch/cache retains literal metadata and one native anchor', async ({page}) => {
  let requests = 0;
  await page.route('**/api/commit', route => {
    requests++;
    return route.fulfill({contentType: 'application/json', body: JSON.stringify({sha})});
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  // The empty Welcome intentionally does not request deployment metadata.
  expect(requests).toBe(0);
  await page.evaluate(async () => {const {loadCommitHash} = await import('/js/commit-hash.js'); loadCommitHash();});
  const anchor = page.locator('#app-commit-hash > a');
  await expect(anchor).toHaveCount(1);
  await expect(anchor).toHaveAttribute('href', commitUrl + sha);
  await expect(anchor).toHaveAttribute('target', '_blank');
  await expect(anchor).toHaveAttribute('rel', 'noopener');
  await expect(anchor).toHaveText(sha.slice(0, 7));
  expect(await page.locator('#app-commit-hash').evaluate(node => node.childNodes.length)).toBe(1);
  await expect(page.locator('#app-commit-hash img, #app-commit-hash script, #app-commit-hash [onerror]')).toHaveCount(0);
  expect(requests).toBe(1);

  const cached = await page.evaluate(async () => {
    const footer = document.querySelector('.app-footer');
    const span = document.createElement('span'); span.id = 'app-commit-hash'; span.textContent = 'pending';
    document.getElementById('app-commit-hash')!.replaceWith(span);
    const {loadCommitHash} = await import('/js/commit-hash.js');
    loadCommitHash();
    const {renderFooterCommitLink} = await import('/js/footer-commit-link-presentation.js');
    const defaultDocument = document.createElement('template');
    defaultDocument.innerHTML = renderFooterCommitLink('default<&"', 'literal<&"');
    return {footer: document.querySelector('.app-footer') === footer,
      count: span.childNodes.length, links: span.querySelectorAll('a').length,
      href: span.firstElementChild?.getAttribute('href'), text: span.textContent,
      defaultHref: defaultDocument.content.firstElementChild?.getAttribute('href'),
      defaultText: defaultDocument.content.textContent};
  });
  expect(cached).toEqual({footer: true, count: 1, links: 1, href: commitUrl + sha,
    text: sha.slice(0, 7), defaultHref: commitUrl + 'default<&"', defaultText: 'literal<&"'});
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});
