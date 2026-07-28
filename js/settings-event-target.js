// @ts-check
// settings-event-target.js - Shared target resolution for delegated Settings surfaces.

/**
 * @param {Event} event
 * @param {string} selector
 * @param {Element} root
 * @returns {HTMLElement | null}
 */
export function closestSettingsTarget(event, selector, root) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  return el instanceof HTMLElement && root.contains(el) ? el : null;
}

/**
 * @param {Event} event
 * @param {string} selector
 * @param {Element} root
 * @returns {HTMLInputElement | null}
 */
export function getSettingsProxyToggle(event, selector, root) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (target.matches(selector)) return null;
  const toggle = target.closest('.toggle-switch');
  if (!toggle || !root.contains(toggle)) return null;
  const input = toggle.querySelector(selector);
  if (!(input instanceof HTMLInputElement) || input.disabled) return null;
  return input;
}
