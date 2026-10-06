import type { PpqSettingsView, PpqTopupState } from './ppq-settings-contract.js';
import { ppqPaymentMethod } from './ppq-payment-methods.js';
interface Invoice { lightning_invoice?: string; payment_address?: string; invoice_id?: string; crypto_amount_due?: string; expires_at?: number }
export interface PpqTopupServices {
  view(): PpqSettingsView | null;
  provider(): string;
  key(): string;
  creditId(): string;
  create(amount: number, method: string): Promise<Invoice>;
  status(invoiceId: string): Promise<{ status?: string } | null>;
  qr(text: string): Promise<string>;
  refreshBalance(): Promise<unknown>;
  received(): void;
  returnToChat(): void;
  error(message: string): void;
}
export function createPpqTopupController(services: PpqTopupServices) {
  let sequence = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let returnTimer: ReturnType<typeof setTimeout> | null = null;
  let activeView: PpqSettingsView | null = null;
  function stopTimers(): void {
    if (pollTimer) clearInterval(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    if (returnTimer) clearTimeout(returnTimer);
    pollTimer = null; countdownTimer = null; returnTimer = null;
  }
  function clear(): void {
    ++sequence; stopTimers(); activeView?.clearPayment(); activeView = null;
  }
  function picker(forceOpen = false): void {
    const view = services.view();
    if (!view || services.provider() !== 'ppq') return;
    const wasOpen = view.getTopup().open;
    if (forceOpen && wasOpen) return;
    clear();
    view.setTopup({ open: forceOpen || !wasOpen, phase: 'picker', method: 'btc-lightning', amount: 0, custom: false, status: { text: '', tone: 'secondary' } });
  }
  function cancel(): void {
    const view = services.view(); clear();
    if (view) view.setTopup({ ...view.getTopup(), open: false, phase: 'picker', custom: false });
  }
  function select(methodId: string): void {
    const view = services.view();
    if (!view || services.provider() !== 'ppq' || !ppqPaymentMethod(methodId) || view.getTopup().phase !== 'picker') return;
    clear(); view.setTopup({ ...view.getTopup(), method: methodId, custom: false });
  }
  function custom(): void {
    const view = services.view();
    if (!view || services.provider() !== 'ppq' || view.getTopup().phase !== 'picker') return;
    view.setTopup({ ...view.getTopup(), custom: true }); view.focusCustomAmount();
  }
  async function create(amountInput: unknown): Promise<void> {
    const view = services.view();
    if (!view || services.provider() !== 'ppq' || !services.key()) return;
    if (view.getTopup().phase === 'pending') return;
    const method = ppqPaymentMethod(view.getTopup().method);
    const amount = Number(amountInput);
    if (!method || !Number.isFinite(amount) || amount < method.min) {
      services.error('Minimum amount is $' + (method?.min ?? 1)); return;
    }
    clear(); activeView = view;
    const attempt = sequence; const key = services.key(); const creditId = services.creditId();
    const current = () => attempt === sequence && view.isCurrent() && services.view() === view && services.provider() === 'ppq' && services.key() === key && services.creditId() === creditId;
    const initial: PpqTopupState = { open: true, phase: 'pending', method: method.id, amount, custom: false, status: { text: 'Generating invoice…', tone: 'secondary' } };
    view.setTopup(initial);
    try {
      const invoice = await services.create(amount, method.id);
      if (!current()) return;
      const text = invoice.lightning_invoice || invoice.payment_address || '';
      if (typeof text !== 'string' || !text || typeof invoice.invoice_id !== 'string' || !invoice.invoice_id) throw new Error('Incomplete payment invoice');
      let qrImage = '';
      try { qrImage = await services.qr(method.id === 'btc-lightning' ? text.toUpperCase() : text); } catch { /* Text and wallet link remain available. */ }
      if (!current()) return;
      view.showPayment({ method: method.id, amount, paymentText: text, qrImage, walletUri: method.scheme + text, cryptoAmount: Number.isFinite(Number(invoice.crypto_amount_due)) && Number(invoice.crypto_amount_due) > 0 ? Number(invoice.crypto_amount_due) : null });
      view.setTopup({ ...initial, phase: 'invoice', status: { text: 'Waiting for payment…', tone: 'secondary' } });
      const expires = invoice.expires_at ? invoice.expires_at * 1000 : 0;
      if (expires) countdownTimer = setInterval(() => {
        if (!current()) { clear(); return; }
        const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
        const text = remaining ? `Waiting for payment… ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Invoice expired';
        view.setTopup({ ...view.getTopup(), status: { text, tone: remaining ? 'secondary' : 'danger' } });
        if (!remaining && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      }, 1000);
      let reading = false;
      pollTimer = setInterval(async () => {
        if (!current()) { clear(); return; }
        if (reading) return;
        reading = true;
        try {
          const result = await services.status(invoice.invoice_id!);
          if (!current() || !result) return;
          const status = (result.status || '').toLowerCase();
          if (['paid', 'complete', 'settled', 'processing'].includes(status)) {
            stopTimers(); view.clearPayment();
            view.setTopup({ ...view.getTopup(), phase: 'success', status: { text: 'Payment received!', tone: 'success' } });
            services.received();
            await services.refreshBalance();
            if (current()) returnTimer = setTimeout(() => { if (current()) services.returnToChat(); }, 2000);
          } else if (status === 'expired' || status === 'invalid') {
            stopTimers(); view.setTopup({ ...view.getTopup(), status: { text: 'Invoice expired. Try again.', tone: 'danger' } });
          }
        } catch { /* The same owned invoice remains retryable on the next poll. */ }
        finally { reading = false; }
      }, 3000);
    } catch {
      if (current()) view.setTopup({ ...initial, phase: 'error', status: { text: 'Could not create this invoice. Please retry.', tone: 'danger' } });
    }
  }
  function submitCustom(): void {
    const view = services.view(); if (!view) return;
    const raw = view.readCustomAmount().replace(/[^0-9.]/g, '');
    void create(parseFloat(raw));
  }
  return { clear, picker, cancel, select, custom, create, submitCustom };
}
