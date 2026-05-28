// test-routstr-wallet-dom.js - Mocked Routstr wallet UI safety flows.
// Stays in the puppeteer runner: it exercises the real Settings/Routstr
// browser handlers while stubbing node, mint, and wallet APIs.
//
// Run: fetch('tests/test-routstr-wallet-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type'
    }
  });

  console.log('%c Routstr Wallet DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const nodeUrl = 'https://routstr-wallet-dom.test';
  const oldGlobals = {};
  const globalNames = [
    'fetch',
    'cashuGetBalance',
    'cashuGetMintUrl',
    'cashuSetMintUrl',
    'cashuDepositToNode',
    'cashuRecoverPendingDeposit',
    'cashuImportWallet',
    'cashuClearPendingDeposit',
    'cashuGetWalletMnemonic',
    'cashuRestoreWalletFromSeed',
    'cashuHasWalletSeed',
    'cashuGenerateWalletSeed'
  ];
  for (const name of globalNames) oldGlobals[name] = window[name];

  const storageKeys = [
    'labcharts-ai-provider',
    'labcharts-routstr-key',
    'labcharts-routstr-node',
    'labcharts-routstr-model',
    'labcharts-routstr-models',
    'labcharts-routstr-pricing',
    'labcharts-routstr-vision-models',
    'labcharts-cashu-wallet-mint'
  ];
  const oldStorage = {};
  for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);

  let currentMint = 'https://mint-old.example';
  let setMintUrl = null;
  let depositArgs = null;
  let recoverCalled = false;
  let refundCalled = false;
  let importedToken = null;
  let restoredMnemonic = null;

  try {
    window.fetch = async function(url, opts = {}) {
      const href = typeof url === 'string' ? url : url?.url || '';
      if (href.startsWith(nodeUrl)) {
        if (href.endsWith('/v1/info')) return jsonResponse({ nuts: {}, mints: ['https://mint-required.example'] });
        if (href.endsWith('/v1/models')) return jsonResponse({
          data: [{
            id: 'claude-sonnet-4.6',
            name: 'Claude Sonnet 4.6',
            enabled: true,
            pricing: { prompt: '0.000001', completion: '0.000003' }
          }]
        });
        if (href.endsWith('/v1/balance/info')) return jsonResponse({ balance: 777000, total_requests: 0, total_spent: 0 });
        if (href.endsWith('/v1/wallet/refund')) {
          refundCalled = opts.method === 'POST' && opts.headers?.Authorization === 'Bearer sk-routstr-dom';
          return jsonResponse({ cashu_token: 'cashuArefundtoken' });
        }
        return jsonResponse({}, 404);
      }
      return oldGlobals.fetch.call(window, url, opts);
    };

    window.cashuGetBalance = async () => 1500;
    window.cashuGetMintUrl = async () => currentMint;
    window.cashuSetMintUrl = async function(url) {
      setMintUrl = url;
      currentMint = url;
      localStorage.setItem('labcharts-cashu-wallet-mint', url);
    };
    window.cashuDepositToNode = async function(url, amount, existingKey) {
      depositArgs = { url, amount, existingKey };
      throw new Error('mock node rejected deposit');
    };
    window.cashuRecoverPendingDeposit = async function() {
      recoverCalled = true;
      return 'cashuArecoverytoken';
    };
    window.cashuImportWallet = async function(token) {
      importedToken = token;
      return 888;
    };
    window.cashuClearPendingDeposit = async function() {};
    window.cashuGetWalletMnemonic = async () => null;
    window.cashuRestoreWalletFromSeed = async function(mnemonic) {
      restoredMnemonic = mnemonic;
      return { balance: 4321 };
    };
    window.cashuHasWalletSeed = async () => false;
    window.cashuGenerateWalletSeed = async () => ({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident'
    });

    localStorage.setItem('labcharts-ai-provider', 'routstr');
    localStorage.setItem('labcharts-routstr-node', nodeUrl);
    localStorage.setItem('labcharts-routstr-key', 'sk-routstr-dom');
    window.updateKeyCache?.('labcharts-routstr-key', 'sk-routstr-dom');

    window.openSettingsModal('ai');
    await wait(100);
    window.switchAIProvider('routstr');
    await wait(150);
    assert('Routstr wallet area renders', !!document.getElementById('routstr-wallet-balance'));
    assert('Routstr node balance renders mocked balance',
      (document.getElementById('routstr-node-balance')?.textContent || '').includes('777'));

    console.log('%c 1. Mint switch and deposit picker ', 'font-weight:bold;color:#f59e0b');
    await window.connectRoutstrNode(nodeUrl);
    await wait(100);
    assert('Connect switches to node-required mint', setMintUrl === 'https://mint-required.example', setMintUrl || 'not called');
    assert('Connect renders deposit amount picker', !!document.getElementById('routstr-deposit-amount'));
    assert('Mint switch warning is visible',
      (document.getElementById('routstr-node-picker')?.textContent || '').includes('Mint switched'));

    console.log('%c 2. Deposit failure recovery ', 'font-weight:bold;color:#f59e0b');
    await window.doRoutstrNodeDeposit(nodeUrl, 500);
    await wait(150);
    const fundAreaText = document.getElementById('routstr-wallet-fund-area')?.textContent || '';
    assert('Deposit attempts use existing Routstr session key',
      depositArgs?.url === nodeUrl && depositArgs.amount === 500 && depositArgs.existingKey === 'sk-routstr-dom',
      JSON.stringify(depositArgs));
    assert('Deposit failure checks pending recovery token', recoverCalled);
    assert('Deposit failure shows recovery UI',
      fundAreaText.includes('Deposit failed') && fundAreaText.includes('Recover to Wallet') && fundAreaText.includes('Copy Token'),
      fundAreaText);
    assert('Recovery button carries pending Cashu token',
      document.querySelector('#routstr-wallet-fund-area [data-token="cashuArecoverytoken"]') !== null);

    console.log('%c 3. Node refund import ', 'font-weight:bold;color:#f59e0b');
    localStorage.setItem('labcharts-routstr-key', 'sk-routstr-dom');
    window.updateKeyCache?.('labcharts-routstr-key', 'sk-routstr-dom');
    await window.doRoutstrNodeWithdraw();
    await wait(150);
    assert('Node refund endpoint called with session key', refundCalled);
    assert('Refund token imports into Cashu wallet', importedToken === 'cashuArefundtoken', importedToken || 'not called');
    assert('Routstr session key clears after successful refund', !window.getRoutstrKey?.());

    console.log('%c 4. Seed restore UI ', 'font-weight:bold;color:#f59e0b');
    await window.showWalletSeedPhrase();
    await wait(50);
    assert('Seed restore textarea renders when no mnemonic exists', !!document.getElementById('routstr-restore-seed'));
    const restoreInput = document.getElementById('routstr-restore-seed');
    restoreInput.value = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    await window.doRoutstrWalletRestore();
    await wait(50);
    assert('Restore calls Cashu seed restore with normalized mnemonic',
      restoredMnemonic === restoreInput.value,
      restoredMnemonic || 'not called');
    assert('Restore success reports recovered balance',
      (document.getElementById('routstr-restore-status')?.textContent || '').includes('4,321'));

    console.log('%c 5. Seed onboarding gate ', 'font-weight:bold;color:#f59e0b');
    await window.showRoutstrWalletFund();
    await wait(50);
    const continueBtn = document.getElementById('routstr-seed-continue');
    const ack = document.getElementById('routstr-seed-ack');
    assert('New wallet seed gate renders before first funding', !!continueBtn && !!ack);
    assert('Seed continue starts disabled', !!continueBtn?.disabled);
    if (ack && continueBtn) {
      ack.checked = true;
      ack.dispatchEvent(new Event('change', { bubbles: true }));
      assert('Seed acknowledgement enables continue', !continueBtn.disabled);
      window.walletSeedAcknowledged();
      await wait(50);
      assert('Acknowledgement proceeds to funding UI', !!document.getElementById('routstr-wcashu-input'));
    }
  } finally {
    for (const name of globalNames) window[name] = oldGlobals[name];
    for (const key of storageKeys) {
      if (oldStorage[key] == null) localStorage.removeItem(key);
      else localStorage.setItem(key, oldStorage[key]);
    }
    window.updateKeyCache?.('labcharts-routstr-key', oldStorage['labcharts-routstr-key'] || '');
    document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    window.closeModal?.();
    window.closeSettingsModal?.();
  }

  console.log(`\n%c Routstr Wallet DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-routstr-wallet-dom'] = { pass, fail };
})();
