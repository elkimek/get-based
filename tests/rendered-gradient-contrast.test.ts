// @vitest-environment node
import {expect, it} from 'vitest';
import {renderedContrastRatio} from './helpers/rendered-gradient-contrast.js';

it('uses normative opaque sRGB relative luminance and symmetric contrast', () => {
  expect(renderedContrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
  expect(renderedContrastRatio([51, 100, 200], [51, 100, 200])).toBe(1);
  expect(renderedContrastRatio([255, 255, 255], [0, 0, 0])).toBe(21);
  // Adjacent gray values straddle AA normal-text contrast on white.
  expect(renderedContrastRatio([118, 118, 118], [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  expect(renderedContrastRatio([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5);
});

it('rejects alpha, missing channels and invalid screenshot color inputs', () => {
  for (const rgb of [[0, 0], [0, 0, 0, 255], [-1, 0, 0], [256, 0, 0], [NaN, 0, 0]]) {
    expect(() => renderedContrastRatio(rgb, [255, 255, 255])).toThrow();
  }
});
