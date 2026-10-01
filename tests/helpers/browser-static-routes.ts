import type { Page, Route } from '@playwright/test';

type RoutePage = {
  route(
    pattern: string | RegExp,
    handler: (route: Pick<Route, 'fulfill'>) => ReturnType<Route['fulfill']>,
  ): ReturnType<Page['route']>;
};
type StaticRoute = (
  page: RoutePage, pattern: string | RegExp, body: string, status?: number,
) => ReturnType<Page['route']>;

/** Keep literal fixture bytes, omitted status and a fresh response per request. */
function routeText(contentType: string): StaticRoute {
  return (page, pattern, body, status) => page.route(pattern, route => route.fulfill({
    ...(status !== undefined ? { status } : {}),
    contentType,
    body,
  }));
}

export const routeJavaScript = routeText('application/javascript');
export const routeHtml = routeText('text/html');
export const routeCss = routeText('text/css');
