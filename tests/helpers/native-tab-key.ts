import type {Page} from '@playwright/test';

/** Preserve native full-control keyboard traversal on each tested browser platform. */
export function nativeTabKey(page: Page, backwards = false): 'Tab' | 'Shift+Tab' | 'Alt+Tab' | 'Alt+Shift+Tab' {
  const cocoa = process.platform === 'darwin' && page.context().browser()?.browserType().name() === 'webkit';
  return backwards ? (cocoa ? 'Alt+Shift+Tab' : 'Shift+Tab') : (cocoa ? 'Alt+Tab' : 'Tab');
}
