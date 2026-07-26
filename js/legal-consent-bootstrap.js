// @ts-check
// legal-consent-bootstrap.js — make the first-launch legal gate interactive
// before the main application bundle finishes loading.

(() => {
  const overlay = document.getElementById('legal-consent-overlay');
  if (!(overlay instanceof HTMLElement)) return;

  const acceptanceKey = 'labcharts-legal-acceptance';
  const termsVersion = overlay.dataset.termsVersion || '';
  const privacyVersion = overlay.dataset.privacyVersion || '';
  let previous = null;

  try {
    const raw = localStorage.getItem(acceptanceKey);
    previous = raw ? JSON.parse(raw) : null;
  } catch {
    previous = null;
  }

  const acceptedCurrent = previous?.accepted === true
    && previous?.termsVersion === termsVersion
    && previous?.privacyVersion === privacyVersion;
  if (acceptedCurrent) {
    overlay.remove();
    return;
  }

  if (previous && typeof previous === 'object') {
    const title = document.getElementById('legal-consent-title');
    const description = document.getElementById('legal-consent-desc');
    if (title) title.textContent = 'Review updated Terms & Privacy';
    if (description) {
      description.textContent = 'The Terms or Privacy Policy changed since this browser last accepted them. Please review and accept the current versions before continuing.';
    }
  }

  const localLinks = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  overlay.querySelectorAll('[data-legal-path]').forEach(link => {
    if (!(link instanceof HTMLAnchorElement)) return;
    const path = link.dataset.legalPath || '/';
    link.href = localLinks ? path : `https://getbased.health${path}`;
  });

  const checkbox = /** @type {HTMLInputElement | null} */ (
    document.getElementById('legal-consent-checkbox')
  );
  const acceptButton = /** @type {HTMLButtonElement | null} */ (
    overlay.querySelector('[data-legal-consent-action="accept"]')
  );
  if (!checkbox || !acceptButton) return;

  const syncAcceptButton = () => {
    acceptButton.disabled = !checkbox.checked;
  };
  const accept = () => {
    if (!checkbox.checked) return;
    let persisted = true;
    try {
      localStorage.setItem(acceptanceKey, JSON.stringify({
        accepted: true,
        termsVersion,
        privacyVersion,
        acceptedAt: new Date().toISOString(),
        appVersion: globalThis.APP_VERSION || null,
        location: location.origin + location.pathname,
      }));
    } catch (error) {
      persisted = false;
      console.warn('[legal-consent] Failed to persist acceptance:', error);
    }
    document.documentElement.dataset.legalConsentBootstrapResult = persisted ? 'persisted' : 'session';
    overlay.remove();
    document.body.classList.remove('legal-consent-visible');
    globalThis.dispatchEvent(new Event('legal-consent-accepted'));
  };

  checkbox.addEventListener('change', syncAcceptButton);
  acceptButton.addEventListener('click', accept);
  overlay.dataset.legalConsentBootstrapBound = 'true';
  document.body.classList.add('legal-consent-visible');
  syncAcceptButton();
  setTimeout(() => checkbox.focus(), 30);
})();
