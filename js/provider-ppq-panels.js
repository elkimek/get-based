// provider-ppq-panels.js - PPQ account, balance, and top-up panel behavior.

import { escapeHTML, escapeAttr, showNotification, showConfirmDialog } from './utils.js';
import {
  getPpqKey,
  savePpqKey,
  fetchPpqModels,
  validatePpqKey,
  createPpqAccount,
  getPpqBalance,
  savePpqCreditId,
  createPpqTopup,
  checkPpqTopupStatus,
} from './api.js';
import { updateKeyCache } from './crypto.js';
import { ensureQRCode } from './provider-qr.js';
import { renderAIProviderPanel } from './provider-panel-renderers.js';
import { renderPpqModelDropdown } from './provider-model-controls.js';

let returnToChatIfOnboarding = function() {};
let _ppqCreating = false;
let _ppqTopupPollTimer = null;
let _ppqCountdownTimer = null;

export function configurePpqPanels(options = {}) {
  if (typeof options.returnToChatIfOnboarding === 'function') {
    returnToChatIfOnboarding = options.returnToChatIfOnboarding;
  }
}

export function clearPpqTopupTimers() {
  if (_ppqTopupPollTimer) { clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null; }
  if (_ppqCountdownTimer) { clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null; }
}

function _ppqBalanceHtml(balance) {
  const v = parseFloat(balance);
  const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
}

export function initSettingsPpqPanel() {
  const ppqKey = getPpqKey();
  if (ppqKey && document.getElementById('ppq-model-area')) {
    fetchPpqModels(ppqKey).then(function(models) { if (models.length) renderPpqModelDropdown(models); });
    getPpqBalance().then(function(balance) {
      const el = document.getElementById('ppq-balance');
      if (el && balance != null) {
        el.innerHTML = _ppqBalanceHtml(balance);
        if (parseFloat(balance) === 0 && document.getElementById('ppq-topup-area')) showPpqTopup();
      }
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
}

export async function handleCreatePpqAccount() {
  if (_ppqCreating) return;
  _ppqCreating = true;
  const createBtn = document.querySelector('[onclick="handleCreatePpqAccount()"]');
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating\u2026'; }
  const status = document.getElementById('ppq-key-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Creating account\u2026</span>';
  try {
    const result = await createPpqAccount();
    if (!result.success && !result.api_key) throw new Error('Account creation failed');
    await savePpqKey(result.api_key);
    savePpqCreditId(result.credit_id);
    await fetchPpqModels(result.api_key);
    const panel = document.getElementById('ai-provider-panel');
    if (panel) {
      panel.innerHTML = `<div class="ai-provider-panel">
        <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
          <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your account details</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">PPQ accounts are anonymous \u2014 <strong>there is no way to recover a lost key</strong>. Copy both values now and store them somewhere safe.</div>
          <label style="font-size:11px;color:var(--text-muted)">API Key</label>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(result.api_key)}</div>
          <label style="font-size:11px;color:var(--text-muted);margin-top:8px;display:block">Credit ID <span style="font-size:10px">(enter at <a href="https://ppq.ai/invite/8f3017cd" target="_blank" rel="noopener" style="color:var(--accent)">ppq.ai</a> to access your account on the web)</span></label>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(result.credit_id)}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="import-btn import-btn-primary" style="font-size:12px" onclick="navigator.clipboard.writeText('API Key: ${escapeAttr(result.api_key)}\\nCredit ID: ${escapeAttr(result.credit_id)}');this.textContent='\u2713 Copied (clears in 60s)';clearTimeout(window._ppqClipTimer);window._ppqClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Both</button>
            <button class="import-btn import-btn-secondary" style="font-size:12px" onclick="dismissPpqKeyReveal()">I\u2019ve saved it</button>
          </div>
        </div>
      </div>`;
    }
  } catch (e) {
    if (status) status.innerHTML = '<span style="color:var(--red)">Failed to create account: ' + escapeHTML(e.message) + '</span>';
    if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Account (instant, no signup)'; }
  }
  _ppqCreating = false;
}

export function dismissPpqKeyReveal() {
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('ppq');
  let cachedModels = []; try { cachedModels = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
  if (cachedModels.length) renderPpqModelDropdown(cachedModels);
  getPpqBalance().then(function(balance) {
    const el = document.getElementById('ppq-balance');
    if (el && balance != null) el.innerHTML = _ppqBalanceHtml(balance);
  });
  showPpqTopup();
  showNotification('Account ready \u2014 top up to start using AI', 'info');
}

export async function handleSavePpqKey() {
  const input = document.getElementById('ppq-key-input');
  const btn = document.getElementById('save-ppq-key-btn');
  const status = document.getElementById('ppq-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validatePpqKey(key);
  if (result.valid) {
    await savePpqKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected \u2014 loading models\u2026</span>';
    const models = await fetchPpqModels(key);
    if (models.length) {
      renderPpqModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    }
    showNotification('PPQ key saved', 'success');
    returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export async function handleRemovePpqKey() {
  const balance = await getPpqBalance();
  const hasFunds = balance != null && parseFloat(balance) > 0;
  const msg = hasFunds
    ? `This account has $${parseFloat(balance).toFixed(2)} remaining. Removing this key will permanently lose access to those funds unless you\u2019ve saved the key elsewhere.\n\nRemove PPQ key?`
    : 'Remove PPQ key? Make sure you\u2019ve saved it if you want to reuse this account later.';
  if (await showConfirmDialog(msg)) {
    localStorage.removeItem('labcharts-ppq-key');
    updateKeyCache('labcharts-ppq-key', null);
    localStorage.removeItem('labcharts-ppq-models');
    localStorage.removeItem('labcharts-ppq-model');
    localStorage.removeItem('labcharts-ppq-pricing');
    localStorage.removeItem('labcharts-ppq-vision-models');
    localStorage.removeItem('labcharts-ppq-credit-id');
    showNotification('PPQ key removed', 'info');
    window.openSettingsModal?.();
  }
}

export async function refreshPpqBalance() {
  const el = document.getElementById('ppq-balance');
  if (!el) return;
  el.textContent = 'Balance: refreshing\u2026';
  const balance = await getPpqBalance();
  if (balance != null) el.innerHTML = _ppqBalanceHtml(balance);
  else el.textContent = 'Balance: unavailable';
}

const _ppqSvg = {
  lightning: '<svg viewBox="0 0 282 282"><circle cx="141" cy="141" r="141" fill="#7B1AF7"/><path d="M79.76 144.05L173.76 63.05C177.86 60.42 181.76 63.05 179.26 67.55L149.26 126.55H202.76C202.76 126.55 211.26 126.55 202.76 133.55L110.26 215.05C103.76 220.55 99.26 217.55 103.76 209.05L132.76 151.55H79.76C79.76 151.55 71.26 151.55 79.76 144.05Z" fill="#fff"/></svg>',
  btc: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#fff" fill-rule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"/></svg>',
  xmr: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#FF6600"/><path fill="#fff" fill-rule="nonzero" d="M15.97 5.235c5.985 0 10.825 4.84 10.825 10.824a11.07 11.07 0 01-.558 3.432h-3.226v-9.094l-7.04 7.04-7.04-7.04v9.094H5.704a11.07 11.07 0 01-.557-3.432c0-5.984 4.84-10.824 10.824-10.824zM14.358 19.02L16 20.635l1.613-1.614 3.051-3.08v5.72h4.547a10.806 10.806 0 01-9.24 5.192c-3.902 0-7.334-2.082-9.24-5.192h4.546v-5.72l3.08 3.08z"/></svg>',
  ltc: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#A6A9AA"/><path fill="#fff" d="M10.427 19.214L9 19.768l.688-2.759 1.444-.58L13.213 8h5.129l-1.519 6.196 1.41-.571-.68 2.75-1.427.571-.848 3.483H23L22.127 24H9.252z"/></svg>',
  liquid: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0D1437"/><path fill="#22E1C9" d="M16 7c-2.4 3.5-6 7.5-6 11.5C10 21.54 12.69 24 16 24s6-2.46 6-5.5C22 14.5 18.4 10.5 16 7zm0 14.5c-1.93 0-3.5-1.32-3.5-3 0-2.25 2.13-4.82 3.5-6.71 1.37 1.89 3.5 4.46 3.5 6.71 0 1.68-1.57 3-3.5 3z"/></svg>',
};
const PPQ_METHODS = [
  { id: 'btc-lightning', svg: _ppqSvg.lightning, label: 'Lightning', min: 1, amounts: [1, 2, 5, 10] },
  { id: 'btc', svg: _ppqSvg.btc, label: 'Bitcoin', min: 10, amounts: [10, 25, 50, 100] },
  { id: 'xmr', svg: _ppqSvg.xmr, label: 'Monero', min: 5, amounts: [5, 10, 25, 50] },
  { id: 'ltc', svg: _ppqSvg.ltc, label: 'Litecoin', min: 2, amounts: [2, 5, 10, 25] },
  { id: 'lbtc', svg: _ppqSvg.liquid, label: 'Liquid', min: 2, amounts: [2, 5, 10, 25] },
];
let _ppqSelectedMethod = 'btc-lightning';

function _ppqMethodBtn(m, active) {
  return `<button class="${active ? 'ppq-method-btn active' : 'ppq-method-btn'}" onclick="selectPpqMethod('${m.id}')"><span class="ppq-method-icon">${m.svg}</span><span class="ppq-method-label">${m.label}</span></button>`;
}

export function showPpqTopup() {
  const area = document.getElementById('ppq-topup-area');
  if (!area) return;
  const toggle = document.getElementById('ppq-topup-toggle');
  if (area.style.display !== 'none') {
    area.style.display = 'none';
    if (toggle) toggle.textContent = 'Top Up';
    return;
  }
  area.style.display = 'block';
  if (toggle) toggle.textContent = 'Close';
  _ppqSelectedMethod = 'btc-lightning';
  if (!document.getElementById('ppq-topup-style')) {
    const style = document.createElement('style');
    style.id = 'ppq-topup-style';
    style.textContent = `.ppq-method-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;border:2px solid var(--border);background:var(--bg-primary);color:var(--text-muted);cursor:pointer;flex:1;min-width:0;transition:all .15s}
.ppq-method-btn:hover{border-color:var(--text-muted);color:var(--text-primary)}
.ppq-method-btn.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--bg-primary));box-shadow:0 0 0 1px var(--accent)}
.ppq-method-btn.active .ppq-method-label{color:var(--text-primary)}
.ppq-method-icon{width:24px;height:24px;display:block}
.ppq-method-icon svg{width:100%;height:100%}
.ppq-method-label{font-size:10px;font-weight:600;white-space:nowrap;letter-spacing:.01em}
.ppq-amt-btn{padding:7px 0;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:13px;font-weight:600;flex:1;text-align:center;transition:all .15s}
.ppq-amt-btn:hover{border-color:var(--accent);color:var(--accent)}
@keyframes ppq-pulse{0%,100%{opacity:1}50%{opacity:.3}}`;
    document.head.appendChild(style);
  }
  _renderPpqTopupPicker(area);
}

function _renderPpqTopupPicker(area) {
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  area.innerHTML = `<div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:10px;border:1px solid var(--border)">
    <div style="display:flex;gap:6px;margin-bottom:10px">${PPQ_METHODS.map(function(m) { return _ppqMethodBtn(m, m.id === _ppqSelectedMethod); }).join('')}</div>
    <div style="display:flex;gap:6px">${method.amounts.map(function(v) {
      return '<button class="ppq-amt-btn" onclick="doPpqTopup(' + v + ')">$' + v + '</button>';
    }).join('')}<div id="ppq-custom-slot" style="flex:1;display:flex"><button class="ppq-amt-btn" style="width:100%;color:var(--text-muted)" onclick="ppqShowCustomInput()">$\u2026</button></div></div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">$2 is enough for onboarding, a few imports, and chats \u00b7 min $${method.min}</div>
  </div>`;
}

export function selectPpqMethod(methodId) {
  _ppqSelectedMethod = methodId;
  const area = document.getElementById('ppq-topup-area');
  if (area) _renderPpqTopupPicker(area);
}

export function ppqShowCustomInput() {
  const slot = document.getElementById('ppq-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="decimal" id="ppq-custom-amount" class="ppq-amt-btn" style="width:100%;text-align:center;cursor:text" placeholder="$" onkeydown="if(event.key===\'Enter\')doPpqTopupCustom();if(event.key===\'Escape\')selectPpqMethod(\'' + _ppqSelectedMethod + '\')" onblur="if(this.value.trim())doPpqTopupCustom()">';
  const input = document.getElementById('ppq-custom-amount');
  if (input) input.focus();
}

export function doPpqTopupCustom() {
  const input = document.getElementById('ppq-custom-amount');
  if (!input) return;
  const raw = input.value.replace(/[^0-9.]/g, '');
  const amount = parseFloat(raw);
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  if (isNaN(amount) || amount < method.min) {
    showNotification('Minimum amount is $' + method.min, 'error');
    return;
  }
  doPpqTopup(amount);
}

export async function doPpqTopup(amount) {
  const area = document.getElementById('ppq-topup-area');
  if (!area) return;
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  area.innerHTML = '<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--text-muted)">Generating invoice\u2026</div>';
  try {
    const result = await createPpqTopup(amount, _ppqSelectedMethod);
    const payString = result.lightning_invoice || result.payment_address || '';
    const invoiceId = result.invoice_id || '';
    const cryptoAmount = result.crypto_amount_due ? parseFloat(result.crypto_amount_due) : null;
    const isLightning = _ppqSelectedMethod === 'btc-lightning';
    let qrSvg = '';
    try {
      const makeQr = await ensureQRCode();
      const qr = makeQr(0, 'L');
      qr.addData(isLightning ? payString.toUpperCase() : payString);
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    } catch { /* QR generation failed, show text only */ }
    const walletUri = isLightning ? 'lightning:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'btc' || _ppqSelectedMethod === 'lbtc' ? 'bitcoin:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'ltc' ? 'litecoin:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'xmr' ? 'monero:' + escapeAttr(payString)
      : '#';
    const copyLabel = isLightning ? 'Copy Invoice' : 'Copy Address';
    const detailLabel = isLightning ? 'Show invoice text' : 'Show address';
    const cryptoHint = cryptoAmount ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + cryptoAmount + '</div>' : '';
    area.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${qrSvg ? '<div style="flex-shrink:0;background:#fff;padding:6px;border-radius:6px;width:140px;height:140px">' + qrSvg + '</div>' : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;display:flex;align-items:center;gap:4px"><span style="width:16px;height:16px;display:inline-block">${method.svg}</span> ${method.label} \u2014 $${parseFloat(amount).toFixed(2)}</div>
          ${cryptoHint}
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
            <button class="import-btn import-btn-primary" style="font-size:11px;padding:4px 10px" onclick="navigator.clipboard.writeText('${escapeAttr(payString)}');this.textContent='\u2713 Copied!'">${copyLabel}</button>
            <a href="${walletUri}" class="import-btn import-btn-secondary" style="font-size:11px;padding:4px 10px;text-decoration:none;text-align:center">Open in Wallet</a>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:4px 10px" onclick="cancelPpqTopup()">Cancel</button>
          </div>
          <div id="ppq-topup-status" style="margin-top:6px;font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px"><span id="ppq-topup-dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;animation:ppq-pulse 1.5s ease-in-out infinite"></span> <span id="ppq-topup-countdown"></span></div>
        </div>
      </div>
      <details style="margin-top:6px"><summary style="font-size:11px;color:var(--text-muted);cursor:pointer">${detailLabel}</summary>
        <div style="font-family:monospace;font-size:9px;word-break:break-all;background:var(--bg-primary);padding:6px;border-radius:4px;border:1px solid var(--border);color:var(--text-secondary);max-height:80px;overflow-y:auto;user-select:all;cursor:text;margin-top:4px">${escapeHTML(payString)}</div>
      </details>
    </div>`;
    const expiresTs = result.expires_at ? result.expires_at * 1000 : 0;
    _ppqCountdownTimer = setInterval(function() {
      const cdEl = document.getElementById('ppq-topup-countdown');
      if (!cdEl || !expiresTs) return;
      const remaining = Math.max(0, Math.floor((expiresTs - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      cdEl.textContent = remaining > 0
        ? 'Waiting for payment\u2026 ' + mins + ':' + (secs < 10 ? '0' : '') + secs
        : 'Invoice expired';
      if (remaining <= 0) clearInterval(_ppqCountdownTimer);
    }, 1000);
    _ppqTopupPollTimer = setInterval(async function() {
      try {
        const status = await checkPpqTopupStatus(invoiceId);
        if (!status) return;
        const s = (status.status || '').toLowerCase();
        if (s === 'paid' || s === 'complete' || s === 'settled' || s === 'processing') {
          clearPpqTopupTimers();
          const topupArea = document.getElementById('ppq-topup-area');
          if (topupArea) {
            topupArea.innerHTML = '<div style="margin-top:8px;padding:16px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--green);text-align:center"><div style="font-size:24px;margin-bottom:6px">\u2713</div><div style="font-size:13px;font-weight:600;color:var(--green)">Payment received!</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">$' + parseFloat(amount).toFixed(2) + ' added to your balance</div></div>';
          }
          showNotification('Top-up successful!', 'success');
          const balance = await getPpqBalance();
          const balEl = document.getElementById('ppq-balance');
          if (balEl && balance != null) balEl.innerHTML = _ppqBalanceHtml(balance);
          setTimeout(function() { returnToChatIfOnboarding(); }, 2000);
        } else if (s === 'expired' || s === 'invalid') {
          clearPpqTopupTimers();
          const statusEl = document.getElementById('ppq-topup-status');
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Invoice expired. Try again.</span>';
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  } catch (e) {
    area.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--red)">${escapeHTML(e.message)}</div>`;
  }
}

export function cancelPpqTopup() {
  clearPpqTopupTimers();
  const area = document.getElementById('ppq-topup-area');
  if (area) area.style.display = 'none';
}
