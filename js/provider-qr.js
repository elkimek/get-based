// provider-qr.js - shared QR-code loader for provider funding and top-up panels

import { loadScriptOnce } from './utils.js';

let qrCodeLoad = null;

export async function ensureQRCode() {
  if (typeof qrcode === 'function') return qrcode;
  if (!qrCodeLoad) {
    qrCodeLoad = loadScriptOnce('/vendor/qrcode-generator.js').then(() => {
      if (typeof qrcode !== 'function') throw new Error('QR code library did not initialize');
      return qrcode;
    });
  }
  return qrCodeLoad;
}
