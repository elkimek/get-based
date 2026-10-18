import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {Page, TestInfo} from '@playwright/test';

export const wearablePaintDiagnosticByteLimit = 16 * 1024 * 1024;
interface PaintReadback {
  width: number;
  height: number;
  rgbaBase64: string;
  pngDataURL: string;
  bounds: {x: number; y: number; width: number; height: number};
  transform: number[];
  contextProperties: Record<string, string | number | boolean | null>;
}
interface PaintFailure {
  phaseKey: string;
  buildId: string;
  expectedSHA256: string;
  observedSHA256: string;
}

/** Validate finite native readback without interpreting or normalizing its pixels. */
export function qualifyWearablePaintReadback(readback: PaintReadback) {
  const {width, height} = readback;
  const bytes = width * height * 4;
  assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0, 'Positive integer canvas dimensions');
  assert(Number.isSafeInteger(bytes) && bytes <= wearablePaintDiagnosticByteLimit, 'Bounded native RGBA buffer');
  assert.equal(readback.rgbaBase64.length, Math.ceil(bytes / 3) * 4, 'Exact encoded RGBA length');
  const rgba = Buffer.from(readback.rgbaBase64, 'base64');
  assert.equal(rgba.byteLength, bytes, 'Exact native RGBA byte count');
  assert.equal(rgba.toString('base64'), readback.rgbaBase64, 'Canonical complete RGBA encoding');
  const prefix = 'data:image/png;base64,';
  assert(readback.pngDataURL.startsWith(prefix), 'Native PNG data URL');
  const encodedPNG = readback.pngDataURL.slice(prefix.length);
  assert(encodedPNG.length > 0 && encodedPNG.length <= Math.ceil(wearablePaintDiagnosticByteLimit / 3) * 4, 'Bounded encoded PNG');
  const png = Buffer.from(encodedPNG, 'base64');
  assert(png.byteLength >= 33 && png.byteLength <= wearablePaintDiagnosticByteLimit, 'Bounded PNG payload');
  assert.equal(png.toString('base64'), encodedPNG, 'Canonical complete PNG encoding');
  assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Native PNG signature');
  assert.equal(png.readUInt32BE(8), 13, 'PNG image header length');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR', 'PNG image header');
  assert.equal(png.readUInt32BE(16), width, 'PNG backing width');
  assert.equal(png.readUInt32BE(20), height, 'PNG backing height');
  return {rgba, png, sha256: createHash('sha256').update(rgba).digest('hex')};
}

/** Failure evidence only: never draw, resize, update Chart or set context state. */
export async function captureWearablePaintDiagnostics(page: Page, info: TestInfo, failure: PaintFailure): Promise<void> {
  const readback = await page.evaluate(limit => {
    const canvas = document.querySelector('#chart-modal');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('No actual detail canvas for paint diagnostics');
    const {width, height} = canvas;
    const byteLength = width * height * 4;
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > limit) throw new Error('Native diagnostic canvas exceeds byte limit');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No actual Canvas2D context for paint diagnostics');
    const pixels = context.getImageData(0, 0, width, height).data;
    let binary = '';
    for (let index = 0; index < pixels.length; index += 32 * 1024) binary += String.fromCharCode(...pixels.subarray(index, index + 32 * 1024));
    const pngDataURL = canvas.toDataURL('image/png');
    if (pngDataURL.length > 'data:image/png;base64,'.length + Math.ceil(limit / 3) * 4) throw new Error('Native diagnostic PNG exceeds byte limit');
    const matrix = context.getTransform();
    const box = canvas.getBoundingClientRect();
    const contextProperties: Record<string, string | number | boolean | null> = {};
    for (const key of ['font', 'fontKerning', 'fontStretch', 'fontVariantCaps', 'letterSpacing', 'wordSpacing', 'textRendering', 'direction', 'textAlign', 'textBaseline', 'fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'filter']) {
      const value: unknown = Reflect.get(context, key);
      contextProperties[key] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
    }
    return {width, height, rgbaBase64: btoa(binary), pngDataURL, bounds: {x: box.x, y: box.y, width: box.width, height: box.height}, transform: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f], contextProperties};
  }, wearablePaintDiagnosticByteLimit);
  const qualified = qualifyWearablePaintReadback(readback);
  await info.attach('wearable-paint-readback', {body: JSON.stringify({
    ...failure, project: info.project.name, width: readback.width, height: readback.height,
    rgbaBytes: qualified.rgba.byteLength, pngBytes: qualified.png.byteLength,
    readbackSHA256: qualified.sha256, matchesObservedReceipt: qualified.sha256 === failure.observedSHA256,
    matchesExpectedReceipt: qualified.sha256 === failure.expectedSHA256,
    bounds: readback.bounds, transform: readback.transform, contextProperties: readback.contextProperties,
    boundary: 'Actual canvas backing pixels, captured after the observed mismatch. No redraw, normalization or acceptance claim.',
  }, null, 2), contentType: 'application/json'});
  await info.attach('wearable-paint-rgba', {body: qualified.rgba, contentType: 'application/octet-stream'});
  await info.attach('wearable-paint-png', {body: qualified.png, contentType: 'image/png'});
}
