// provider-wallet-panels.js - Routstr/Cashu wallet UI and node funding actions

import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { getRoutstrKey, saveRoutstrKey, fetchRoutstrModels, getRoutstrBalance } from './api.js';
import { isValidExternalUrl } from './url-safety.js';
import { ensureQRCode } from './provider-qr.js';

const walletCallbacks = {
  renderAIProviderPanel: null,
  renderRoutstrModelDropdown: null,
  initSettingsModelFetch: null,
  returnToChatIfOnboarding: null
};

export function configureRoutstrWalletPanels(callbacks = {}) {
  Object.assign(walletCallbacks, callbacks);
}

function _renderRoutstrPanel(provider = 'routstr') {
  return typeof walletCallbacks.renderAIProviderPanel === 'function'
    ? walletCallbacks.renderAIProviderPanel(provider)
    : '';
}

function _renderRoutstrModelDropdown(models) {
  if (typeof walletCallbacks.renderRoutstrModelDropdown === 'function') {
    walletCallbacks.renderRoutstrModelDropdown(models);
  }
}

function _initSettingsModelFetch() {
  if (typeof walletCallbacks.initSettingsModelFetch === 'function') {
    walletCallbacks.initSettingsModelFetch();
  }
}

function _returnToChatIfOnboarding() {
  if (typeof walletCallbacks.returnToChatIfOnboarding === 'function') {
    walletCallbacks.returnToChatIfOnboarding();
  }
}

function _rsBalanceHtml(sats) {
  const color = sats < 100 ? 'var(--red)' : sats < 500 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">\u26a1 ' + sats.toLocaleString() + ' sats</span>';
}

export function refreshCashuWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (el) el.textContent = '\u26a1 verifying...';
  if (window.cashuCheckProofStates) {
    window.cashuCheckProofStates().then(function(bal) {
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    }).catch(function() {
      if (el) el.textContent = '\u26a1 check failed';
    });
  }
}

export function refreshRoutstrBalance() {
  const el = document.getElementById('routstr-node-balance') || document.getElementById('routstr-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getRoutstrBalance().then(function(b) {
    if (el && b) el.innerHTML = _rsBalanceHtml(b.sats);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}

let _rsFundPollTimer = null;

export function clearRoutstrWalletTimers() {
  if (_rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
}

export function showRoutstrWalletFund() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'deposit') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('deposit');
  _ensureWalletSeed(() => _renderWalletFundUI());
}

function _renderWalletFundUI() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  area.style.display = 'block';
  const presets = [1000, 5000, 10000, 25000];
  const feePct = typeof window.cashuGetFeePct === 'function' ? window.cashuGetFeePct() : 0;
  const feeNote = feePct > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">${Math.round(feePct * 100)}% development fee applies</div>` : '';
  const cashuFeeLabel = feePct > 0 ? `or paste Cashu token (${Math.round(feePct * 100)}% fee)` : 'or paste Cashu token';
  area.innerHTML = `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Deposit with Lightning</div>
    ${feeNote}
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(s => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="doRoutstrWalletFund(${s})">\u26a1 ${s.toLocaleString()}</button>`).join('')}<div id="routstr-wfund-custom-slot" style="display:flex"><button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--text-muted)" onclick="rsWalletFundCustomInput()">\u26a1\u2026</button></div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">1,000 sats is enough for a few chats</div>
    <div style="margin-top:6px"><div class="or-oauth-divider"><span>${cashuFeeLabel}</span></div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <input type="text" class="api-key-input" id="routstr-wcashu-input" placeholder="cashuA... / cashuB... / cashu:..." style="font-size:11px;flex:1;font-family:monospace">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrWalletReceiveCashu()">Deposit</button>
    </div></div>
    <div id="routstr-wfund-status"></div>
  </div>`;
}

export function rsWalletFundCustomInput() {
  const slot = document.getElementById('routstr-wfund-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="numeric" id="routstr-wfund-custom" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;width:80px;text-align:center;cursor:text;border:1px solid var(--accent)" placeholder="sats" onkeydown="if(event.key===\'Enter\')doRoutstrWalletFundCustom();if(event.key===\'Escape\')showRoutstrWalletFund()" onblur="if(this.value.trim())doRoutstrWalletFundCustom()">';
  document.getElementById('routstr-wfund-custom')?.focus();
}

export function doRoutstrWalletFundCustom() {
  const input = document.getElementById('routstr-wfund-custom');
  if (!input) return;
  const amount = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 100) {
    const s = document.getElementById('routstr-wfund-status');
    if (s) s.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Minimum 100 sats</div>';
    return;
  }
  doRoutstrWalletFund(amount);
}

export async function doRoutstrWalletFund(amountSats) {
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Creating invoice\u2026</div>';
  try {
    const result = await window.cashuCreateFundingInvoice(amountSats);
    let qrSvg = '';
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'L');
      qr.addData(result.invoice.toUpperCase());
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    } else {
      try {
        const makeQr = await ensureQRCode();
        const qr = makeQr(0, 'L');
        qr.addData(result.invoice.toUpperCase());
        qr.make();
        qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
      } catch {}
    }
    const payUri = 'lightning:' + result.invoice;
    statusEl.innerHTML = `<div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">\u26a1 ${amountSats.toLocaleString()} sats</div>
      ${qrSvg ? `<a href="${payUri}" style="display:inline-block;background:#fff;padding:10px;border-radius:8px;width:220px;height:220px">${qrSvg}</a>` : ''}
      <div style="margin-top:6px"><button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px" onclick="navigator.clipboard.writeText('${escapeAttr(result.invoice)}');this.textContent='\u2713 Copied'">${result.invoice.slice(0, 20)}\u2026 copy</button></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="routstr-wfund-poll">Waiting for payment\u2026</div>
    </div>`;
    _rsFundPollTimer = setInterval(async function() {
      try {
        const s = await window.cashuCheckFundingStatus(result.quote);
        if (s && s.paid) {
          clearInterval(_rsFundPollTimer); _rsFundPollTimer = null;
          const feeText = s.fee ? ' (' + s.fee + ' fee)' : '';
          const credited = s.fee ? (amountSats - s.fee) : amountSats;
          statusEl.innerHTML = '<div style="margin-top:8px;text-align:center;font-size:12px;color:var(--green)">\u2713 +' + credited.toLocaleString() + ' sats added to wallet!' + feeText + '</div>';
          showNotification('Wallet funded \u26a1 ' + credited.toLocaleString() + ' sats', 'success');
          _refreshRoutstrWalletBalance();
          setTimeout(function() { const a = document.getElementById('routstr-wallet-fund-area'); if (a) a.style.display = 'none'; }, 3000);
        }
      } catch {}
    }, 3000);
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWalletReceiveCashu() {
  const input = document.getElementById('routstr-wcashu-input');
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!input || !statusEl) return;
  let token = input.value.trim();
  if (token.startsWith('cashu:')) token = token.slice(6);
  if (!token || !token.startsWith('cashuA') && !token.startsWith('cashuB')) { statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Paste a valid Cashu token (starts with cashuA or cashuB)</div>'; return; }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Depositing to wallet\u2026</div>';
  try {
    const result = await window.cashuReceiveToken(token);
    input.value = '';
    const fundArea = document.getElementById('routstr-wallet-fund-area');
    if (fundArea) { fundArea.style.display = 'none'; _setActiveWalletAction(null); }
    showNotification('Wallet funded \u26a1 +' + result.received + ' sats' + (result.fee > 0 ? ' (' + result.fee + ' fee)' : ''), 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function showRoutstrMintEdit() {
  const area = document.getElementById('routstr-mint-edit');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  const currentMint = await window.cashuGetMintUrl();
  const nodeUrl = window.nostrGetSelectedNode?.() || '';
  let nodeMints = [];
  if (nodeUrl) {
    try {
      const res = await fetch(nodeUrl.replace(/\/+$/, '') + '/v1/info');
      if (res.ok) { const info = await res.json(); nodeMints = info.mints || []; }
    } catch {}
  }
  const nodeMintsHtml = nodeMints.length
    ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">Node accepts: ${nodeMints.map(m => {
        const label = escapeHTML(m.replace(/^https?:\/\//, ''));
        const isCurrent = m === currentMint;
        return isCurrent ? '<strong style="color:var(--green)">' + label + '</strong>'
          : '<a href="#" onclick="document.getElementById(\'routstr-mint-input\').value=\'' + escapeAttr(m) + '\';return false" style="color:var(--accent);text-decoration:none">' + label + '</a>';
      }).join(', ')}</div>`
    : '';
  area.style.display = 'block';
  area.innerHTML = `<div style="margin-top:6px">
    <input type="text" class="api-key-input" id="routstr-mint-input" value="${escapeAttr(currentMint)}" placeholder="https://mint.example.com" style="font-size:11px;font-family:monospace">
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="doRoutstrMintChange()">Save</button>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="document.getElementById('routstr-mint-edit').style.display='none'">Cancel</button>
    </div>
    ${nodeMintsHtml}
    <div style="font-size:10px;color:var(--text-muted);margin-top:4px">\u26a0 Changing mint resets wallet connection. Existing proofs stay tied to their mint.</div>
    <div id="routstr-mint-status"></div>
  </div>`;
}

export async function doRoutstrMintChange() {
  const input = document.getElementById('routstr-mint-input');
  const statusEl = document.getElementById('routstr-mint-status');
  if (!input || !statusEl) return;
  const url = input.value.trim().replace(/\/+$/, '');
  // Mint URL must be public HTTPS - block loopback / RFC1918 / link-local so
  // a malicious paste can't make the browser probe internal services.
  if (!url || !isValidExternalUrl(url)) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a valid public mint URL (https://...)</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Checking mint\u2026</div>';
  try {
    const res = await fetch(url + '/v1/info');
    if (!res.ok) throw new Error('Mint not reachable');
    const info = await res.json();
    if (!info.nuts) throw new Error('Not a valid Cashu mint');
    await window.cashuSetMintUrl(url);
    const label = document.getElementById('routstr-mint-label');
    if (label) label.textContent = url.replace(/^https?:\/\//, '');
    document.getElementById('routstr-mint-edit').style.display = 'none';
    _refreshRoutstrWalletBalance();
    showNotification('Mint changed to ' + url.replace(/^https?:\/\//, ''), 'success');
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function showRoutstrWalletBackup() {
  _setActiveWalletAction('backup');
  try {
    const token = await window.cashuExportWallet();
    if (!token) { showNotification('Wallet is empty', 'info'); _setActiveWalletAction(null); return; }
    navigator.clipboard.writeText(token);
    showNotification('Wallet backup copied to clipboard (clears in 60s)', 'success');
    clearTimeout(window._rsCashuBackupTimer);
    window._rsCashuBackupTimer = setTimeout(() => navigator.clipboard.writeText(''), 60000);
  } catch (e) {
    showNotification('Backup failed: ' + e.message, 'error');
  }
  setTimeout(() => _setActiveWalletAction(null), 500);
}

export async function showRoutstrNodePicker() {
  const area = document.getElementById('routstr-node-picker');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  area.style.display = 'block';
  area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Searching Nostr relays\u2026</div>';
  try {
    const allNodes = await window.nostrDiscoverNodes(true);
    const nodes = allNodes.filter(n => n.online);
    if (!nodes.length) {
      area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">No online nodes found (' + allNodes.length + ' discovered). Try again later.</div>';
      return;
    }
    area.innerHTML = '<div style="margin-top:8px">' + nodes.map(function(n) {
      const url = n.urls[0] || '';
      const domain = escapeHTML(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      const label = escapeHTML(n.name || domain);
      const models = n.modelCount + ' model' + (n.modelCount !== 1 ? 's' : '');
      const onion = n.onion ? ' <span style="font-size:10px" title="Tor available">\ud83e\udde5</span>' : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <div><span style="font-size:12px;font-weight:500">${label}</span>${onion}<br><span style="font-size:10px;color:var(--text-muted)">${domain} \u00b7 ${models}</span></div>
        <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px" onclick="connectRoutstrNode('${escapeAttr(url)}')">Connect</button>
      </div>`;
    }).join('') + '</div>';
  } catch (e) {
    area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function connectRoutstrNode(nodeUrl) {
  const picker = document.getElementById('routstr-node-picker');
  if (picker) picker.style.display = 'block';
  const nodeLabel = escapeHTML(nodeUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:11px;color:var(--text-muted)">Checking ${nodeLabel}\u2026</div>
  </div>`;

  let nodeMints = [];
  try {
    const infoRes = await fetch(nodeUrl.replace(/\/+$/, '') + '/v1/info');
    if (infoRes.ok) {
      const info = await infoRes.json();
      nodeMints = info.mints || [];
    }
  } catch {}

  const currentMint = await window.cashuGetMintUrl();
  let mintSwitched = false;
  if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) {
    try {
      await window.cashuSetMintUrl(nodeMints[0]);
      mintSwitched = true;
      const mintLabel = document.getElementById('routstr-mint-label');
      if (mintLabel) mintLabel.textContent = nodeMints[0].replace(/^https?:\/\//, '');
      showNotification('Mint switched to ' + nodeMints[0].replace(/^https?:\/\//, '') + ' (required by node)', 'info');
    } catch (e) {
      showNotification('Node requires an unsafe mint URL \u2014 refused. Try a different node.', 'error');
      if (picker) picker.style.display = 'none';
      return;
    }
  }

  const walletBalance = await window.cashuGetBalance();
  if (walletBalance < 1) {
    showNotification('Fund your wallet first' + (mintSwitched ? ' \u2014 mint was updated' : ''), 'error');
    showRoutstrWalletFund();
    return;
  }

  const mintNote = mintSwitched ? `<div style="font-size:10px;color:var(--accent);margin-bottom:4px">\u26a0 Mint switched to ${escapeHTML(nodeMints[0].replace(/^https?:\/\//, ''))}</div>` : '';
  const presets = [500, 1000, 2500, 5000].filter(v => v <= walletBalance);
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:12px;margin-bottom:6px">Deposit to <strong>${nodeLabel}</strong></div>
    ${mintNote}
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${walletBalance.toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-deposit-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${walletBalance}">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',parseInt(document.getElementById('routstr-deposit-amount')?.value))">Deposit</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(v => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-deposit-amount').value=${v};doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',${v})">\u26a1 ${v.toLocaleString()}</button>`).join('')}
      ${walletBalance > 0 ? `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-deposit-amount').value=${walletBalance};doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',${walletBalance})">All (${walletBalance.toLocaleString()})</button>` : ''}
    </div>
    <div id="routstr-deposit-status" style="margin-top:6px"></div>
  </div>`;
}

let _rsConnecting = false;

export async function doRoutstrNodeDeposit(nodeUrl, amount) {
  if (_rsConnecting) return;
  _rsConnecting = true;
  const statusEl = document.getElementById('routstr-deposit-status');
  if (!amount || amount < 1 || isNaN(amount)) {
    _rsConnecting = false;
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">Enter a valid amount</div>';
    return;
  }
  if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Depositing ' + amount.toLocaleString() + ' sats\u2026</div>';
  try {
    const infoRes = await fetch(nodeUrl.replace(/\/+$/, '') + '/v1/info');
    if (infoRes.ok) {
      const info = await infoRes.json();
      const nodeMints = info.mints || [];
      const currentMint = await window.cashuGetMintUrl();
      if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) {
        _rsConnecting = false;
        if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">Node doesn\u2019t accept mint ' + escapeHTML(currentMint.replace(/^https?:\/\//, '')) + '. Accepted: ' + escapeHTML(nodeMints.map(m => m.replace(/^https?:\/\//, '')).join(', ')) + '</div>';
        return;
      }
    }
  } catch {}
  try {
    const existingKey = getRoutstrKey();
    const result = await window.cashuDepositToNode(nodeUrl, amount, existingKey);
    if (result.api_key) await saveRoutstrKey(result.api_key);
    window.nostrSetSelectedNode(nodeUrl);
    if (result.api_key) {
      localStorage.removeItem('labcharts-routstr-model');
      localStorage.removeItem('labcharts-routstr-models');
    }
    const models = await fetchRoutstrModels();
    showNotification('Connected to ' + nodeUrl.replace(/^https?:\/\//, '') + ' \u26a1 ' + amount.toLocaleString() + ' sats', 'success');
    const panel = document.getElementById('ai-provider-panel');
    const panelHtml = _renderRoutstrPanel('routstr');
    if (panel && panelHtml) panel.innerHTML = panelHtml;
    if (models.length) _renderRoutstrModelDropdown(models);
    _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
    _returnToChatIfOnboarding();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
    _refreshRoutstrWalletBalance();
    if (window.cashuRecoverPendingDeposit) window.cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area) return;
      area.style.display = 'block';
      area.innerHTML = '<div style="padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px;margin-top:8px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Deposit failed \u2014 your sats are safe</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">The node rejected the deposit. Recover the token back to your wallet:</div>' +
        '<div style="display:flex;gap:4px">' +
        '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" data-token="' + escapeAttr(token) + '" onclick="cashuImportWallet(this.dataset.token).then(()=>{cashuClearPendingDeposit();showNotification(\'Recovered!\',\'success\');location.reload()}).catch(e=>showNotification(e.message,\'error\'))">Recover to Wallet</button>' +
        '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-token="' + escapeAttr(token) + '" onclick="navigator.clipboard.writeText(this.dataset.token);this.textContent=\'\u2713 Copied\'">Copy Token</button>' +
        '</div></div>';
    });
  }
  _rsConnecting = false;
}

export async function doRoutstrNodeWithdraw() {
  const nodeUrl = (window.nostrGetSelectedNode?.() || '').replace(/\/+$/, '');
  const key = getRoutstrKey();
  if (!nodeUrl || !key) { showNotification('No active node session', 'error'); return; }
  const picker = document.getElementById('routstr-node-picker');
  if (picker) {
    picker.style.display = 'block';
    picker.innerHTML = '<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)"><div style="font-size:11px;color:var(--text-muted)">Withdrawing from node\u2026</div></div>';
  }
  try {
    const res = await fetch(nodeUrl + '/v1/wallet/refund', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail?.error?.message || err?.detail || 'Refund failed: ' + res.status);
    }
    const data = await res.json();
    const token = data.token || data.cashu_token || (typeof data === 'string' && data.startsWith('cashu') ? data : null);
    if (!token) throw new Error('No token returned from node');
    const imported = await window.cashuImportWallet(token);
    await saveRoutstrKey('');
    showNotification('Withdrawn \u26a1 ' + imported.toLocaleString() + ' sats to wallet', 'success');
    const panel = document.getElementById('ai-provider-panel');
    const panelHtml = _renderRoutstrPanel('routstr');
    if (panel && panelHtml) panel.innerHTML = panelHtml;
    _initSettingsModelFetch();
    _refreshRoutstrWalletBalance();
  } catch (e) {
    if (picker) picker.innerHTML = '<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border)"><div style="font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div></div>';
  }
}

async function _refreshRoutstrWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (!el) return;
  try {
    const balance = await window.cashuGetBalance();
    el.textContent = '\u26a1 ' + balance.toLocaleString() + ' sats';
  } catch {
    el.textContent = '\u26a1 0 sats';
  }
  if (window.cashuGetMintUrl) window.cashuGetMintUrl().then(function(url) {
    const mintEl = document.getElementById('routstr-mint-label');
    if (mintEl) mintEl.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  });
}

let _activeNodeAction = null;

export function buildRoutstrNodeActions(nodeUrl, hasKey, active) {
  const _pill = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const _activePill = 'font-size:11px;padding:3px 10px';
  const btns = [];
  if (nodeUrl) btns.push({ id: 'deposit', label: 'Deposit', fn: "connectRoutstrNode('" + nodeUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')" });
  if (hasKey && nodeUrl) btns.push({ id: 'withdraw', label: 'Withdraw', fn: 'doRoutstrNodeWithdraw()' });
  btns.push({ id: 'browse', label: 'Browse', fn: 'showRoutstrNodePicker()' });
  return btns.map(b => {
    const isActive = b.id === active;
    return `<button class="import-btn ${isActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${isActive ? _activePill : _pill}" onclick="_setActiveNodeAction('${b.id}');${b.fn}">${b.label}</button>`;
  }).join('');
}

export function _setActiveNodeAction(actionId) {
  _activeNodeAction = actionId;
  const el = document.getElementById('routstr-node-actions');
  const nodeUrl = window.nostrGetSelectedNode?.() || '';
  const hasKey = !!getRoutstrKey();
  if (el) el.innerHTML = buildRoutstrNodeActions(nodeUrl, hasKey, actionId);
}

let _activeWalletAction = null;

export function routstrWalletActionButtons(active) {
  const _pill = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const _active = 'font-size:11px;padding:3px 10px';
  const mainBtns = [
    { id: 'deposit', label: 'Deposit', fn: 'showRoutstrWalletFund' },
    { id: 'withdraw', label: 'Withdraw', fn: 'showRoutstrWithdraw' },
  ];
  const menuItems = [
    { id: 'seed', label: '\ud83c\udf31 Seed & Restore', fn: 'showWalletSeedPhrase' },
    { id: 'backup', label: '\ud83d\udce4 Export Token', fn: 'showRoutstrWalletBackup' },
  ];
  const main = mainBtns.map(b => {
    const isActive = b.id === active;
    return `<button class="import-btn ${isActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${isActive ? _active : _pill}" onclick="${b.fn}()">${b.label}</button>`;
  }).join('');
  const menuActive = menuItems.some(b => b.id === active);
  const menu = `<div style="position:relative;display:inline-block">
    <button class="import-btn ${menuActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${menuActive ? _active : _pill}" onclick="var m=document.getElementById('routstr-wallet-menu');var show=m.style.display!=='block';m.style.display=show?'block':'none';if(show){var h=function(e){if(!m.contains(e.target)&&e.target!==this){m.style.display='none';document.removeEventListener('click',h,true)}}.bind(this);setTimeout(function(){document.addEventListener('click',h,true)},0)}">\u22ef</button>
    <div id="routstr-wallet-menu" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:4px;z-index:10;min-width:120px;box-shadow:var(--shadow-lg)">
      ${menuItems.map(b => `<button class="import-btn ${b.id === active ? 'import-btn-primary' : 'import-btn-secondary'}" style="font-size:11px;padding:4px 10px;width:100%;text-align:left;margin-bottom:2px;${b.id === active ? '' : 'background:transparent;border-color:transparent;color:var(--text-primary)'}" onclick="document.getElementById('routstr-wallet-menu').style.display='none';${b.fn}()">${b.label}</button>`).join('')}
    </div>
  </div>`;
  return main + menu;
}

function _setActiveWalletAction(actionId) {
  _activeWalletAction = actionId;
  if (actionId !== 'deposit' && _rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
  const el = document.getElementById('routstr-wallet-actions');
  if (el) el.innerHTML = routstrWalletActionButtons(actionId);
}

async function _ensureWalletSeed(thenAction) {
  const hasSeed = await window.cashuHasWalletSeed?.();
  if (hasSeed) { thenAction(); return; }
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  area.style.display = 'block';
  const { mnemonic } = await window.cashuGenerateWalletSeed();
  area.innerHTML = `<div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent);margin-top:8px">
    <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">Your wallet seed phrase</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">This 12-word phrase is the <strong>only way to recover your wallet</strong>. Write it down and store it somewhere safe.</div>
    <div id="routstr-seed-phrase" style="font-family:monospace;font-size:13px;word-break:break-word;background:var(--bg-primary);padding:10px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);filter:blur(4px);cursor:pointer;user-select:all" onclick="this.style.filter=this.style.filter?'':'blur(4px)'">${escapeHTML(mnemonic)}</div>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" style="font-size:11px" onclick="navigator.clipboard.writeText('${escapeAttr(mnemonic)}');this.textContent='\u2713 Copied (60s)';clearTimeout(window._seedClipTimer);window._seedClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy</button>
      <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="routstr-seed-ack" onchange="document.getElementById('routstr-seed-continue').disabled=!this.checked"> I have saved my seed phrase
      </label>
    </div>
    <button class="import-btn import-btn-primary" id="routstr-seed-continue" disabled style="margin-top:8px;width:100%;font-size:12px" onclick="walletSeedAcknowledged()">Continue</button>
  </div>`;
  window._walletSeedThenAction = thenAction;
}

export function walletSeedAcknowledged() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (area) area.style.display = 'none';
  if (window._walletSeedThenAction) {
    window._walletSeedThenAction();
    window._walletSeedThenAction = null;
  }
}

export async function showWalletSeedPhrase() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'seed') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('seed');
  area.style.display = 'block';
  const mnemonic = await window.cashuGetWalletMnemonic?.();
  if (mnemonic) {
    area.innerHTML = `<div style="margin-top:8px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Wallet Seed Phrase</div>
      <div id="wallet-seed-display" style="font-family:monospace;font-size:13px;background:var(--bg-primary);padding:10px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);filter:blur(4px);cursor:pointer;user-select:all" onclick="this.style.filter=this.style.filter?'':'blur(4px)'">${escapeHTML(mnemonic)}</div>
      <div style="display:flex;gap:4px;margin-top:6px">
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="navigator.clipboard.writeText('${escapeAttr(mnemonic)}');this.textContent='\u2713 Copied (60s)';clearTimeout(window._seedClipTimer);window._seedClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Seed</button>
      </div>
      <div style="margin-top:10px"><div class="or-oauth-divider"><span>restore from seed</span></div>
      <textarea class="api-key-input" id="routstr-restore-seed" placeholder="Enter 12-word seed phrase..." rows="2" style="font-size:12px;font-family:monospace;resize:none;margin-top:4px"></textarea>
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" onclick="doRoutstrWalletRestore()">Restore</button>
      <div id="routstr-restore-status"></div>
      </div>
    </div>`;
  } else {
    area.innerHTML = `<div style="margin-top:8px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Restore Wallet from Seed</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">No seed yet \u2014 a seed is generated when you first deposit.</div>
      <textarea class="api-key-input" id="routstr-restore-seed" placeholder="Enter 12-word seed phrase..." rows="2" style="font-size:12px;font-family:monospace;resize:none"></textarea>
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" onclick="doRoutstrWalletRestore()">Restore</button>
      <div id="routstr-restore-status"></div>
    </div>`;
  }
}

export async function showRoutstrWithdraw() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'withdraw') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('withdraw');
  area.style.display = 'block';
  const balance = await window.cashuGetBalance();
  area.innerHTML = `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Withdraw</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${balance.toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="showRoutstrWithdrawLightning()">\u26a1 Lightning</button>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="showRoutstrWithdrawToken()">Cashu Token</button>
    </div>
    <div id="routstr-withdraw-status"></div>
  </div>`;
}

export function showRoutstrWithdrawLightning() {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  statusEl.innerHTML = `<div style="margin-top:4px">
    <input type="text" class="api-key-input" id="routstr-withdraw-input" placeholder="Lightning address (user@domain) or invoice (lnbc...)" style="font-size:11px;font-family:monospace">
    <div id="routstr-withdraw-ln-amount" style="display:none;margin-top:4px">
      <div style="display:flex;gap:4px;align-items:center">
        <input type="number" class="api-key-input" id="routstr-withdraw-amount" placeholder="sats" style="font-size:11px;flex:1" min="1">
        <button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="cashuGetMaxWithdrawable().then(m=>{document.getElementById('routstr-withdraw-amount').value=m})">Max</button>
      </div>
    </div>
    <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:6px;width:100%" onclick="doRoutstrWithdrawQuote()">Withdraw</button>
  </div>`;
  const input = document.getElementById('routstr-withdraw-input');
  input?.addEventListener('input', () => {
    const val = input.value.trim();
    const needsAmount = val.includes('@') && !val.match(/^ln(bc|tb|bcrt)/);
    document.getElementById('routstr-withdraw-ln-amount').style.display = needsAmount ? 'block' : 'none';
  });
}

export async function showRoutstrWithdrawToken() {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  const balance = await window.cashuGetBalance();
  const presets = [100, 500, 1000, 2500].filter(v => v <= balance);
  statusEl.innerHTML = `<div style="margin-top:4px">
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Send as Cashu token</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-token-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${balance}">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrSendToken(parseInt(document.getElementById('routstr-token-amount')?.value))">Send</button>
    </div>
    ${balance > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(v => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-token-amount').value=${v};doRoutstrSendToken(${v})">\u26a1 ${v.toLocaleString()}</button>`).join('')}
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-token-amount').value=${balance};doRoutstrSendToken(${balance})">All (${balance.toLocaleString()})</button>
    </div>` : '<div style="font-size:11px;color:var(--text-muted)">No balance to withdraw</div>'}
    <div id="routstr-token-result"></div>
  </div>`;
}

export async function doRoutstrSendToken(amount) {
  const resultEl = document.getElementById('routstr-token-result');
  if (!resultEl) return;
  if (!amount || amount < 1 || isNaN(amount)) {
    resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a valid amount</div>';
    return;
  }
  resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Creating token\u2026</div>';
  try {
    const result = await window.cashuSendAsToken(amount);
    resultEl.innerHTML = `<div style="margin-top:6px">
      <div style="font-size:11px;color:var(--green);margin-bottom:4px">\u2713 Token created \u2014 \u26a1 ${result.amount.toLocaleString()} sats</div>
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Copy and share. Sats are deducted from your wallet now.</div>
      <textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:60px;resize:none;user-select:all" readonly onclick="this.select()">${escapeHTML(result.token)}</textarea>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" onclick="navigator.clipboard.writeText('${escapeAttr(result.token)}');this.textContent='\u2713 Copied (60s)';clearTimeout(window._tokenClipTimer);window._tokenClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Token</button>
    </div>`;
    showNotification('\u26a1 ' + result.amount.toLocaleString() + ' sats token ready', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWithdrawQuote() {
  const input = document.getElementById('routstr-withdraw-input');
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!input || !statusEl) return;
  const val = input.value.trim();
  if (!val) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a Lightning invoice or address</div>';
    return;
  }
  const isAddress = val.includes('@') && !val.match(/^ln(bc|tb|bcrt)/);
  if (isAddress) {
    const amountInput = document.getElementById('routstr-withdraw-amount');
    const amount = parseInt(amountInput?.value) || 0;
    if (!amount || amount < 1) {
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter an amount in sats</div>';
      return;
    }
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Withdrawing to ' + escapeHTML(val) + '\u2026</div>';
    try {
      await window.cashuWithdrawToAddress(val, amount);
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Sent ' + amount.toLocaleString() + ' sats to ' + escapeHTML(val) + '</div>';
      showNotification('Withdrawal complete', 'success');
      _refreshRoutstrWalletBalance();
    } catch (e) {
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
    }
    return;
  }
  if (!val.match(/^ln(bc|tb|bcrt)/)) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a Lightning invoice (lnbc\u2026) or address (user@domain)</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Checking fee\u2026</div>';
  try {
    const quote = await window.cashuCreateWithdrawQuote(val);
    statusEl.innerHTML = `<div style="margin-top:6px;padding:8px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text-muted)">Amount: <strong>${quote.amount.toLocaleString()} sats</strong></div>
      <div style="font-size:11px;color:var(--text-muted)">Fee reserve: <strong>${quote.fee_reserve.toLocaleString()} sats</strong></div>
      <div style="font-size:11px;color:var(--text-muted)">Total: <strong>${(quote.amount + quote.fee_reserve).toLocaleString()} sats</strong></div>
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:6px;width:100%" onclick="doRoutstrWithdrawExecute('${escapeAttr(quote.quote)}')">Confirm Withdraw</button>
    </div>`;
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWithdrawExecute(quoteId) {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Withdrawing\u2026</div>';
  try {
    await window.cashuExecuteWithdraw(quoteId);
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Withdrawn! Lightning payment sent.</div>';
    showNotification('Withdrawal complete', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWalletRestore() {
  const input = document.getElementById('routstr-restore-seed');
  const statusEl = document.getElementById('routstr-restore-status');
  if (!input || !statusEl) return;
  const mnemonic = input.value.trim().toLowerCase();
  const words = mnemonic.split(/\s+/);
  if (words.length !== 12) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter exactly 12 words</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Restoring from mint\u2026 (this may take a moment)</div>';
  try {
    const result = await window.cashuRestoreWalletFromSeed(mnemonic);
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Restored! Balance: \u26a1 ' + result.balance.toLocaleString() + ' sats</div>';
    showNotification('Wallet restored', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}
