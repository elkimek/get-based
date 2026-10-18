import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {cpus} from 'node:os';
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
  nativeStrokeDiagnostics?: unknown;
  originalAfterScratchSHA256?: string | undefined;
  originalAfterScratchError?: string | undefined;
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

/** Failure evidence only: read the original canvas; draw native probes only on detached scratch canvases. */
export async function captureWearablePaintDiagnostics(page: Page, info: TestInfo, failure: PaintFailure): Promise<void> {
  const readback = await page.evaluate(async limit => {
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
    for (const key of ['font', 'fontKerning', 'fontStretch', 'fontVariantCaps', 'letterSpacing', 'wordSpacing', 'textRendering', 'direction', 'textAlign', 'textBaseline', 'fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'filter', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowColor']) {
      const value: unknown = Reflect.get(context, key);
      contextProperties[key] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
    }
    // Readback above is complete before either independent native stroke probe runs.
    const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
    const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    const plain = (value: unknown) => value === undefined ? {type: 'undefined'}
      : value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value) ? value
      : Array.isArray(value) && value.length <= 32 && value.every(finite) ? value.slice() : {unavailable: 'Non-plain cached value'};
    const samples = (probe: CanvasRenderingContext2D) => {
      const rgba = probe.getImageData(0, 0, 1256, 520).data;
      const rows = [17, 18, 130, 131, 242, 243, 355, 356, 467, 468];
      const read = (x: number, y: number) => ({x, y, rgba: [...rgba.slice((y * 1256 + x) * 4, (y * 1256 + x) * 4 + 4)]});
      return {endpoints: rows.map(y => read(50, y)), interiors: rows.flatMap(y => Array.from({length: 15}, (_, index) => read(51 + index, y)))};
    };
    const scratch = () => {
      const surface = document.createElement('canvas'); surface.width = 1256; surface.height = 520;
      const probe = surface.getContext('2d'); if (!probe) throw new Error('No native scratch Canvas2D');
      probe.setTransform(2, 0, 0, 2, 0, 0); return probe;
    };
    // Exact drawGrid path/state sequence from pinned Chart4.4.7 (vendorSHA206b6e8b…).
    const stroke = (probe: CanvasRenderingContext2D, startX: unknown, startY: unknown, endX: unknown, endY: unknown, lineWidth: unknown, color: unknown, dash: unknown, offset: unknown) => {
      if (!lineWidth || !color) return;
      if (![startX, startY, endX, endY, lineWidth].every(finite) || typeof color !== 'string') throw new Error('Non-plain cached stroke coordinates/style');
      if (!finite(startX) || !finite(startY) || !finite(endX) || !finite(endY) || !finite(lineWidth)) throw new Error('Nonfinite cached stroke');
      const borderDash: unknown = dash || [];
      if (!Array.isArray(borderDash) || borderDash.length > 32 || !borderDash.every(finite) || (offset !== undefined && !finite(offset))) throw new Error('Non-plain cached stroke dash');
      probe.save(); probe.lineWidth = lineWidth; probe.strokeStyle = color; probe.setLineDash(borderDash);
      // Undefined is passed through the native setter exactly as drawGrid does.
      Reflect.set(probe, 'lineDashOffset', offset);
      probe.beginPath(); probe.moveTo(startX, startY); probe.lineTo(endX, endY); probe.stroke(); probe.restore();
    };
    let nativeStrokeDiagnostics: unknown;
    let fixedProbe: unknown = {unavailable: 'Fixed native probe did not complete'};
    try {
      const fixed = scratch();
      for (const y of [9, 65.5, 121.5, 178, 234]) stroke(fixed, 25.459991455078125, y, 33, y, 1, 'rgba(46,51,72,0.5)', [], 0);
      fixedProbe = {samples: samples(fixed), geometry: {width: 1256, height: 520, transform: [2, 0, 0, 2, 0, 0], startX: 25.459991455078125, endX: 33, yCenters: [9, 65.5, 121.5, 178, 234], lineWidth: 1, color: 'rgba(46,51,72,0.5)'}};
      const constructor: unknown = Reflect.get(window, 'Chart');
      const getter: unknown = typeof constructor === 'function' ? Reflect.get(constructor, 'getChart') : undefined;
      const chart: unknown = typeof getter === 'function' ? Reflect.apply(getter, constructor, [canvas]) : undefined;
      const scales: unknown = isRecord(chart) ? Reflect.get(chart, 'scales') : undefined;
      const yScale: unknown = isRecord(scales) ? Reflect.get(scales, 'y') : undefined;
      const items: unknown = isRecord(yScale) ? Reflect.get(yScale, '_gridLineItems') : undefined;
      const options: unknown = isRecord(yScale) ? Reflect.get(yScale, 'options') : undefined;
      const grid: unknown = isRecord(options) ? Reflect.get(options, 'grid') : undefined;
      const cachedFields = ['tx1', 'ty1', 'tx2', 'ty2', 'x1', 'y1', 'x2', 'y2', 'width', 'color', 'borderDash', 'borderDashOffset', 'tickWidth', 'tickColor', 'tickBorderDash', 'tickBorderDashOffset'];
      const cached = Array.isArray(items) ? items.slice(0, 32).map((item: unknown) => isRecord(item) ? Object.fromEntries(cachedFields.map(key => [key, plain(Reflect.get(item, key))])) : {unavailable: 'Non-object cached item'}) : null;
      let actualProbe: unknown = {unavailable: 'Actual cached y-grid items unavailable'};
      if (Array.isArray(items) && items.length <= 32 && items.every(isRecord) && isRecord(grid)) {
        if (width !== 1256 || height !== 520 || matrix.a !== 2 || matrix.d !== 2 || matrix.b !== 0 || matrix.c !== 0 || matrix.e !== 0 || matrix.f !== 0) actualProbe = {unavailable: 'Qualified primitive geometry is desktop1256x520/transform2 only'};
        else {
          const actual = scratch();
          // Reproduce observed base stroke state only on the detached surface.
          for (const key of ['lineCap', 'lineJoin', 'miterLimit', 'globalAlpha', 'globalCompositeOperation', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowColor']) Reflect.set(actual, key, Reflect.get(context, key));
          if (Reflect.get(grid, 'display')) for (const item of items) {
            if (Reflect.get(grid, 'drawOnChartArea')) stroke(actual, item.x1, item.y1, item.x2, item.y2, item.width, item.color, item.borderDash, item.borderDashOffset);
            if (Reflect.get(grid, 'drawTicks')) stroke(actual, item.tx1, item.ty1, item.tx2, item.ty2, item.tickWidth, item.tickColor, item.tickBorderDash, item.tickBorderDashOffset);
          }
          actualProbe = {samples: samples(actual), boundary: 'Cached y-scale grid and tick strokes only; excludes original clipping, borders, series and text.'};
        }
      }
      nativeStrokeDiagnostics = {vendorSHA256: '206b6e8bb00fc7bba2c7ee80ca41db3e9e05ba7be0aa35abeba9cfd5357f5d0e', fixedProbe, actualProbe,
        cachedYScale: isRecord(yScale) ? {bounds: Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height', 'min', 'max', '_startPixel', '_endPixel', '_length', '_borderValue'].map(key => [key, plain(Reflect.get(yScale, key))])), grid: isRecord(grid) ? Object.fromEntries(['display', 'drawTicks', 'drawOnChartArea'].map(key => [key, plain(Reflect.get(grid, key))])) : null, itemCount: Array.isArray(items) ? items.length : null, itemsTruncated: Array.isArray(items) && items.length > 32, items: cached} : {unavailable: 'Actual registered y-scale unavailable'},
        originalLineDash: context.getLineDash(), boundary: 'Native scratch evidence only. No original canvas writes or Chart compute/update/draw calls.'};
    } catch (error) {nativeStrokeDiagnostics = {fixedProbe, unavailable: error instanceof Error ? error.message : String(error)};}
    let originalAfterScratchSHA256: string | undefined;
    let originalAfterScratchError: string | undefined;
    try {
      const after = context.getImageData(0, 0, width, height).data;
      originalAfterScratchSHA256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', after))].map(value => value.toString(16).padStart(2, '0')).join('');
    } catch (error) {originalAfterScratchError = error instanceof Error ? error.message : String(error);}
    return {width, height, rgbaBase64: btoa(binary), pngDataURL, bounds: {x: box.x, y: box.y, width: box.width, height: box.height}, transform: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f], contextProperties, nativeStrokeDiagnostics, originalAfterScratchSHA256, originalAfterScratchError};
  }, wearablePaintDiagnosticByteLimit);
  const qualified = qualifyWearablePaintReadback(readback);
  let nativeCPU: unknown;
  try {
    const models = [...new Set(cpus().map(cpu => cpu.model))].slice(0, 4).map(model => model.slice(0, 160));
    const whitelist = ['sse', 'sse2', 'ssse3', 'sse4_1', 'sse4_2', 'avx', 'avx2', 'fma', 'f16c', 'avx512f', 'avx512bw', 'avx512dq', 'avx512vl', 'avx512_vnni', 'neon', 'asimd', 'sve', 'sve2'];
    let features: unknown = {unavailable: 'No Linux CPU feature inventory'};
    if (process.platform === 'linux') {
      const handle = await fs.open('/proc/cpuinfo', 'r');
      try {
        const buffer = Buffer.alloc(64 * 1024); const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
        const flags = /^(?:flags|Features)\s*:\s*(.*)$/m.exec(buffer.toString('utf8', 0, bytesRead))?.[1]?.split(/\s+/) || [];
        features = {whitelist, present: whitelist.filter(flag => flags.includes(flag)), sourceBytesRead: bytesRead};
      } finally {await handle.close();}
    }
    nativeCPU = {platform: process.platform, architecture: process.arch, models, features};
  } catch (error) {nativeCPU = {unavailable: error instanceof Error ? error.message : String(error)};}
  await info.attach('wearable-paint-readback', {body: JSON.stringify({
    ...failure, project: info.project.name, width: readback.width, height: readback.height,
    rgbaBytes: qualified.rgba.byteLength, pngBytes: qualified.png.byteLength,
    readbackSHA256: qualified.sha256, matchesObservedReceipt: qualified.sha256 === failure.observedSHA256,
    matchesExpectedReceipt: qualified.sha256 === failure.expectedSHA256,
    bounds: readback.bounds, transform: readback.transform, contextProperties: readback.contextProperties,
    nativeStrokeDiagnostics: readback.nativeStrokeDiagnostics ?? {unavailable: 'No scratch metadata returned'}, nativeCPU,
    originalAfterScratchSHA256: readback.originalAfterScratchSHA256 ?? null, originalAfterScratchError: readback.originalAfterScratchError ?? null, originalPixelsUnchangedByScratch: readback.originalAfterScratchSHA256 === undefined ? null : readback.originalAfterScratchSHA256 === qualified.sha256,
    boundary: 'Actual canvas backing pixels, captured after the observed mismatch. No redraw, normalization or acceptance claim.',
  }, null, 2), contentType: 'application/json'});
  await info.attach('wearable-paint-rgba', {body: qualified.rgba, contentType: 'application/octet-stream'});
  await info.attach('wearable-paint-png', {body: qualified.png, contentType: 'image/png'});
}
