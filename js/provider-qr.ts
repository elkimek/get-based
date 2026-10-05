export interface QRCode {
  addData(data: string): void;
  make(): void;
  createSvgTag(options: { cellSize: number; margin: number; scalable?: boolean }): string;
}
export type QRCodeFactory = (typeNumber: number, correctionLevel: string) => QRCode;

// provider-qr.js - shared QR-code loader for provider funding and top-up panels

import { loadScriptOnce } from './utils.js';

declare const qrcode: QRCodeFactory | undefined;

let qrCodeLoad: Promise<QRCodeFactory> | null = null;

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
