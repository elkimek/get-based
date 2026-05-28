#!/usr/bin/env node
// test-image-utils.js — Image attachment utilities + vision support.
//
// Run: node tests/test-image-utils.js  (or via npm test)
//
// DOM-runtime assertions (HTML element existence + document.styleSheets
// CSS-rule checks) live in tests/test-image-utils-dom.js and stay on
// the puppeteer runner — they can't run in Node.

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

// image-utils.js + pdf-import.js + chat-images.js expose helpers via
// Object.assign(window, ...). chat-images.js was extracted from chat.js
// in v1.21.9 and now owns the pending-queue / handler-binding helpers
// the old monolithic chat.js used to export.
await import('../js/state.js');
await import('../js/image-utils.js');
await import('../js/pdf-import.js');
await import('../js/chat-images.js');

// ═══════════════════════════════════════
// 1. Module exports available on window
// ═══════════════════════════════════════
console.log('1. Module Exports');

assert('resizeImage exported', typeof window.resizeImage === 'function');
assert('isValidImageType exported', typeof window.isValidImageType === 'function');
assert('formatImageBlock exported', typeof window.formatImageBlock === 'function');
assert('buildVisionContent exported', typeof window.buildVisionContent === 'function');
assert('supportsVision exported', typeof window.supportsVision === 'function');
assert('addImageAttachment exported', typeof window.addImageAttachment === 'function');
assert('removeImageAttachment exported', typeof window.removeImageAttachment === 'function');
assert('clearAttachments exported', typeof window.clearAttachments === 'function');
assert('updateAttachButtonVisibility exported', typeof window.updateAttachButtonVisibility === 'function');
assert('initChatImageHandlers exported', typeof window.initChatImageHandlers === 'function');

// ═══════════════════════════════════════
// 2. isValidImageType
// ═══════════════════════════════════════
console.log('2. isValidImageType');

assert('JPEG valid', window.isValidImageType('image/jpeg'));
assert('PNG valid', window.isValidImageType('image/png'));
assert('GIF valid', window.isValidImageType('image/gif'));
assert('WebP valid', window.isValidImageType('image/webp'));
assert('PDF rejected', !window.isValidImageType('application/pdf'));
assert('SVG rejected', !window.isValidImageType('image/svg+xml'));
assert('empty rejected', !window.isValidImageType(''));

// ═══════════════════════════════════════
// 3. formatImageBlock
// ═══════════════════════════════════════
console.log('3. formatImageBlock');

const b64 = 'dGVzdA=='; // "test" in base64

const openaiBlock = window.formatImageBlock(b64, 'image/png', 'openrouter');
assert('OpenAI block type', openaiBlock.type === 'image_url');
assert('OpenAI URL starts with data:', openaiBlock.image_url.url.startsWith('data:image/png;base64,'));
assert('OpenAI URL contains base64', openaiBlock.image_url.url.includes(b64));

const veniceBlock = window.formatImageBlock(b64, 'image/jpeg', 'venice');
assert('Venice uses OpenAI format', veniceBlock.type === 'image_url');

const ollamaBlock = window.formatImageBlock(b64, 'image/jpeg', 'ollama');
assert('Ollama uses OpenAI format', ollamaBlock.type === 'image_url');

// ═══════════════════════════════════════
// 4. buildVisionContent
// ═══════════════════════════════════════
console.log('4. buildVisionContent');

const imgBlocks = [openaiBlock, openaiBlock];
const content = window.buildVisionContent(imgBlocks, 'What is this?', 'anthropic');
assert('Vision content has images + text', content.length === 3);
assert('Last element is text', content[2].type === 'text' && content[2].text === 'What is this?');

const noText = window.buildVisionContent([openaiBlock], '', 'openrouter');
assert('Empty text omitted', noText.length === 1);

// ═══════════════════════════════════════
// 5. PDF text quality assessment
// ═══════════════════════════════════════
console.log('5. assessTextQuality');

assert('assessTextQuality exported', typeof window.assessTextQuality === 'function');
assert('Empty text = empty', window.assessTextQuality('') === 'empty');
assert('Null text = empty', window.assessTextQuality(null) === 'empty');
assert('Short text = poor', window.assessTextQuality('just a few words') === 'poor');
assert('Good text', window.assessTextQuality('This is a normal lab report with glucose creatinine albumin and many other biomarker results that span multiple lines of text with values and reference ranges included for comprehensive analysis') === 'good');

// HTML structure + CSS-rule checks (sections 6+7) live in test-image-utils-dom.js
// (puppeteer-only) — can't run in Node without a real browser DOM.

// ═══════════════════════════════════════
// 8. PDF image fallback exports
// ═══════════════════════════════════════
console.log('8. PDF Image Fallback');

assert('extractPDFImages exported', typeof window.extractPDFImages === 'function');
assert('parseLabPDFWithAIImages exported', typeof window.parseLabPDFWithAIImages === 'function');

// ═══════════════════════════════════════
// 9. Source code checks
// ═══════════════════════════════════════
console.log('9. Source Code');

const apiSrc = await fetchWithRetry('js/api.js');
assert('supportsVision function in api.js', apiSrc.includes('export function supportsVision'));
assert('Vision models cached in fetchOpenRouterModels', apiSrc.includes('labcharts-openrouter-vision-models'));
assert('Ollama image normalization', apiSrc.includes('ollamaMsg.images = images'));

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
assert('Pending attachments variable lives in chat-images.js',
  chatImagesSrc.includes('_pendingAttachments'));
assert('chat-images.js imports isValidImageType + resizeImage',
  chatImagesSrc.includes('isValidImageType') && chatImagesSrc.includes('resizeImage'));
assert('Image badge in renderChatMessages', chatRenderSrc.includes('chat-image-badge'));
assert('buildVisionContent used in sendChatMessage', chatSendSrc.includes('buildVisionContent(imageBlocks'));

const pdfSrc = await fetchWithRetry('js/pdf-import.js');
assert('assessTextQuality in pdf-import', pdfSrc.includes('export function assessTextQuality'));
assert('extractPDFImages in pdf-import', pdfSrc.includes('export async function extractPDFImages'));
assert('parseLabPDFWithAIImages in pdf-import', pdfSrc.includes('export async function parseLabPDFWithAIImages'));
assert('handleImageFile in pdf-import', pdfSrc.includes('export async function handleImageFile'));
assert('Image mode dialog for poor text quality', pdfSrc.includes("_showImageModeDialog"));
assert('PDF reads use FileReader fallback after Blob.arrayBuffer aborts', pdfSrc.includes('function readFileArrayBuffer') && pdfSrc.includes('new FileReader()'));
assert('PDF text extraction uses resilient file read helper', pdfSrc.includes('const arrayBuffer = await readFileArrayBuffer(file);'));

// CSS source-string checks — runtime "rule is loaded in stylesheet"
// version lives in test-image-utils-dom.js (puppeteer).
const cssSrc = [
  await fetchWithRetry('styles.css'),
  await fetchWithRetry('css/chat-panel.css'),
  await fetchWithRetry('css/chat-composer.css'),
  await fetchWithRetry('css/chat-redesign.css'),
].join('\n');
assert('.chat-attach-btn style exists in CSS bundle', cssSrc.includes('.chat-attach-btn'));
assert('.chat-attach-preview style exists in CSS bundle', cssSrc.includes('.chat-attach-preview'));
assert('.chat-attach-thumb style exists in CSS bundle', cssSrc.includes('.chat-attach-thumb'));
assert('.chat-attach-remove style exists in CSS bundle', cssSrc.includes('.chat-attach-remove'));
assert('.chat-image-badge style exists in CSS bundle', cssSrc.includes('.chat-image-badge'));
assert('.chat-drop-active style exists in CSS bundle', cssSrc.includes('.chat-drop-active'));

// HTML structure source-string checks — puppeteer file confirms the
// real DOM has these IDs; here we confirm index.html still defines them.
const htmlSrc = await fetchWithRetry('index.html');
assert('chat-attach-btn defined in index.html', htmlSrc.includes('id="chat-attach-btn"'));
assert('chat-attach-preview defined in index.html', htmlSrc.includes('id="chat-attach-preview"'));
assert('chat-image-input defined in index.html', htmlSrc.includes('id="chat-image-input"'));
assert('chat-input-row defined in index.html', htmlSrc.includes('chat-input-row'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
