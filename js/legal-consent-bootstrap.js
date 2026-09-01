// @ts-check
// legal-consent-bootstrap.js — make the first-launch deployment-policy gate
// interactive before the main application bundle finishes loading.

(() => {
  const overlay = document.getElementById('legal-consent-overlay');
  if (!(overlay instanceof HTMLElement)) return;

  const acceptanceKey = 'labcharts-legal-acceptance';
  const termsVersion = overlay.dataset.termsVersion || '';
  const privacyVersion = overlay.dataset.privacyVersion || '';
  const hostname = String(location.hostname || '').toLowerCase().replace(/\.$/, '');
  const officialHost = hostname === 'getbased.health'
    || hostname.endsWith('.getbased.health')
    || hostname === 'get-based.vercel.app'
    || hostname === 'get-based-managed-subscription-v2.vercel.app';
  const meta = name => String(document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '').trim();
  const cleanUrl = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.origin);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  };
  const configured = {
    name: meta('getbased-operator-name'),
    privacyUrl: cleanUrl(meta('getbased-operator-privacy-url')),
    termsUrl: cleanUrl(meta('getbased-operator-terms-url')),
  };
  const operator = configured.name || configured.privacyUrl || configured.termsUrl
    ? configured
    : officialHost
      ? {
          name: 'getbased',
          privacyUrl: 'https://getbased.health/privacy',
          termsUrl: 'https://getbased.health/terms',
        }
      : configured;
  const hasPolicies = !!(operator.termsUrl || operator.privacyUrl);
  const policyScope = operator.name || operator.termsUrl || operator.privacyUrl
    ? [operator.name, operator.termsUrl, operator.privacyUrl].join('|')
    : 'self-hosted-notice';
  overlay.dataset.policyScope = policyScope;

  let previous = null;
  try {
    const raw = localStorage.getItem(acceptanceKey);
    previous = raw ? JSON.parse(raw) : null;
  } catch {
    previous = null;
  }

  const acceptedCurrent = previous?.accepted === true
    && previous?.termsVersion === termsVersion
    && previous?.privacyVersion === privacyVersion
    && previous?.policyScope === policyScope;
  if (acceptedCurrent) {
    overlay.remove();
    return;
  }

  const kicker = overlay.querySelector('.legal-consent-kicker');
  const title = document.getElementById('legal-consent-title');
  const description = document.getElementById('legal-consent-desc');
  const summary = overlay.querySelector('.legal-consent-summary');
  const statement = overlay.querySelector('.legal-consent-check span');
  const acceptButton = /** @type {HTMLButtonElement | null} */ (
    overlay.querySelector('[data-legal-consent-action="accept"]')
  );

  if (!officialHost) summary?.remove();
  if (kicker) kicker.textContent = hasPolicies ? `${operator.name || 'Deployment'} legal` : 'Self-hosted getbased';
  if (title) title.textContent = previous
    ? (hasPolicies ? 'Review updated Terms & Privacy' : 'Review updated app notice')
    : (hasPolicies ? 'Accept Terms & Privacy' : 'Review self-hosted app notice');
  if (description) {
    description.textContent = previous
      ? (hasPolicies
        ? 'The deployment policy identity or links changed since this browser last accepted them. Please review the current documents before continuing.'
        : 'The self-hosted app notice changed since this browser last acknowledged it. Please review it before continuing.')
      : (hasPolicies
        ? `Before using getbased, please review ${operator.name ? `${operator.name}'s` : 'the deployment operator\'s'} policies.`
        : 'This independent self-hosted deployment has not configured operator Terms or Privacy links.');
  }
  if (statement) {
    statement.replaceChildren();
    if (!hasPolicies) {
      statement.textContent = 'I acknowledge that this self-hosted getbased deployment is operated independently and that optional network features send data to the destinations disclosed at activation.';
    } else {
      statement.append(`I have read and agree to ${operator.name ? `${operator.name}'s ` : 'the deployment operator\'s '}`);
      /** @type {Array<{ label: string, url: string }>} */
      const documents = [];
      if (operator.termsUrl) documents.push({ label: 'Terms of Service', url: operator.termsUrl });
      if (operator.privacyUrl) documents.push({ label: 'Privacy Policy', url: operator.privacyUrl });
      documents.forEach((policyDocument, index) => {
        if (index) statement.append(' and ');
        const link = document.createElement('a');
        link.href = policyDocument.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = policyDocument.label;
        statement.appendChild(link);
      });
      statement.append('.');
    }
  }
  if (acceptButton) acceptButton.textContent = hasPolicies ? 'Accept & continue' : 'Acknowledge & continue';

  const checkbox = /** @type {HTMLInputElement | null} */ (
    document.getElementById('legal-consent-checkbox')
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
        policyScope,
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
