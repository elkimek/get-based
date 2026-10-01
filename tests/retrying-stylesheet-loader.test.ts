// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createRetryingStylesheetLoader } from '../js/retrying-module-loader.js';

function fixture(insertLink = (link: HTMLLinkElement) => { document.head.append(link); }) {
  const attempts: boolean[] = [];
  const links: HTMLLinkElement[] = [];
  const cache = createRetryingStylesheetLoader({
    createLink: retry => {
      attempts.push(retry);
      const link = document.createElement('link');
      links.push(link);
      return link;
    },
    insertLink,
    requireDocument: 'Stylesheet requires a document',
    failedLoad: 'Stylesheet could not be loaded',
  });
  return { cache, attempts, links };
}

it('shares pending/resolved promises and publishes the loaded flag inside the load event', async () => {
  const { cache, links } = fixture();
  const first = cache.load();
  expect(cache.load()).toBe(first);
  expect(cache.loaded).toBe(false);
  links[0]!.dispatchEvent(new Event('load'));
  expect(cache.loaded).toBe(true);
  expect(await first).toBe(links[0]);
  expect(cache.load()).toBe(first);
  links[0]!.remove();
});

it('removes a failed link before retrying and resets asynchronous insertion failures', async () => {
  const error = new Error('insertion failed');
  let count = 0;
  const { cache, attempts, links } = fixture(link => {
    document.head.append(link);
    if (++count === 1) throw error;
  });
  await expect(cache.load()).rejects.toBe(error);
  expect(links[0]!.isConnected).toBe(false);
  const retry = cache.load();
  links[1]!.dispatchEvent(new Event('error'));
  await expect(retry).rejects.toThrow('Stylesheet could not be loaded');
  expect(links[1]!.isConnected).toBe(false);
  expect(cache.loaded).toBe(false);
  const final = cache.load();
  links[2]!.dispatchEvent(new Event('load'));
  expect(await final).toBe(links[2]);
  expect(attempts).toEqual([false, true, true]);
  links[2]!.remove();
});

it('keeps link creation errors synchronous and uncached', () => {
  const error = new Error('creation failed');
  const attempts: boolean[] = [];
  const broken = createRetryingStylesheetLoader({
    createLink: retry => { attempts.push(retry); throw error; },
    insertLink: () => { throw new Error('must not insert'); },
    requireDocument: 'No document', failedLoad: 'Load failed',
  });
  expect(() => broken.load()).toThrow(error);
  expect(() => broken.load()).toThrow(error);
  expect(attempts).toEqual([false, false]);
  expect(broken.retry).toBe(false);
});
