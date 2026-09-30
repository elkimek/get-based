import type { Page, Route } from '@playwright/test';

type FixturePage = Pick<Page, 'route' | 'goto'>;
type DynamicBlankPage = (page: FixturePage, path: string) => Promise<void>;
type FixedBlankPage = (page: FixturePage) => Promise<void>;
type BlankPageOptions = { body: string; status?: number; path?: string; routePattern?: string };

export function createBlankPage(options: BlankPageOptions & { path: string }): FixedBlankPage;
export function createBlankPage(options: BlankPageOptions & { path?: never }): DynamicBlankPage;
/** Keep fixture bytes, optional status, navigation timing and the original callable shape. */
export function createBlankPage({ body, status, path, routePattern }: BlankPageOptions): FixedBlankPage | DynamicBlankPage {
  const handler = () => (route: Route) => route.fulfill({
    ...(status !== undefined ? { status } : {}), contentType: 'text/html', body,
  });
  if (path !== undefined) {
    return async function openBlankPage(page: FixturePage): Promise<void> {
      await page.route(routePattern ?? `**${path}`, handler());
      await page.goto(path, { waitUntil: 'load' });
    };
  }
  return async function openBlankPage(page: FixturePage, path: string): Promise<void> {
    await page.route(`**${path}`, handler());
    await page.goto(path, { waitUntil: 'load' });
  };
}
