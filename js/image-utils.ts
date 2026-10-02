export interface ResizedImage {
  base64: string; mediaType: string; width: number; height: number;
  origWidth: number; origHeight: number; quality_warnings: string[];
}
interface ResizeVariant { maxDim: number; quality: number; includeQualityWarnings?: boolean }
interface ImageContentBlock { type: 'image_url'; image_url: { url: string } }
interface TextContentBlock { type: 'text'; text: string }


// image-utils.js — Shared image utilities for chat attachments and PDF image fallback
// No app imports (no circular deps)

// ═══════════════════════════════════════════════
// RESIZE IMAGE
// ═══════════════════════════════════════════════

/**
 * Resize an image file to fit within maxDim, return base64 JPEG.
 */
export const MAX_INPUT_IMAGE_PIXELS = 32_000_000;

function drawResizedImage(img: HTMLImageElement, file: File, maxDim: number, quality: number, includeQualityWarnings = true): ResizedImage {
  const origWidth = img.width, origHeight = img.height;
  let width = origWidth, height = origHeight;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  const isPng = file.type === 'image/png';
  const outputType = isPng ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(outputType, quality);
  const base64 = dataUrl.split(',')[1]!;
  const mediaType = isPng ? 'image/png' : 'image/jpeg';
  const quality_warnings = includeQualityWarnings ? analyzeImageQuality(ctx, width, height) : [];
  canvas.width = 0;
  canvas.height = 0;
  return { base64, mediaType, width, height, origWidth, origHeight, quality_warnings };
}

export function resizeImageVariants(file: File, variants: ResizeVariant[]): Promise<ResizedImage[]> {
  return new Promise<ResizedImage[]>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.width || !img.height || img.width * img.height > MAX_INPUT_IMAGE_PIXELS) {
        reject(new Error('This image is too large to process safely. Choose a photo under 32 megapixels.'));
        return;
      }
      try {
        resolve(variants.map((variant, index) => drawResizedImage(
          img,
          file,
          variant.maxDim,
          variant.quality,
          variant.includeQualityWarnings ?? index === 0,
        )));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export async function resizeImage(file: File, maxDim = 1024, quality = 0.85) {
  const [result] = await resizeImageVariants(file, [{ maxDim, quality, includeQualityWarnings: true }]);
  return result!;
}

// ═══════════════════════════════════════════════
// IMAGE QUALITY ANALYSIS
// ═══════════════════════════════════════════════
function pixelLuminance(data: Uint8ClampedArray, index: number) {
  return 0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!;
}

function analyzeImageQuality(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const warnings: string[] = [];
  // Sample a grid of pixels (max ~100k pixels for performance)
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 100000)));
  const imgData = ctx.getImageData(0, 0, width, height).data;

  let brightnessSum = 0, brightnessCount = 0;
  let laplacianSum = 0, laplacianCount = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const gray = pixelLuminance(imgData, i);
      brightnessSum += gray;
      brightnessCount++;

      // Laplacian (edge detection) — skip border pixels
      if (x >= step && x < width - step && y >= step && y < height - step) {
        const top = (((y - step) * width + x) * 4);
        const bot = (((y + step) * width + x) * 4);
        const left = ((y * width + (x - step)) * 4);
        const right = ((y * width + (x + step)) * 4);
        const grayTop = pixelLuminance(imgData, top);
        const grayBot = pixelLuminance(imgData, bot);
        const grayLeft = pixelLuminance(imgData, left);
        const grayRight = pixelLuminance(imgData, right);
        const lap = Math.abs(grayTop + grayBot + grayLeft + grayRight - 4 * gray);
        laplacianSum += lap;
        laplacianCount++;
      }
    }
  }

  const avgBrightness = brightnessSum / brightnessCount;
  const avgLaplacian = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;

  if (avgBrightness < 40) warnings.push('Image looks very dark — try better lighting');
  else if (avgBrightness < 60) warnings.push('Image may be too dark for good results');
  if (avgBrightness > 230) warnings.push('Image looks overexposed — try less direct light');

  if (avgLaplacian < 3) warnings.push('Image appears blurry — try holding steady or tapping to focus');
  else if (avgLaplacian < 5) warnings.push('Image may be slightly blurry');

  return warnings;
}

// ═══════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════
export function isValidImageType(type: string) {
  return /^image\/(jpeg|png|gif|webp)$/.test(type);
}

/** Read an accepted image without changing its bytes or dimensions. */
export async function imageFileToBase64(file: File) {
  if (!(file instanceof File)) throw new Error('An image file is required.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
}

// ═══════════════════════════════════════════════
// FORMAT IMAGE BLOCK (provider-specific)
// ═══════════════════════════════════════════════
/**
 * Returns a single image content block in the format expected by the provider.
 */
export function formatImageBlock(base64: string, mediaType: string, _provider: string): ImageContentBlock {
  // All providers use OpenAI-compatible format
  return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } };
}

// ═══════════════════════════════════════════════
// BUILD VISION CONTENT ARRAY
// ═══════════════════════════════════════════════
/**
 * Builds a content array with image blocks + text block.
 */
export function buildVisionContent(imageBlocks: ImageContentBlock[], text: string, _provider: string) {
  const content: Array<ImageContentBlock | TextContentBlock> = [...imageBlocks];
  if (text) content.push({ type: 'text', text });
  return content;
}
