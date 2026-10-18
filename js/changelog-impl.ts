import { CHANGELOG } from './changelog-data.js';
import { escapeHTML } from './utils.js';
import { projectChangelogView } from './changelog-presentation.js';
import { renderChangelog } from './changelog-rendering.js';
import { changelogClasses } from './changelog-classes.js';
import { getAppVersionRuntime } from './utils-runtime.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { getMajorMinor, getSeenVersion, markChangelogSeen, _semverGt } from './changelog-state.js';
const CHANGELOG_ACTION_ATTR = 'data-changelog-action';
const changelogDelegateRoots = new WeakSet<HTMLElement>();
/** Extract major.minor from a semver string (e.g. '1.0.1' → '1.0') */

// Changelog items are authored in source code (CHANGELOG above) — trusted.
// We escape everything by default and then re-allow a small whitelist of
// inline emphasis tags + safe-href anchors. Anything else (script, img,
// arbitrary attributes, javascript: URLs, etc.) stays escaped — defense-
// in-depth in case an entry ever incorporates user content.
function renderChangelogItem(item: string) {
  let out = escapeHTML(item);
  // Inline emphasis: <b>/<i>/<em>/<strong>/<code> render as styling.
  out = out.replace(/&lt;(\/?)(b|i|em|strong|code)&gt;/g, '<$1$2>');
  // Anchors: <a href="…">text</a>. Validate the protocol — only http,
  // https, and mailto pass; anything else (javascript:, data:, etc.)
  // strips back to plain text. External links open in a new tab with
  // noopener/noreferrer so the opener can't be navigated.
  out = out.replace(
    /&lt;a href=&quot;(.+?)&quot;&gt;(.+?)&lt;\/a&gt;/g,
    (_match, escapedUrl, inner) => {
      // The captured URL is HTML-escaped (& → &amp; etc.). Decode for the
      // protocol check, but emit the escaped form back into the href so
      // ampersand-bearing URLs (?foo=1&bar=2) round-trip correctly.
      const decoded = escapedUrl.replace(/&amp;/g, '&');
      if (!/^(https?:|mailto:)/i.test(decoded)) return inner; // unsafe → drop the wrapper, keep text
      const isExternal = /^https?:/i.test(decoded);
      const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapedUrl}"${attrs}>${inner}</a>`;
    }
  );
  return out;
}

export function openChangelog(showAll: unknown) {
  const overlay = document.getElementById('changelog-modal-overlay');
  const modal = document.getElementById('changelog-modal');
  if (!overlay || !modal) return;

  const entries = showAll ? CHANGELOG : CHANGELOG.slice(0, 3);
  modal.className = changelogClasses('modal changelog-modal gb-history-modal', 'panel');
  modal.innerHTML = renderChangelog(projectChangelogView(entries, renderChangelogItem));
  installChangelogDelegates(modal);
  openModalOverlay(overlay);
}

function handleChangelogActionClick(event: Event) {
  const target = event.target as (EventTarget & { closest?: Element['closest'] }) | null;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest(`[${CHANGELOG_ACTION_ATTR}]`);
  if (!actionEl || !(event.currentTarget as (EventTarget & { contains?: Node['contains'] }) | null)?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(CHANGELOG_ACTION_ATTR) === 'close') {
    event.preventDefault();
    event.stopPropagation();
    closeChangelog();
  }
}

function installChangelogDelegates(root: HTMLElement | null | undefined) {
  if (!root || changelogDelegateRoots.has(root)) return;
  changelogDelegateRoots.add(root);
  root.addEventListener('click', handleChangelogActionClick);
}

export function closeChangelog() {
  closeModalOverlay('changelog-modal-overlay');
  markChangelogSeen();
}

// Compare two semver strings — returns true when `a` is strictly newer
// than `b`. Tolerant of missing parts (treats "1.7" as "1.7.0").

export function maybeShowChangelog() {
  if (document.getElementById('legal-consent-overlay')) return;
  const seen = getSeenVersion();
  const appVersion = getAppVersionRuntime();
  // First visit — no changelog, just mark as seen
  if (!seen) { markChangelogSeen(); return; }
  // Only show What's New on minor/major bumps, not patch
  if (appVersion && getMajorMinor(seen) !== getMajorMinor(appVersion)) {
    openChangelog(false);
    return;
  }
  // Patch-level bumps normally don't auto-show, but a maintainer can flag
  // an entry as forceShow when it carries a critical user-action notice
  // (e.g. "re-export your encrypted backup" in v1.7.1). Scan all entries
  // newer than the user's seen version — a later non-forceShow patch must
  // not shadow an earlier critical entry. Idempotent because closeChangelog
  // advances seen to the current APP_VERSION.
  const hasForceShowAheadOfSeen = CHANGELOG.some(
    e => e && e.forceShow && _semverGt(e.version, seen)
  );
  if (hasForceShowAheadOfSeen) openChangelog(false);
}
