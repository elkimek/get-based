import {expect} from '@playwright/test';

/** Await each predicate result before testing its truthiness. A zero API budget
 * preserves the caller's existing outer Playwright test deadline. Callers pass
 * their original explicit timeout or their qualified context/page default. */
export async function waitForAsyncCondition(read: () => Promise<unknown>, timeout: number): Promise<void> {
  await expect.poll(read, {timeout}).toBeTruthy();
}
