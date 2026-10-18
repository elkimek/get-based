import {createHash} from 'node:crypto';
import {expect, type Page, type TestInfo} from '@playwright/test';
import type {Result} from 'axe-core';

export function renderedContrastRatio(first: readonly number[], second: readonly number[]): number {
  const luminance = (rgb: readonly number[]) => {
    if (rgb.length !== 3 || rgb.some(value => !Number.isFinite(value) || value < 0 || value > 255)) throw new Error('Opaque sRGB triples required');
    return rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface RenderedGradientContrastProof {
  target: string; minRatio: number; expectedRatio: number; pixelCount: number; pngSHA256: string;
  textBox: {x: number; y: number; width: number; height: number}; foreground: number[];
  generatedGradients: unknown[];
  scrollOffset: {x: number; y: number}; documentTextBox: {x: number; y: number; width: number; height: number};
}

/** Resolve only axe's explicit bgGradient uncertainty using the actual compositor.
 * Unsupported text/effects/targets and every other incomplete reason remain failures. */
export async function proveRenderedGradientContrast(page: Page, incomplete: readonly Result[], info: TestInfo,
  label: string): Promise<RenderedGradientContrastProof[]> {
  const proofs: RenderedGradientContrastProof[] = [], seen = new Set<string>();
  for (const rule of incomplete) {
    expect(rule.id, label + ': only gradient color uncertainty has a pixel proof').toBe('color-contrast');
    expect(rule.nodes.length).toBeGreaterThan(0);
    for (const node of rule.nodes) {
      expect(node.all).toEqual([]); expect(node.none).toEqual([]); expect(node.any).toHaveLength(1);
      const check = node.any[0]!;
      expect(check.id).toBe('color-contrast');
      const data = check.data as {messageKey?: unknown; expectedContrastRatio?: unknown} | undefined;
      expect(data?.messageKey, label + ': every incomplete reason must be bgGradient').toBe('bgGradient');
      if (typeof data?.expectedContrastRatio !== 'string' || !/^(?:3|4\.5):1$/.test(data.expectedContrastRatio)) throw new Error('Explicit normative axe contrast threshold required');
      const expectedRatio = Number(data.expectedContrastRatio.split(':')[0]);
      expect(node.target).toHaveLength(1);
      const target = node.target[0];
      if (typeof target !== 'string' || seen.has(target)) throw new Error('Unique single-document CSS gradient target required');
      seen.add(target);
      const locator = page.locator(target);
      await expect(locator).toHaveCount(1); await expect(locator).toBeVisible();
      await locator.evaluate(element => element.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}));
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const measure = async () => locator.evaluate(element => {
        if (!(element instanceof HTMLElement) || !CSS.supports('-webkit-text-fill-color', 'transparent')) throw new Error('Supported HTML text-fill capture required');
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        if (!context) throw new Error('Browser sRGB color decoder missing');
        const rgba = (value: string) => {if (!CSS.supports('color', value)) throw new Error('Explicit browser text color required'); context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data];};
        const foreground = rgba(getComputedStyle(element).color);
        if (foreground[3] !== 255) throw new Error('Transparent text cannot use opaque foreground proof');
        const styles = [], ancestors: Element[] = [];
        for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current);
        let hasGradient = false;
        for (const current of [...ancestors, ...element.querySelectorAll('*')]) {
          const style = getComputedStyle(current);
          if (Number(style.opacity) !== 1 || style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.textShadow !== 'none' || parseFloat(style.getPropertyValue('-webkit-text-stroke-width') || '0') !== 0) throw new Error('Opacity, filtering, blending or text shadow requires a different proof');
          if (style.backgroundImage.includes('gradient(')) hasGradient = true;
          for (const pseudo of ['::before', '::after']) {
            const content = getComputedStyle(current, pseudo).content;
            if (element.contains(current) && !['none', 'normal', '""'].includes(content)) throw new Error('Generated text is outside the bounded range proof');
          }
          styles.push({tag: current.tagName, id: current.id, color: style.color, fill: style.getPropertyValue('-webkit-text-fill-color'),
            opacity: style.opacity, filter: style.filter, blend: style.mixBlendMode, shadow: style.textShadow, stroke: style.getPropertyValue('-webkit-text-stroke-width'), background: style.background,
            backdrop: style.getPropertyValue('backdrop-filter'), font: style.font, spacing: style.letterSpacing, transform: style.transform});
        }
        const generatedGradients = [];
        // Inspect pseudo paint only when regular ancestry has no gradient. This
        // leaves unrelated animated decorative layers outside the stable receipt.
        if (!hasGradient) for (const ancestor of ancestors) for (const pseudo of ['::before', '::after']) {
          const style = getComputedStyle(ancestor, pseudo);
          if (!style.backgroundImage.includes('gradient(')) continue;
          const width = parseFloat(style.width), height = parseFloat(style.height), opacity = Number(style.opacity);
          if (!['""', "''"].includes(style.content) || style.display === 'none' || style.visibility !== 'visible'
            || !(opacity > 0 && opacity <= 1) || !(width > 0 && height > 0)) continue;
          const visual = window.visualViewport;
          const viewport = width === innerWidth && height === innerHeight
            ? {kind: 'window-inner', width: innerWidth, height: innerHeight, scale: 1, offsetLeft: 0, offsetTop: 0}
            : visual && visual.scale === 1 && visual.offsetLeft === 0 && visual.offsetTop === 0 && width === visual.width && height === visual.height
              ? {kind: 'unzoomed-visual', width: visual.width, height: visual.height, scale: visual.scale, offsetLeft: visual.offsetLeft, offsetTop: visual.offsetTop}
              : null;
          // Require exact actual viewport paint; mobile visual and window-inner
          // viewport sizes can differ. Zoom, panning and size tolerances are unsupported.
          if (style.position !== 'fixed' || [style.top, style.right, style.bottom, style.left].some(value => value !== '0px')
            || !viewport || style.transform !== 'none' || style.filter !== 'none'
            || style.mixBlendMode !== 'normal' || style.animationName !== 'none' || style.pointerEvents !== 'none'
            || [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft,
              style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft,
              style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some(value => value !== '0px')) {
            throw new Error('Generated gradient requires stable nontext fixed viewport paint: ' + JSON.stringify({tag: ancestor.tagName, pseudo,
              width, height, innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight,
              viewport: window.visualViewport && {width: window.visualViewport.width, height: window.visualViewport.height, scale: window.visualViewport.scale},
              position: style.position, top: style.top, right: style.right, bottom: style.bottom, left: style.left, transform: style.transform, filter: style.filter,
              blend: style.mixBlendMode, animation: style.animationName, pointerEvents: style.pointerEvents,
              margins: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft], padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
              borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]}));
          }
          generatedGradients.push({tag: ancestor.tagName, id: ancestor.id, pseudo, content: style.content, viewport,
            display: style.display, visibility: style.visibility, opacity, position: style.position, width, height,
            top: style.top, right: style.right, bottom: style.bottom, left: style.left, zIndex: style.zIndex,
            image: style.backgroundImage, color: style.backgroundColor, size: style.backgroundSize,
            backgroundPosition: style.backgroundPosition, repeat: style.backgroundRepeat, origin: style.backgroundOrigin,
            clip: style.backgroundClip, attachment: style.backgroundAttachment, filter: style.filter,
            transform: style.transform, blend: style.mixBlendMode, animation: style.animation, pointerEvents: style.pointerEvents});
        }
        if (!hasGradient && !generatedGradients.length) throw new Error('Axe gradient uncertainty requires an actual rendered gradient ancestor');
        const textRects = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let text: Node | null;
        while ((text = walker.nextNode())) {
          const value = text.textContent || '', start = value.search(/\S/);
          if (start < 0) continue;
          const owner = text.parentElement;
          if (!owner || !['SPAN', 'DIV', 'STRONG', 'EM', 'B', 'I', 'SMALL'].includes(owner.tagName)) throw new Error('Unsupported text descendant');
          const style = getComputedStyle(owner), ink = rgba(style.color), fillValue = style.getPropertyValue('-webkit-text-fill-color'), fill = rgba(fillValue === 'currentcolor' ? style.color : fillValue);
          if (JSON.stringify(ink) !== JSON.stringify(foreground) || JSON.stringify(fill) !== JSON.stringify(foreground)) throw new Error('Only uniform opaque text ink is supported');
          const range = document.createRange(); range.setStart(text, start); range.setEnd(text, value.trimEnd().length);
          for (const rect of range.getClientRects()) {
            if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) throw new Error('Every text range must be fully visible');
            if (generatedGradients.some(paint => rect.right > paint.width || rect.bottom > paint.height)) throw new Error('Every text range must fit the exact generated-gradient paint viewport');
            const insetX = Math.min(1, rect.width / 4), insetY = Math.min(1, rect.height / 4);
            for (const [x, y] of [[rect.left + insetX, rect.top + insetY], [rect.right - insetX, rect.top + insetY],
              [rect.left + insetX, rect.bottom - insetY], [rect.right - insetX, rect.bottom - insetY],
              [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2]]) {
              const topmost = document.elementFromPoint(x!, y!);
              if (!topmost || !element.contains(topmost)) {
                const clippedBy = ancestors.slice(0, 5).map(node => {
                  const computed = getComputedStyle(node), box = node.getBoundingClientRect();
                  return {tag: node.tagName, id: node.id, pointerEvents: computed.pointerEvents, overflowX: computed.overflowX, overflowY: computed.overflowY,
                    box: {x: box.x, y: box.y, width: box.width, height: box.height}};
                });
                throw new Error('Text range is occluded: ' + JSON.stringify({target: element.outerHTML.slice(0, 250),
                  textRect: {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}, point: {x, y},
                  hit: topmost?.outerHTML.slice(0, 250) ?? null, hitPointerEvents: topmost ? getComputedStyle(topmost).pointerEvents : null,
                  textPointerEvents: getComputedStyle(owner).pointerEvents, clippedBy}));
              }
            }
            textRects.push({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom});
          }
        }
        if (!textRects.length || textRects.length > 16) throw new Error('Bounded nonempty text ranges required');
        const left = Math.floor(Math.min(...textRects.map(rect => rect.left))), top = Math.floor(Math.min(...textRects.map(rect => rect.top)));
        const right = Math.ceil(Math.max(...textRects.map(rect => rect.right))), bottom = Math.ceil(Math.max(...textRects.map(rect => rect.bottom)));
        if ((right - left) * (bottom - top) > 262144) throw new Error('Text sample exceeds bounded pixel area');
        const box = element.getBoundingClientRect();
        return {foreground, styles, generatedGradients, textRects, scrollOffset: {x: scrollX, y: scrollY}, elementBox: {x: box.x, y: box.y, width: box.width, height: box.height}, textBox: {x: left, y: top, width: right - left, height: bottom - top}, html: element.outerHTML};
      });
      const before = await measure();
      // Text-fill only keeps color/currentColor-dependent background paint intact.
      const png = await page.screenshot({type: 'png', clip: before.textBox, scale: 'css', animations: 'allow', caret: 'initial',
        style: `:is(${target}), :is(${target}) * {-webkit-text-fill-color: transparent !important; text-shadow: none !important;}`});
      expect(await measure(), label + ': screenshot text masking restores exact geometry/styles/markup').toEqual(before);
      const pixels = await page.evaluate(async bytes => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], {type: 'image/png'}));
        try {
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
          const context = canvas.getContext('2d'); if (!context) throw new Error('Actual screenshot PNG decoder missing');
          context.drawImage(bitmap, 0, 0);
          return {width: bitmap.width, height: bitmap.height, data: [...context.getImageData(0, 0, bitmap.width, bitmap.height).data]};
        } finally {bitmap.close();}
      }, [...png]);
      expect(pixels.width).toBe(before.textBox.width); expect(pixels.height).toBe(before.textBox.height);
      expect(pixels.data).toHaveLength(pixels.width * pixels.height * 4);
      expect(pixels.data.every((value, index) => index % 4 !== 3 || value === 255), label + ': every compositor pixel is opaque').toBe(true);
      let minRatio = Infinity;
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        minRatio = Math.min(minRatio, renderedContrastRatio(before.foreground.slice(0, 3), pixels.data.slice(offset, offset + 3)));
      }
      const proof = {target, minRatio, expectedRatio, pixelCount: pixels.width * pixels.height,
        pngSHA256: createHash('sha256').update(png).digest('hex'), textBox: before.textBox, foreground: before.foreground,
        generatedGradients: before.generatedGradients, scrollOffset: before.scrollOffset, documentTextBox: {...before.textBox, x: before.textBox.x + before.scrollOffset.x, y: before.textBox.y + before.scrollOffset.y}};
      await info.attach(label + '-gradient-' + proofs.length, {body: png, contentType: 'image/png'});
      await info.attach(label + '-gradient-proof-' + proofs.length, {body: JSON.stringify(proof, null, 2), contentType: 'application/json'});
      expect(proof.pixelCount).toBeGreaterThan(0);
      expect(minRatio, label + ': every actual background pixel under the text meets contrast').toBeGreaterThanOrEqual(expectedRatio);
      proofs.push(proof);
    }
  }
  expect(proofs).toHaveLength(incomplete.reduce((sum, result) => sum + result.nodes.length, 0));
  return proofs;
}
