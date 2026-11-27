import {getActiveProfileId, getProfiles, switchProfile} from './profile.js';
import {loadDemoData} from './export-loader.js';
import {isPublicDemoMode} from './public-demo-mode.js';

const PUBLIC_DEMO_STATE_VERSION_KEY = 'getbased-public-demo-v';
const PUBLIC_DEMO_STATE_VERSION = '2';
let pendingDemoSelect: Promise<void> | null = null;

function isDemoProfile(profile: {tags?: unknown}): boolean {
  return Array.isArray(profile.tags) && profile.tags.includes('demo');
}

function findDemoProfile(sex: 'female' | 'male') {
  return getProfiles().find(profile => isDemoProfile(profile) && profile.sex === sex) || null;
}

export function resetLegacyPublicDemoStateIfNeeded(): void {
  if (!isPublicDemoMode()) return;
  try {
    if (localStorage.getItem(PUBLIC_DEMO_STATE_VERSION_KEY) === PUBLIC_DEMO_STATE_VERSION) return;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^(?:labcharts-|getbased-)/.test(key)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
    localStorage.setItem(PUBLIC_DEMO_STATE_VERSION_KEY, PUBLIC_DEMO_STATE_VERSION);
  } catch { /* ignore storage errors */ }
}

function syncPublicDemoBannerState(): void {
  const banner = document.getElementById('public-demo-banner');
  if (!banner) return;
  const activeId = getActiveProfileId();
  const sarah = findDemoProfile('female');
  const alex = findDemoProfile('male');
  const sarahBtn = banner.querySelector<HTMLButtonElement>('[data-public-demo-switch="female"]');
  const alexBtn = banner.querySelector<HTMLButtonElement>('[data-public-demo-switch="male"]');
  if (sarahBtn) {
    const active = Boolean(sarah && sarah.id === activeId);
    sarahBtn.setAttribute('aria-pressed', String(active));
    sarahBtn.classList.toggle('active', active);
  }
  if (alexBtn) {
    const active = Boolean(alex && alex.id === activeId);
    alexBtn.setAttribute('aria-pressed', String(active));
    alexBtn.classList.toggle('active', active);
  }
}

export function selectPublicDemoProfile(sex: 'female' | 'male'): Promise<void> {
  if (!isPublicDemoMode()) return Promise.resolve();
  if (pendingDemoSelect) return pendingDemoSelect;
  const done = (async () => {
    const existing = findDemoProfile(sex);
    if (existing) {
      if (getActiveProfileId() !== existing.id) {
        await switchProfile(existing.id);
      }
    } else {
      await loadDemoData(sex);
    }
    syncPublicDemoBannerState();
  })().finally(() => {
    if (pendingDemoSelect === done) pendingDemoSelect = null;
  });
  pendingDemoSelect = done;
  return done;
}

export function mountPublicDemoBanner(): void {
  if (!isPublicDemoMode() || typeof document === 'undefined') return;
  document.body.classList.add('public-demo-mode');
  if (document.getElementById('public-demo-banner')) {
    syncPublicDemoBannerState();
    return;
  }
  if (!document.querySelector('link[href="/css/hosted-transition.css"]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/css/hosted-transition.css';
    document.head.appendChild(style);
  }

  const banner = document.createElement('aside');
  banner.id = 'public-demo-banner';
  banner.className = 'hosted-transition-banner public-demo-banner';
  banner.setAttribute('aria-label', 'Public demo mode');

  const text = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = 'Interactive demo — ';
  text.append(strong, 'choose Demo Sarah or Demo Alex to explore. Creating profiles, imports, and live AI are disabled.');

  const switcher = document.createElement('div');
  switcher.className = 'public-demo-switcher';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Switch demo profile');

  const makeSwitchButton = (sex: 'female' | 'male', label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.publicDemoSwitch = sex;
    button.textContent = label;
    button.addEventListener('click', () => {
      void selectPublicDemoProfile(sex);
    });
    return button;
  };
  switcher.append(makeSwitchButton('female', 'Demo Sarah'), makeSwitchButton('male', 'Demo Alex'));

  const makeLink = (href: string, label: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
  };

  banner.append(
    text,
    switcher,
    makeLink('https://docs.getbased.health/guides/self-hosting', 'Self-host getbased'),
    makeLink('https://github.com/elkimek/get-based/fork', 'Fork on GitHub'),
    makeLink('https://app.getbased.health/app/migration.html', 'Recover hosted data'),
  );
  document.body.prepend(banner);
  globalThis.addEventListener('profile-switched', syncPublicDemoBannerState);
  syncPublicDemoBannerState();
}
