#!/usr/bin/env node
// test-image-utils.js — Image attachment utilities + vision support.
//
// Run: node tests/test-image-utils.js  (or via npm test)
//
// DOM-runtime assertions (HTML element existence + document.styleSheets
// CSS-rule checks) live in tests/playwright/image-utils-dom.spec.js.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
function fetchWithRetry(rel) { return Promise.resolve(read(rel)); }

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Image Utils Tests ===\n');

// PDF and image helpers are consumed through their module APIs.
await import('../js/state.js');
const api = await import('../js/api.js');
const imageUtils = await import('../js/image-utils.js');
const pdfImport = await import('../js/pdf-import.js');
const chatImages = await import('../js/chat-images.js');
const { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } = imageUtils;

// ═══════════════════════════════════════
// 1. Module exports
// ═══════════════════════════════════════
console.log('1. Module Exports');

assert('resizeImage exported as module function', typeof resizeImage === 'function');
assert('isValidImageType exported as module function', typeof isValidImageType === 'function');
assert('formatImageBlock exported as module function', typeof formatImageBlock === 'function');
assert('buildVisionContent exported as module function', typeof buildVisionContent === 'function');
assert('image utility exports stay module-scoped',
  typeof window.resizeImage === 'undefined'
  && typeof window.isValidImageType === 'undefined'
  && typeof window.formatImageBlock === 'undefined'
  && typeof window.buildVisionContent === 'undefined');
assert('supportsVision exported from api module', typeof api.supportsVision === 'function');
const chatImageExports = [
  'toggleHDMode',
  'addImageAttachment',
  'removeImageAttachment',
  'renderAttachmentPreview',
  'openImageLightbox',
  'clearAttachments',
  'updateAttachButtonVisibility',
  'initChatImageHandlers',
];
for (const name of chatImageExports) {
  assert(`chat-images.${name} exported`, typeof chatImages[name] === 'function');
  assert(`window.${name} stays module-only`, typeof window[name] === 'undefined');
}

// ═══════════════════════════════════════
// 2. isValidImageType
// ═══════════════════════════════════════
console.log('2. isValidImageType');

assert('JPEG valid', isValidImageType('image/jpeg'));
assert('PNG valid', isValidImageType('image/png'));
assert('GIF valid', isValidImageType('image/gif'));
assert('WebP valid', isValidImageType('image/webp'));
assert('PDF rejected', !isValidImageType('application/pdf'));
assert('SVG rejected', !isValidImageType('image/svg+xml'));
assert('empty rejected', !isValidImageType(''));

// ═══════════════════════════════════════
// 3. formatImageBlock
// ═══════════════════════════════════════
console.log('3. formatImageBlock');

const b64 = 'dGVzdA=='; // "test" in base64

const openaiBlock = formatImageBlock(b64, 'image/png', 'openrouter');
assert('OpenAI block type', openaiBlock.type === 'image_url');
assert('OpenAI URL starts with data:', openaiBlock.image_url.url.startsWith('data:image/png;base64,'));
assert('OpenAI URL contains base64', openaiBlock.image_url.url.includes(b64));

const veniceBlock = formatImageBlock(b64, 'image/jpeg', 'venice');
assert('Venice uses OpenAI format', veniceBlock.type === 'image_url');

const ollamaBlock = formatImageBlock(b64, 'image/jpeg', 'ollama');
assert('Ollama uses OpenAI format', ollamaBlock.type === 'image_url');

// ═══════════════════════════════════════
// 4. buildVisionContent
// ═══════════════════════════════════════
console.log('4. buildVisionContent');

const imgBlocks = [openaiBlock, openaiBlock];
const content = buildVisionContent(imgBlocks, 'What is this?', 'anthropic');
assert('Vision content has images + text', content.length === 3);
assert('Last element is text', content[2].type === 'text' && content[2].text === 'What is this?');

const noText = buildVisionContent([openaiBlock], '', 'openrouter');
assert('Empty text omitted', noText.length === 1);

// ═══════════════════════════════════════
// 5. PDF text quality assessment
// ═══════════════════════════════════════
console.log('5. assessTextQuality');

assert('assessTextQuality exported', typeof pdfImport.assessTextQuality === 'function');
assert('Empty text = empty', pdfImport.assessTextQuality('') === 'empty');
assert('Null text = empty', pdfImport.assessTextQuality(null) === 'empty');
assert('Short text = poor', pdfImport.assessTextQuality('just a few words') === 'poor');
assert('Good text', pdfImport.assessTextQuality('This is a normal lab report with glucose creatinine albumin and many other biomarker results that span multiple lines of text with values and reference ranges included for comprehensive analysis') === 'good');

// HTML structure + CSS-rule checks (sections 6+7) live in
// tests/playwright/image-utils-dom.spec.js.

// ═══════════════════════════════════════
// 8. PDF image fallback exports
// ═══════════════════════════════════════
console.log('8. PDF Image Fallback');

assert('extractPDFImages exported', typeof pdfImport.extractPDFImages === 'function');
assert('parseLabPDFWithAIImages exported', typeof pdfImport.parseLabPDFWithAIImages === 'function');
assert('PDF import helpers stay module-only', !('assessTextQuality' in window)
  && !('extractPDFImages' in window)
  && !('parseLabPDFWithAIImages' in window));

// ═══════════════════════════════════════
// 9. Source code checks
// ═══════════════════════════════════════
console.log('9. Source Code');

const ollamaProviderSrc = await fetchWithRetry('js/local-ai-provider-ollama.js');
const apiModelsSrc = await fetchWithRetry('js/api-models.js');
assert('supportsVision function in api-models.js', apiModelsSrc.includes('export function supportsVision'));
assert('Vision models cached in fetchOpenRouterModels', apiModelsSrc.includes('labcharts-openrouter-vision-models'));
assert('Ollama image normalization', ollamaProviderSrc.includes('ollamaMessage.images = images'));

const chatRenderSrc = await fetchWithRetry('js/chat-render.js');
const chatSendSrc = await fetchWithRetry('js/chat-send.js');
// Image-attachment flow was extracted to js/chat-images.js in v1.21.9.
// chat-send.js keeps the image-utils import for send-time helpers
// (buildVisionContent / formatImageBlock) and consumes the pending
// queue via chat-images.js.
const chatImagesSrc = await fetchWithRetry('js/chat-images.js');
assert('chat-images imports supportsVision', chatImagesSrc.includes('supportsVision'));
assert('chat-send.js imports image-utils for send-time helpers', chatSendSrc.includes("from './image-utils.js'"));
assert('chat-send.js imports from chat-images for pending-queue access',
  chatSendSrc.includes("from './chat-images.js'") && chatSendSrc.includes('getPendingAttachments'));
assert('chat-send.js wires send-button refresh into chat-images without a window facade',
  chatImagesSrc.includes('export function configureChatImages')
    && chatImagesSrc.includes("typeof deps.updateSendButtonState === 'function'")
    && chatImagesSrc.includes('chatImageDeps.updateSendButtonState()')
    && chatSendSrc.includes('configureChatImages({ updateSendButtonState })')
    && !chatSendSrc.includes('Object.assign(window, { updateSendButtonState')
    && !chatImagesSrc.includes('window.updateSendButtonState'));
assert('Pending attachments variable lives in chat-images.js',
  chatImagesSrc.includes('_pendingAttachments'));
assert('chat-images.js imports isValidImageType + resizeImage',
  chatImagesSrc.includes('isValidImageType') && chatImagesSrc.includes('resizeImage'));
assert('Image badge in renderChatMessages', chatRenderSrc.includes('chat-image-badge'));
assert('buildVisionContent used in sendChatMessage', chatSendSrc.includes('buildVisionContent(imageBlocks'));

const pdfSrc = await fetchWithRetry('js/pdf-import.js');
const pdfFileHandlersSrc = await fetchWithRetry('js/pdf-import-file-handlers.js');
const pdfFileUtilsSrc = await fetchWithRetry('js/pdf-import-file-utils.js');
assert('assessTextQuality in pdf-import', pdfSrc.includes('export function assessTextQuality'));
assert('extractPDFImages in pdf-import', pdfSrc.includes('export async function extractPDFImages'));
assert('parseLabPDFWithAIImages in pdf-import', pdfSrc.includes('export async function parseLabPDFWithAIImages'));
assert('handleImageFile in pdf-import', pdfSrc.includes('export async function handleImageFile'));
assert('Image mode dialog for poor text quality', pdfFileHandlersSrc.includes("_showImageModeDialog"));
assert('PDF reads use FileReader fallback after Blob.arrayBuffer aborts',
  pdfFileUtilsSrc.includes('function readFileArrayBuffer') && pdfFileUtilsSrc.includes('new FileReader()'));
assert('PDF text extraction uses resilient file read helper',
  pdfFileUtilsSrc.includes('const arrayBuffer = await readFileArrayBuffer(file);'));

// CSS source-string checks — runtime "rule is loaded in stylesheet"
// version lives in tests/playwright/image-utils-dom.spec.js.
const cssSrc = [
  await fetchWithRetry('styles.css'),
  await fetchWithRetry('css/chat-panel.css'),
  await fetchWithRetry('css/chat-panel-open.css'),
  await fetchWithRetry('css/chat-composer.css'),
  await fetchWithRetry('css/chat-redesign.css'),
  await fetchWithRetry('css/chat-redesign-open.css'),
].join('\n');
assert('.chat-attach-btn style exists in CSS bundle', cssSrc.includes('.chat-attach-btn'));
assert('.chat-attach-preview style exists in CSS bundle', cssSrc.includes('.chat-attach-preview'));
assert('.chat-attach-thumb style exists in CSS bundle', cssSrc.includes('.chat-attach-thumb'));
assert('.chat-attach-remove style exists in CSS bundle', cssSrc.includes('.chat-attach-remove'));
assert('.chat-image-badge style exists in CSS bundle', cssSrc.includes('.chat-image-badge'));
assert('.chat-drop-active style exists in CSS bundle', cssSrc.includes('.chat-drop-active'));

// HTML structure source-string checks — Playwright file confirms the
// real DOM has these IDs; here we confirm index.html still defines them.
const htmlSrc = await fetchWithRetry('index.html');
assert('chat-attach-btn defined in index.html', htmlSrc.includes('id="chat-attach-btn"'));
assert('chat-attach-preview defined in index.html', htmlSrc.includes('id="chat-attach-preview"'));
assert('chat-image-input defined in index.html', htmlSrc.includes('id="chat-image-input"'));
assert('chat-input-row defined in index.html', htmlSrc.includes('chat-input-row'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
