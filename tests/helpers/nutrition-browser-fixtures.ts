import type { Page } from '@playwright/test';

export function mealEditorViolations(page: Page) {
  return page.evaluate(async () => {
    const result = await (window as unknown as Window & { axe: typeof import('axe-core') }).axe.run(document.querySelector('#detail-modal')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, message: node.failureSummary })),
    }));
  });
}
