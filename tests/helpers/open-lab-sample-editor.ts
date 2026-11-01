import type { Page } from '@playwright/test';
/** Exercise the internal native form without adding test controls to product history. */
export async function openLabSampleEditorForTest(page: Page, markerId: string, panelId: string) {
  await page.evaluate(async ({ markerId, panelId }) => {
    const editor = await import('/js/lab-sample-editor.js'), detail = await import('/js/marker-detail-modal.js');
    await editor.openLabSampleEditor(markerId, panelId, (id, options) => detail.showDetailModal(id, options));
  }, { markerId, panelId });
}
