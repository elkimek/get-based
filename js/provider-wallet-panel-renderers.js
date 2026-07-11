// @ts-check
// provider-wallet-panel-renderers.js - Routstr/Cashu wallet action markup

import { escapeHTML, escapeAttr } from './utils.js';

export function walletSeedOnboardingHtml(mnemonic) {
  return `<div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent);margin-top:8px">
    <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">Your wallet seed phrase</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">This 12-word phrase is the <strong>only way to recover your wallet</strong>. Write it down and store it somewhere safe.</div>
    <div id="routstr-seed-phrase" style="font-family:monospace;font-size:13px;word-break:break-word;background:var(--bg-primary);padding:10px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);filter:blur(4px);cursor:pointer;user-select:all" data-routstr-wallet-action="toggle-seed-blur">${escapeHTML(mnemonic)}</div>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" style="font-size:11px" data-routstr-wallet-action="copy-clipboard" data-clipboard-text="${escapeAttr(mnemonic)}" data-copied-text="\u2713 Copied (60s)" data-clear-timer="_seedClipTimer">Copy</button>
      <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="routstr-seed-ack" data-routstr-wallet-change="seed-ack"> I have saved my seed phrase
      </label>
    </div>
    <button class="import-btn import-btn-primary" id="routstr-seed-continue" disabled style="margin-top:8px;width:100%;font-size:12px" data-routstr-wallet-action="seed-ack-continue">Continue</button>
  </div>`;
}

export function walletSeedManagementHtml(mnemonic) {
  return `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Wallet Seed Phrase</div>
    <div id="wallet-seed-display" style="font-family:monospace;font-size:13px;background:var(--bg-primary);padding:10px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);filter:blur(4px);cursor:pointer;user-select:all" data-routstr-wallet-action="toggle-seed-blur">${escapeHTML(mnemonic)}</div>
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-routstr-wallet-action="copy-clipboard" data-clipboard-text="${escapeAttr(mnemonic)}" data-copied-text="\u2713 Copied (60s)" data-clear-timer="_seedClipTimer">Copy Seed</button>
    </div>
    <div style="margin-top:10px"><div class="or-oauth-divider"><span>restore from seed</span></div>
    ${walletSeedRestoreControlsHtml('margin-top:4px')}
    </div>
  </div>`;
}

export function walletSeedMissingHtml() {
  return `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-primary);font-weight:600;margin-bottom:6px">Set up this device's Cashu wallet</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Your 24-word Data Sync mnemonic restores the Routstr node session, but does not copy spendable Cashu proofs or this separate 12-word recovery seed.</div>
    <button class="import-btn import-btn-primary" style="font-size:11px;padding:5px 10px;width:100%;margin-bottom:10px" data-routstr-wallet-action="setup-wallet-seed">Create a new 12-word seed for this device</button>
    <div class="or-oauth-divider"><span>or restore this device's wallet</span></div>
    ${walletSeedRestoreControlsHtml()}
  </div>`;
}

function walletSeedRestoreControlsHtml(extraTextareaStyle = '') {
  return `<textarea class="api-key-input" id="routstr-restore-seed" placeholder="Enter 12-word seed phrase..." rows="2" style="font-size:12px;font-family:monospace;resize:none;${extraTextareaStyle}"></textarea>
    <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" data-routstr-wallet-action="wallet-restore">Restore</button>
    <div id="routstr-restore-status"></div>`;
}

export function walletWithdrawHtml(balance) {
  return `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Withdraw</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${balance.toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="withdraw-lightning">\u26a1 Lightning</button>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="withdraw-token">Cashu Token</button>
    </div>
    <div id="routstr-withdraw-status"></div>
  </div>`;
}

export function walletWithdrawLightningHtml() {
  return `<div style="margin-top:4px">
    <input type="text" class="api-key-input" id="routstr-withdraw-input" placeholder="Lightning address (user@domain) or invoice (lnbc...)" style="font-size:11px;font-family:monospace">
    <div id="routstr-withdraw-ln-amount" style="display:none;margin-top:4px">
      <div style="display:flex;gap:4px;align-items:center">
        <input type="number" class="api-key-input" id="routstr-withdraw-amount" placeholder="sats" style="font-size:11px;flex:1" min="1">
        <button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="withdraw-max">Max</button>
      </div>
    </div>
    <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:6px;width:100%" data-routstr-wallet-action="withdraw-quote">Withdraw</button>
  </div>`;
}

export function walletWithdrawTokenHtml(balance, presets) {
  return `<div style="margin-top:4px">
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Send as Cashu token</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-token-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${balance}">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" data-routstr-wallet-action="send-token-input">Send</button>
    </div>
    ${balance > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(value => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="send-token-preset" data-amount="${value}">\u26a1 ${value.toLocaleString()}</button>`).join('')}
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="send-token-preset" data-amount="${balance}">All (${balance.toLocaleString()})</button>
    </div>` : '<div style="font-size:11px;color:var(--text-muted)">No balance to withdraw</div>'}
    <div id="routstr-token-result"></div>
  </div>`;
}
