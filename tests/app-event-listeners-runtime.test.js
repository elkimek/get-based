// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({
  buildSidebar: vi.fn(),
  endTour: vi.fn(),
  refreshCallback: null,
  registerRefreshCallback: vi.fn(callback => {
    shell.refreshCallback = callback;
  }),
  state: { currentView: 'reports' },
}));

vi.mock('../js/state.js', () => ({ state: shell.state }));
vi.mock('../js/data.js', () => ({ registerRefreshCallback: shell.registerRefreshCallback }));
vi.mock('../js/nav.js', () => ({ buildSidebar: shell.buildSidebar }));
vi.mock('../js/tour.js', () => ({ endTour: shell.endTour }));

const appEvents = await import('../js/app-event-listeners.js');

function appendOverlay(id, body = '<div class="modal" role="dialog"></div>') {
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = body;
  document.body.appendChild(overlay);
  return overlay;
}

function press(key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
  return event;
}

describe('app event listener runtime', () => {
  const actions = {
    closeChangelog: vi.fn(),
    closeChatPanel: vi.fn(),
    closeClientList: vi.fn(),
    closeEMFInterpretation: vi.fn(),
    closeFeedbackModal: vi.fn(),
    closeImportModal: vi.fn(),
    closeLightEnvironmentAssessment: vi.fn(),
    closeMobileSidebar: vi.fn(),
    closeModal: vi.fn(),
    closeReportBuilder: vi.fn(),
    closeRestoreMnemonicDialog: vi.fn(),
    closeSettingsModal: vi.fn(),
    closeSummaryModal: vi.fn(),
    closeSyncSetup: vi.fn(),
    closeTweaksPanel: vi.fn(),
    navigate: vi.fn(),
    toggleChatPanel: vi.fn(),
    updateChatNudge: vi.fn(),
  };

  beforeAll(() => {
    document.body.innerHTML = '';
    appEvents.configureAppEventListeners(actions);
    appEvents.installGlobalEventListeners();
  });

  it('lets a scrollable legal consent modal consume wheel input', () => {
    const overlay = appendOverlay(
      'cloud-ai-consent-overlay',
      '<div class="legal-consent-modal"><label><input type="checkbox">Approve</label></div>',
    );
    const modal = overlay.querySelector('.legal-consent-modal');
    Object.defineProperties(modal, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 700 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });

    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    modal.querySelector('input').dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);

    modal.scrollTop = 300;
    const edgeWheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    modal.querySelector('input').dispatchEvent(edgeWheel);
    expect(edgeWheel.defaultPrevented).toBe(true);
    overlay.remove();
  });

  it('routes backdrops, keyboard actions, modal safety, and refresh through the composed shell', async () => {
    const scrollable = document.createElement('div');
    scrollable.className = 'modal';
    Object.defineProperties(scrollable, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    });
    const wheelOverlay = appendOverlay('wheel-overlay', '');
    wheelOverlay.appendChild(scrollable);
    const middleWheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    scrollable.dispatchEvent(middleWheel);
    expect(middleWheel.defaultPrevented).toBe(false);
    scrollable.scrollTop = 200;
    const edgeWheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    scrollable.dispatchEvent(edgeWheel);
    expect(edgeWheel.defaultPrevented).toBe(true);
    wheelOverlay.remove();

    const nestedWheelOverlay = appendOverlay('nested-wheel-overlay');
    const nestedModal = nestedWheelOverlay.querySelector('.modal');
    Object.defineProperties(nestedModal, {
      clientHeight: { configurable: true, value: 150 },
      scrollHeight: { configurable: true, value: 450 },
      scrollTop: { configurable: true, writable: true, value: 50 },
    });
    const modelList = document.createElement('div');
    modelList.className = 'nutrition-comparison-models';
    Object.defineProperties(modelList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    });
    nestedModal.appendChild(modelList);
    const nestedMiddleWheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    modelList.dispatchEvent(nestedMiddleWheel);
    expect(nestedMiddleWheel.defaultPrevented).toBe(false);
    modelList.scrollTop = 200;
    const nestedEdgeWheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    modelList.dispatchEvent(nestedEdgeWheel);
    expect(nestedEdgeWheel.defaultPrevented).toBe(false);
    nestedModal.scrollTop = 300;
    const allEdgesWheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    modelList.dispatchEvent(allEdgesWheel);
    expect(allEdgesWheel.defaultPrevented).toBe(true);
    nestedModal.scrollTop = 50;
    const staticModelList = document.createElement('div');
    staticModelList.className = 'nutrition-comparison-models';
    Object.defineProperties(staticModelList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    nestedModal.appendChild(staticModelList);
    const staticListWheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    staticModelList.dispatchEvent(staticListWheel);
    expect(staticListWheel.defaultPrevented).toBe(false);
    nestedWheelOverlay.remove();

    const modalOverlay = appendOverlay('modal-overlay');
    const modal = modalOverlay.querySelector('.modal');
    modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    modalOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(actions.closeModal).not.toHaveBeenCalled();
    modalOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(actions.closeModal).toHaveBeenCalledOnce();
    modalOverlay.remove();

    const protectedModalOverlay = appendOverlay('modal-overlay');
    protectedModalOverlay.setAttribute('data-modal-dismiss-protected', '');
    protectedModalOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(actions.closeModal).toHaveBeenCalledOnce();
    expect(protectedModalOverlay.firstElementChild.classList.contains('modal-nudge')).toBe(true);
    press('Escape');
    expect(actions.closeModal).toHaveBeenCalledTimes(2);
    protectedModalOverlay.remove();

    const backdropRoutes = [
      ['light-env-assessment-overlay', 'closeLightEnvironmentAssessment'],
      ['changelog-modal-overlay', 'closeChangelog'],
      ['report-builder-overlay', 'closeReportBuilder'],
      ['settings-modal-overlay', 'closeSettingsModal'],
    ];
    for (const [id, action] of backdropRoutes) {
      const overlay = appendOverlay(id);
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(actions[action]).toHaveBeenCalled();
      overlay.remove();
    }

    for (const id of ['import-modal-overlay', 'feedback-modal-overlay']) {
      const overlay = appendOverlay(id);
      const child = overlay.firstElementChild;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(child.classList.contains('modal-nudge')).toBe(true);
      child.dispatchEvent(new Event('animationend'));
      expect(child.classList.contains('modal-nudge')).toBe(false);
      overlay.remove();
    }

    const clientOverlay = appendOverlay('client-list-overlay', '<div class="modal cl-form"></div>');
    clientOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clientOverlay.firstElementChild.classList.contains('modal-nudge')).toBe(true);
    clientOverlay.querySelector('.cl-form').remove();
    clientOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(actions.closeClientList).toHaveBeenCalled();
    clientOverlay.remove();

    const featureOverlay = appendOverlay(
      'new-feature-overlay',
      '<div class="modal"><button class="modal-close">Close feature</button></div>',
    );
    const featureClose = vi.fn(() => featureOverlay.classList.remove('show'));
    featureOverlay.querySelector('.modal-close').addEventListener('click', featureClose);
    featureOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(featureClose).toHaveBeenCalledOnce();
    featureOverlay.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="corr-options" class="show"><span id="inside-correlation"></span></div>
      <input id="corr-search">
      <button id="outside-correlation"></button>
    `);
    document.getElementById('inside-correlation').click();
    expect(document.getElementById('corr-options').classList.contains('show')).toBe(true);
    document.getElementById('outside-correlation').click();
    expect(document.getElementById('corr-options').classList.contains('show')).toBe(false);

    const roleButton = document.createElement('div');
    roleButton.setAttribute('role', 'button');
    roleButton.tabIndex = 0;
    const roleClick = vi.fn();
    roleButton.addEventListener('click', roleClick);
    document.body.appendChild(roleButton);
    roleButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    }));
    expect(roleClick).toHaveBeenCalledOnce();

    const passphrase = appendOverlay('passphrase-overlay');
    passphrase.style.display = 'flex';
    press('Escape');
    expect(actions.closeModal).toHaveBeenCalledTimes(2);
    passphrase.remove();

    const tour = appendOverlay('tour-overlay');
    press('Escape');
    expect(shell.endTour).toHaveBeenCalledOnce();
    tour.remove();

    const escapeRoutes = [
      ['sidebar-nav', 'mobile-open', 'closeMobileSidebar'],
      ['emf-interp-overlay', 'show', 'closeEMFInterpretation'],
      ['summary-modal-overlay', 'show', 'closeSummaryModal'],
      ['chat-panel', 'open', 'closeChatPanel'],
      ['changelog-modal-overlay', 'show', 'closeChangelog'],
      ['report-builder-overlay', 'show', 'closeReportBuilder'],
      ['client-list-overlay', 'show', 'closeClientList'],
      ['feedback-modal-overlay', 'show', 'closeFeedbackModal'],
      ['settings-modal-overlay', 'show', 'closeSettingsModal'],
      ['tweaks-panel-overlay', 'show', 'closeTweaksPanel'],
      ['light-env-assessment-overlay', 'show', 'closeLightEnvironmentAssessment'],
      ['modal-overlay', 'show', 'closeModal'],
    ];
    for (const [id, className, action] of escapeRoutes) {
      const overlay = appendOverlay(id);
      overlay.className = className;
      press('Escape');
      expect(actions[action]).toHaveBeenCalled();
      overlay.remove();
    }

    const importOverlay = appendOverlay(
      'import-modal-overlay',
      '<div class="modal" id="import-modal"></div>',
    );
    press('Escape');
    expect(actions.closeImportModal).toHaveBeenCalledOnce();
    importOverlay.remove();

    const confirmOverlay = appendOverlay('confirm-dialog-overlay');
    press('Escape');
    expect(confirmOverlay.classList.contains('show')).toBe(false);
    confirmOverlay.remove();

    const anonymousOverlay = document.createElement('div');
    anonymousOverlay.className = 'modal-overlay show';
    document.body.appendChild(anonymousOverlay);
    press('Escape');
    expect(anonymousOverlay.isConnected).toBe(false);

    const namedFeatureOverlay = appendOverlay(
      'new-keyboard-feature-overlay',
      '<div class="modal" role="dialog"><button class="modal-close">Close feature</button></div>',
    );
    const namedFeatureClose = vi.fn(() => namedFeatureOverlay.remove());
    namedFeatureOverlay.querySelector('.modal-close').addEventListener('click', namedFeatureClose);
    press('Escape');
    expect(namedFeatureClose).toHaveBeenCalledOnce();

    const backgroundOverlay = appendOverlay('modal-overlay');
    const closeModalCallsBeforePrivacyReview = actions.closeModal.mock.calls.length;
    const privacyReviewOverlay = document.createElement('div');
    privacyReviewOverlay.className = 'pii-warning-overlay';
    privacyReviewOverlay.setAttribute('data-modal-focus-trap', '');
    privacyReviewOverlay.innerHTML = '<div class="modal" role="dialog"><button>Send</button></div>';
    document.body.appendChild(privacyReviewOverlay);
    press('Escape');
    expect(actions.closeModal).toHaveBeenCalledTimes(closeModalCallsBeforePrivacyReview);
    expect(privacyReviewOverlay.firstElementChild.classList.contains('modal-nudge')).toBe(true);
    privacyReviewOverlay.remove();
    backgroundOverlay.remove();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    actions.closeRestoreMnemonicDialog.mockImplementationOnce(() => {
      throw new Error('restore close failed');
    });
    const restoreOverlay = appendOverlay('sync-restore-overlay');
    press('Escape');
    restoreOverlay.remove();
    actions.closeSyncSetup.mockImplementationOnce(() => Promise.reject(new Error('setup close failed')));
    const setupOverlay = appendOverlay('sync-setup-overlay');
    press('Escape');
    setupOverlay.remove();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(2));
    consoleError.mockRestore();

    const focusOverlay = appendOverlay(
      'modal-overlay',
      '<div class="modal" role="dialog"><button id="first-focus">First</button><button id="last-focus">Last</button></div>',
    );
    const first = document.getElementById('first-focus');
    const last = document.getElementById('last-focus');
    last.focus();
    expect(press('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    focusOverlay.remove();

    const cloudOverlay = appendOverlay(
      'cloud-ai-consent-overlay',
      '<div role="dialog"><button id="cloud-cancel" data-cloud-ai-consent-action="cancel">Cancel</button><button id="cloud-approve">Approve</button></div>',
    );
    const cloudCancel = document.getElementById('cloud-cancel');
    const cloudApprove = document.getElementById('cloud-approve');
    cloudCancel.click = vi.fn();
    cloudApprove.focus();
    expect(press('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cloudCancel);
    press('Escape');
    expect(cloudCancel.click).toHaveBeenCalledOnce();
    cloudOverlay.remove();

    press('c');
    expect(actions.toggleChatPanel).toHaveBeenCalledOnce();
    const search = document.createElement('input');
    search.id = 'sidebar-search';
    search.select = vi.fn();
    document.body.appendChild(search);
    press('/');
    expect(document.activeElement).toBe(search);
    expect(search.select).toHaveBeenCalledOnce();

    appEvents.registerAppRefreshCallback();
    expect(shell.registerRefreshCallback).toHaveBeenCalledOnce();
    shell.refreshCallback();
    expect(shell.buildSidebar).toHaveBeenCalledOnce();
    expect(actions.navigate).toHaveBeenCalledWith('reports');
    expect(actions.updateChatNudge).toHaveBeenCalledOnce();
  });
});
