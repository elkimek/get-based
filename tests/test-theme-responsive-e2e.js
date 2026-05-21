#!/usr/bin/env node
// Theme/responsive E2E smoke: real Chrome, real viewport changes, every shipped theme.
//
// This complements the legacy in-page tests. Those cover behavior well, but
// they run in one browser viewport. This file exercises the default app shell
// at desktop and phone widths so theme/mobile regressions fail in CI instead
// of relying only on manual screenshots.

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const PORT = process.env.PORT || 8000;
const BASE_URL = `http://localhost:${PORT}/app`;
const THEMES = ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer'];
const THEME_BAR_COLORS = {
  dark: '#0a0a12',
  light: '#ffffff',
  cyberterm: '#0b0d0b',
  glass: '#0a0817',
  'synth-sunrise': '#0d0524',
  neuromancer: '#050608',
};
const SUNSET_THEME_COLOR = '#120504';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'mobile', width: 393, height: 852, mobile: true },
  { name: 'mobile-compact', width: 320, height: 740, mobile: true },
];
const BOUNDARY_VIEWPORTS = [
  { name: 'mobile-boundary-799', width: 799, height: 900, mobile: true },
  { name: 'desktop-boundary-800', width: 800, height: 900, mobile: false },
];

const ARTIFACTS_DIR = process.env.REDESIGN_E2E_ARTIFACTS
  ? path.resolve(process.env.REDESIGN_E2E_ARTIFACTS)
  : '';

let pass = 0;
let fail = 0;
const failures = [];

function assert(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    const msg = `${name}${detail ? ` -- ${detail}` : ''}`;
    failures.push(msg);
    console.error(`  FAIL ${msg}`);
  }
}

function testName(theme, viewport, label) {
  return `${theme}/${viewport}: ${label}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForApp(page) {
  await page.waitForFunction(
    () => typeof window.navigate === 'function'
      && window._labState
      && typeof window.buildSidebar === 'function',
    { timeout: 15000 }
  );
}

async function seedDemoData(page) {
  await page.evaluate(async () => {
    const demo = await fetch('/data/demo-male.json', { cache: 'no-store' }).then(r => r.json());
    window._labState.importedData = demo;
    window._labState.profileSex = 'male';
    window._labState.profileDob = '1987-11-22';
    window.saveImportedData?.();
    window.buildSidebar?.();
    window.navigate?.('dashboard');
  });
  await page.waitForSelector('#main-content', { timeout: 10000 });
  await delay(200);
}

async function seedMobileLightSessions(page) {
  await page.evaluate(async () => {
    const S = window._labState;
    if (!S?.importedData || typeof window.logCompletedSession !== 'function') return;
    const now = Date.now();
    S.importedData.sunSessions = [];
    S.importedData.deviceSessions = [];
    S.importedData.lightDevices = [{
      id: 'D-mobile-long',
      brand: 'Mitochondriak Performance Systems',
      model: 'Ultra Bright Red Near Infrared Panel Max 9000',
      type: 'red-nir',
      peakWavelengths: [660, 850],
      mwPerCm2At15cm: 120,
      recommendedDistanceCm: 15,
      modes: [
        { id: 'all-on', label: 'All wavelengths active', groups: ['red', 'nir'], default: true },
        { id: 'red-nir-only', label: 'Red plus near infrared recovery preset', groups: ['red', 'nir'] },
      ],
    }];
    await window.logCompletedSession({
      startedAt: now - 4 * 3600000,
      endedAt: now - 3.5 * 3600000,
      bodyExposure: { preset: 'tshirt', fraction: 0.30, regions: ['arms-front', 'legs-front'], sunscreenSPF: null, glassBetween: false },
      eyeExposure: { mode: 'sunglasses', durationSec: 1800 },
      doses: { vitamin_d: 220, circadian: 12000, no_cv: 60, nir_solar: 50000, pomc: 400, violet_eye: 3000 },
      safety: { medFraction: 0.42, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 6 },
    });
    if (typeof window.logDeviceSession === 'function') {
      await window.logDeviceSession({
        deviceId: 'D-mobile-long',
        durationMin: 22,
        distanceCm: 15,
        bodyArea: 'torso and face',
        eyesProtected: true,
        mode: 'red-nir-only',
      });
    }
    await window.logCompletedSession({
      startedAt: now - 2 * 86400000,
      endedAt: now - 2 * 86400000 + 35 * 60000,
      bodyExposure: { preset: 'shorts', fraction: 0.45, regions: ['chest', 'arms-front', 'legs-front'], sunscreenSPF: 30, glassBetween: false },
      eyeExposure: { mode: 'direct', durationSec: 2100 },
      doses: { vitamin_d: 500, circadian: 20000, no_cv: 120, nir_solar: 70000, pomc: 800, violet_eye: 5000 },
      safety: { medFraction: 0.75, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 7 },
    });
  });
}

async function prepareScenario(page, theme, viewport) {
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
  });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await waitForApp(page);
  await page.evaluate((nextTheme) => {
    window.closeModal?.();
    window.closeSettingsModal?.();
    window.closeChatPanel?.();
    window.closeMobileSidebar?.();
    document.querySelectorAll('.modal-overlay.show').forEach(el => el.classList.remove('show'));
    localStorage.removeItem('labcharts-accent-override');
    localStorage.removeItem('labcharts-sunset-mode');
    localStorage.removeItem('labcharts-crt-effects');
    if (typeof window.setSunsetMode === 'function') window.setSunsetMode(false);
    else delete document.documentElement.dataset.sunsetMode;
    if (typeof window.setCrtEffectsEnabled === 'function') window.setCrtEffectsEnabled(false);
    else delete document.documentElement.dataset.crtEffects;
    window.applyAccentOverride?.('');
    if (nextTheme === 'dark') localStorage.setItem('labcharts-theme', 'dark');
    else localStorage.setItem('labcharts-theme', nextTheme);
    if (typeof window.setTheme === 'function') window.setTheme(nextTheme);
  }, theme);
  await seedDemoData(page);
}

async function captureArtifact(page, theme, viewport) {
  const shot = await page.screenshot({ fullPage: false });
  assert(testName(theme, viewport, 'Chrome screenshot is non-empty'), shot.length > 10000, `bytes=${shot.length}`);
  if (ARTIFACTS_DIR) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, `${theme}-${viewport}.png`), shot);
  }
}

async function evaluateBaseChecks(page, theme, viewport) {
  return page.evaluate(({ theme, viewport, themeBarColors }) => {
    const failures = [];
    const notes = [];
    const expectedAttr = theme === 'dark' ? null : theme;

    function ok(name, cond, detail = '') {
      if (!cond) failures.push({ name, detail });
    }
    function note(name, detail = '') {
      notes.push({ name, detail });
    }
    function cssVar(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    function bySelector(selector) {
      return Array.from(document.querySelectorAll(selector));
    }
    function rect(el) {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    function visible(el) {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none'
        && cs.visibility !== 'hidden'
        && Number(cs.opacity || 1) > 0.01
        && r.width > 1
        && r.height > 1;
    }
    function inViewport(el, margin = 1) {
      const r = rect(el);
      return r.left >= -margin
        && r.top >= -margin
        && r.right <= window.innerWidth + margin
        && r.bottom <= window.innerHeight + margin;
    }
    function overlap(a, b) {
      const ar = rect(a);
      const br = rect(b);
      const x = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
      const y = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
      return x * y;
    }
    function assertNoOverlap(selector, label) {
      const els = bySelector(selector).filter(visible);
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          ok(`${label} do not overlap`, overlap(els[i], els[j]) < 6,
            `${selector} index ${i} overlaps ${j}`);
        }
      }
    }
    function badTextOverflow() {
      const selectors = [
        '.brand-mark',
        '.profile-compact-name',
        '.donate-btn',
        '.dashboard-widget-title',
        '.m-tab small',
        '.m-stat-label',
        '.m-marker-main strong',
        '.m-marker-value strong',
      ];
      return selectors.flatMap(selector => bySelector(selector).filter(visible).map(el => {
        const cs = getComputedStyle(el);
        const overflows = el.scrollWidth > el.clientWidth + 3;
        const clippedOrEllipsized = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
        if (!overflows || clippedOrEllipsized) return null;
        return `${selector}: ${el.textContent.trim().slice(0, 60)}`;
      }).filter(Boolean));
    }
    function parseColor(input) {
      const value = String(input || '').trim();
      let m = value.match(/^rgba?\(([^)]+)\)$/i);
      if (m) {
        const parts = m[1].replace(/\//g, ',').split(/[\s,]+/).filter(Boolean);
        return {
          r: Number(parts[0]),
          g: Number(parts[1]),
          b: Number(parts[2]),
          a: parts[3] == null ? 1 : Number(parts[3]),
        };
      }
      m = value.match(/^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\)$/i);
      if (m) {
        return {
          r: Number(m[1]) * 255,
          g: Number(m[2]) * 255,
          b: Number(m[3]) * 255,
          a: m[4] == null ? 1 : Number(m[4]),
        };
      }
      m = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (m) {
        const hex = m[1].length === 3
          ? m[1].split('').map(c => c + c).join('')
          : m[1];
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: 1,
        };
      }
      return null;
    }
    function resolveColor(value, prop = 'color') {
      const el = document.createElement('span');
      el.style[prop] = value;
      document.body.appendChild(el);
      const resolved = getComputedStyle(el)[prop];
      el.remove();
      return parseColor(resolved);
    }
    function composite(fg, bg) {
      const alpha = fg.a == null ? 1 : fg.a;
      return {
        r: fg.r * alpha + bg.r * (1 - alpha),
        g: fg.g * alpha + bg.g * (1 - alpha),
        b: fg.b * alpha + bg.b * (1 - alpha),
        a: 1,
      };
    }
    function luminance(c) {
      const ch = [c.r, c.g, c.b].map(v => {
        const s = Math.max(0, Math.min(255, v)) / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    }
    function contrast(a, b) {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function resolvedVar(name, prop = 'color') {
      return resolveColor(cssVar(name), prop);
    }
    function contrastAgainst(tokenA, tokenB, min, label, bgFallback = null) {
      const a = resolvedVar(tokenA);
      let b = resolvedVar(tokenB, 'backgroundColor');
      if (b && b.a < 1 && bgFallback) b = composite(b, bgFallback);
      ok(label, a && b && contrast(a, b) >= min,
        a && b ? `ratio=${contrast(a, b).toFixed(2)} min=${min}` : 'unparseable color');
    }

    const mobile = window.matchMedia('(max-width: 799px)').matches;
    const root = document.documentElement;
    const primaryBg = resolvedVar('--bg-primary', 'backgroundColor') || parseColor('rgb(0,0,0)');

    ok('theme attribute matches selected theme', root.getAttribute('data-theme') === expectedAttr,
      `expected=${expectedAttr} actual=${root.getAttribute('data-theme')}`);
    const themeColorMetas = bySelector('meta[name="theme-color"]');
    const expectedThemeColor = themeBarColors[theme] || themeBarColors.dark;
    ok('theme-color meta follows selected theme',
      themeColorMetas.length >= 1 && themeColorMetas.every(meta => meta.content.toLowerCase() === expectedThemeColor),
      themeColorMetas.map(meta => meta.content).join(','));
    ok('accent token is present', !!cssVar('--accent'), 'missing --accent');
    ok('viewport breakpoint matches expected mode', mobile === viewport.mobile,
      `matchMedia=${mobile} width=${window.innerWidth}`);
    ok('page has no document-level horizontal overflow',
      document.scrollingElement.scrollWidth <= window.innerWidth + 2,
      `scrollWidth=${document.scrollingElement.scrollWidth} viewport=${window.innerWidth}`);
    ok('main content exists and is visible', visible(document.getElementById('main-content')));
    contrastAgainst('--text-primary', '--bg-card', 4.5, 'primary text contrasts with card background', primaryBg);
    contrastAgainst('--text-secondary', '--bg-card', 3.0, 'secondary text contrasts with card background', primaryBg);
    contrastAgainst('--on-accent', '--accent', 4.5, 'accent foreground contrasts with accent');

    const overflowingText = badTextOverflow();
    ok('chrome/dashboard text does not visibly overflow fixed labels',
      overflowingText.length === 0,
      overflowingText.join('; '));

    if (viewport.mobile) {
      const shell = document.querySelector('.m-shell');
      const tabbar = document.querySelector('.m-tabbar');
      const fab = document.querySelector('.m-chat-fab');
      const desktopChatFab = document.getElementById('chat-fab');
      ok('mobile dashboard shell is active', document.body.classList.contains('mobile-dashboard-active'));
      ok('mobile shell is visible', visible(shell));
      ok('mobile tabbar is visible', visible(tabbar));
      ok('mobile tabbar is contained in viewport', tabbar && inViewport(tabbar, 2));
      ok('mobile chat FAB is visible and above tabbar', visible(fab) && tabbar && rect(fab).bottom < rect(tabbar).top);
      ok('desktop chat FAB hidden inside mobile shell', !visible(desktopChatFab));
      ok('donate button hidden on mobile', !visible(document.querySelector('.donate-btn')));
      const mobileWidgets = bySelector('.m-dashboard-widgets .dashboard-widget[data-widget-id]').filter(visible);
      ok('mobile renders the shared dashboard widget stack', mobileWidgets.length >= 5, `widgets=${mobileWidgets.length}`);
      ok('mobile dashboard exposes widget customize controls',
        bySelector('.m-dashboard-widget-actions .dashboard-action-btn').filter(visible).length >= 2);
      const mobileWidgetIds = new Set(mobileWidgets.map(el => el.dataset.widgetId));
      ok('mobile and desktop dashboard share default widget ids',
        mobileWidgetIds.has('quick-markers') &&
        mobileWidgetIds.has('key-trends') &&
        mobileWidgetIds.has('recommendations'),
        `ids=${[...mobileWidgetIds].join(',')}`);
      ok('mobile dashboard has no static duplicate dashboard sections',
        bySelector('.m-stat-card, .m-marker-row, #mobile-light-section, #mobile-body-section, #mobile-genome-section').filter(visible).length === 0);
      ok('mobile top brand stays inside viewport',
        inViewport(document.querySelector('.brand-mark'), 2));
      assertNoOverlap('.m-tab', 'mobile tab buttons');
      assertNoOverlap('.m-dashboard-widgets .dashboard-widget', 'mobile dashboard widgets');

      if (theme === 'cyberterm') {
        ok('cyberterm mobile section titles show bracket signature',
          getComputedStyle(document.querySelector('.m-section-title'), '::before').content.includes('['));
      }
      if (theme === 'glass') {
        const filter = getComputedStyle(tabbar).backdropFilter || getComputedStyle(tabbar).webkitBackdropFilter;
        ok('glass mobile tabbar uses frosted backdrop', filter && filter !== 'none');
      }
      if (theme === 'synth-sunrise') {
        ok('synth mobile background grid is active',
          getComputedStyle(document.querySelector('.m-bg')).transform !== 'none');
      }
      if (theme === 'neuromancer') {
        ok('neuromancer mobile grid background is active',
          getComputedStyle(document.querySelector('.m-bg')).backgroundImage.includes('linear-gradient'));
      }
    } else {
      ok('desktop shell is not using mobile dashboard', !document.body.classList.contains('mobile-dashboard-active'));
      ok('desktop sidebar is visible', visible(document.getElementById('sidebar-nav')));
      ok('desktop header is visible', visible(document.querySelector('.header')));
      ok('desktop dashboard widgets render', bySelector('.dashboard-widget').filter(visible).length >= 5);
      ok('desktop Current Priority widget renders',
        !!document.querySelector('.dashboard-widget[data-widget-id="spotlight"]'));
      ok('desktop Key Trends widget renders compact rows',
        !!document.querySelector('.dashboard-widget[data-widget-id="key-trends"] .db-key-trend-row'));
      const donate = document.querySelector('.donate-btn');
      ok('desktop Donate button is visible and not icon-sized',
        visible(donate) && rect(donate).width >= 64 && rect(donate).height >= 32 && /Donate/.test(donate.textContent || ''),
        donate ? `width=${rect(donate).width.toFixed(1)} height=${rect(donate).height.toFixed(1)} text="${donate.textContent.trim()}"` : 'missing');
      assertNoOverlap('.header > .brand, .header > .header-info, .header > .header-right', 'desktop header regions');

      if (theme === 'cyberterm') {
        ok('cyberterm brand prompt is visible',
          getComputedStyle(document.querySelector('.brand-mark'), '::before').content.includes('$'));
        ok('cyberterm dashboard title brackets are visible',
          getComputedStyle(document.querySelector('.dashboard-widget-title'), '::before').content.includes('['));
      }
      if (theme === 'glass') {
        const filter = getComputedStyle(document.querySelector('.header')).backdropFilter
          || getComputedStyle(document.querySelector('.header')).webkitBackdropFilter;
        ok('glass desktop chrome uses frosted backdrop', filter && filter !== 'none');
      }
      if (theme === 'synth-sunrise') {
        ok('synth desktop horizon pseudo-element is active',
          getComputedStyle(document.body, '::before').content !== 'none');
      }
      if (theme === 'neuromancer') {
        ok('neuromancer desktop grid pseudo-element is active',
          getComputedStyle(document.body, '::before').content !== 'none');
      }
    }

    note('summary', `${theme}/${viewport.name} failures=${failures.length}`);
    return { failures, notes };
  }, { theme, viewport, themeBarColors: THEME_BAR_COLORS });
}

async function checkDesktopModals(page, theme, viewportName) {
  await page.evaluate(() => window.openSettingsModal?.('display'));
  await delay(200);
  let result = await page.evaluate(() => {
    const overlay = document.getElementById('settings-modal-overlay');
    const modal = document.getElementById('settings-modal');
    const r = modal.getBoundingClientRect();
    return {
      open: overlay.classList.contains('show'),
      visible: getComputedStyle(modal).display !== 'none' && r.width > 100 && r.height > 100,
      contained: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
      hasTweaksButton: !!document.querySelector('.tweaks-btn'),
      hasDuplicateThemeGrid: !!document.querySelector('.settings-theme-grid'),
    };
  });
  assert(testName(theme, viewportName, 'settings modal opens visibly'), result.open && result.visible);
  assert(testName(theme, viewportName, 'settings modal fits viewport'), result.contained, JSON.stringify(result));
  assert(testName(theme, viewportName, 'settings display does not duplicate theme picker'), !result.hasDuplicateThemeGrid, JSON.stringify(result));
  await page.evaluate(() => window.closeSettingsModal?.());
  await delay(100);

  await page.evaluate(() => window.openTweaksPanel?.());
  await delay(150);
  result = await page.evaluate((theme) => {
    const panel = document.getElementById('tweaks-panel');
    const r = panel?.getBoundingClientRect();
    const defaultSwatch = panel?.querySelector('.tweaks-accent-btn[data-accent-id=""] .tweaks-accent-swatch');
    const defaultAccent = defaultSwatch?.style.getPropertyValue('--tweak-accent')?.trim()?.toLowerCase() || '';
    const crtRow = panel?.querySelector('#tweaks-crt-effects-row');
    const crtToggle = panel?.querySelector('#tweaks-crt-effects');
    const crtSupported = !!window.supportsCrtEffects?.(theme);
    const crtRowVisible = !!crtRow && !crtRow.hidden && getComputedStyle(crtRow).display !== 'none';
    return {
      open: !!panel,
      contained: !!r && r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
      activeTheme: panel?.querySelector('.tweaks-theme-btn.active')?.dataset.themeId || '',
      themeButtons: panel?.querySelectorAll('.tweaks-theme-btn').length || 0,
      accentButtons: panel?.querySelectorAll('.tweaks-accent-btn').length || 0,
      hasCrtToggle: !!crtToggle,
      crtSupported,
      crtRowVisible,
      crtToggleDisabled: !!crtToggle?.disabled,
      defaultAccent,
      expectedDefaultAccent: {
        dark: '#4f8cff',
        light: '#3b7cf5',
        cyberterm: '#4ade80',
        glass: '#c986ff',
        'synth-sunrise': '#ff2bd6',
        neuromancer: '#00e5ff',
      }[theme],
      hasTryItActions: (panel?.textContent || '').includes('Try it'),
    };
  }, theme);
  assert(testName(theme, viewportName, 'tweaks panel opens and fits viewport'),
    result.open && result.contained,
    JSON.stringify(result));
  assert(testName(theme, viewportName, 'tweaks owns current theme controls'),
    result.activeTheme === theme
      && result.themeButtons === THEMES.length
      && result.accentButtons >= 6
      && result.hasCrtToggle
      && result.crtRowVisible === result.crtSupported
      && result.crtToggleDisabled === !result.crtSupported
      && !result.hasTryItActions,
    JSON.stringify(result));
  assert(testName(theme, viewportName, 'theme default accent swatch follows theme'),
    result.defaultAccent === result.expectedDefaultAccent,
    JSON.stringify(result));
  await page.evaluate(() => window.selectTweaksAccent?.('rose'));
  await delay(80);
  result = await page.evaluate(() => ({
    storedAccent: localStorage.getItem('labcharts-accent-override') || '',
    rootAccent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase(),
    activeAccent: document.querySelector('.tweaks-accent-btn.active')?.dataset.accentId || '',
  }));
  assert(testName(theme, viewportName, 'custom accent applies through tweaks'),
    result.storedAccent === 'rose' && result.rootAccent === '#f43f5e' && result.activeAccent === 'rose',
    JSON.stringify(result));
  await page.evaluate(() => {
    window.toggleTweaksCrtEffects?.(true);
    window.updateTweaksUI?.();
  });
  await delay(80);
  result = await page.evaluate((theme) => {
    const supported = !!window.supportsCrtEffects?.(theme);
    const crtRow = document.getElementById('tweaks-crt-effects-row');
    const crtToggle = document.getElementById('tweaks-crt-effects');
    const crtRowVisible = !!crtRow && !crtRow.hidden && getComputedStyle(crtRow).display !== 'none';
    const bodyAfter = getComputedStyle(document.body, '::after');
    return {
      supported,
      crtAttr: document.documentElement.dataset.crtEffects || '',
      storedCrt: localStorage.getItem('labcharts-crt-effects') || '',
      crtToggle: !!crtToggle?.checked,
      crtRowVisible,
      crtToggleDisabled: !!crtToggle?.disabled,
      bodyAfterContent: bodyAfter.content,
      bodyAfterPosition: bodyAfter.position,
      bodyAfterAnimation: bodyAfter.animationName,
      bodyAfterBlend: bodyAfter.mixBlendMode,
    };
  }, theme);
  assert(testName(theme, viewportName, 'CRT effects toggle applies only to terminal-style themes'),
    result.crtAttr === 'on'
      && result.storedCrt === 'true'
      && result.crtToggle
      && result.crtRowVisible === result.supported
      && result.crtToggleDisabled === !result.supported
      && (result.supported
        ? result.bodyAfterContent !== 'none' && result.bodyAfterPosition === 'fixed' && result.bodyAfterAnimation.includes('crt-flicker') && result.bodyAfterAnimation.includes('crt-sweep') && result.bodyAfterBlend === 'overlay'
        : result.bodyAfterContent === 'none'),
    JSON.stringify(result));
  await page.evaluate(() => {
    window.toggleTweaksCrtEffects?.(false);
    window.updateTweaksUI?.();
  });
  await delay(80);
  result = await page.evaluate((theme) => {
    const supported = !!window.supportsCrtEffects?.(theme);
    const crtRow = document.getElementById('tweaks-crt-effects-row');
    const crtToggle = document.getElementById('tweaks-crt-effects');
    const crtRowVisible = !!crtRow && !crtRow.hidden && getComputedStyle(crtRow).display !== 'none';
    return {
      supported,
      crtAttr: document.documentElement.dataset.crtEffects || '',
      storedCrt: localStorage.getItem('labcharts-crt-effects') || '',
      crtToggle: !!crtToggle?.checked,
      crtRowVisible,
      crtToggleDisabled: !!crtToggle?.disabled,
      bodyAfterContent: getComputedStyle(document.body, '::after').content,
    };
  }, theme);
  assert(testName(theme, viewportName, 'CRT effects toggle turns off cleanly'),
    result.crtAttr === ''
      && result.storedCrt === ''
      && !result.crtToggle
      && result.crtRowVisible === result.supported
      && result.crtToggleDisabled === !result.supported
      && result.bodyAfterContent === 'none',
    JSON.stringify(result));
  await page.evaluate(() => {
    window.setSunsetMode?.(true);
    window.applyAccentOverride?.();
    window.updateTweaksUI?.();
  });
  await delay(80);
  result = await page.evaluate((sunsetThemeColor) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]')).map(meta => meta.content.toLowerCase());
    const accent = rootStyle.getPropertyValue('--accent').trim().toLowerCase();
    const cyan = rootStyle.getPropertyValue('--cyan').trim().toLowerCase();
    return {
      sunsetAttr: document.documentElement.dataset.sunsetMode || '',
      storedAccent: localStorage.getItem('labcharts-accent-override') || '',
      rootAccent: accent,
      cyan,
      themeColors: metas,
      sunsetToggle: !!document.getElementById('tweaks-sunset-mode')?.checked,
      hasCoolAccentLeak: accent === '#f43f5e' || accent.includes('79, 140, 255') || cyan.includes('182, 212') || cyan.includes('229, 255'),
      expectedThemeColor: sunsetThemeColor,
    };
  }, SUNSET_THEME_COLOR);
  assert(testName(theme, viewportName, 'sunset mode suppresses cool/custom accents'),
    result.sunsetAttr === 'on'
      && result.storedAccent === 'rose'
      && result.rootAccent === '#ffb000'
      && !result.hasCoolAccentLeak
      && result.sunsetToggle
      && result.themeColors.every(color => color === SUNSET_THEME_COLOR),
    JSON.stringify(result));
  await page.evaluate(() => {
    window.setSunsetMode?.(false);
    window.applyAccentOverride?.();
    window.updateTweaksUI?.();
  });
  await delay(80);
  result = await page.evaluate(() => ({
    sunsetAttr: document.documentElement.dataset.sunsetMode || '',
    restoredAccent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase(),
  }));
  assert(testName(theme, viewportName, 'accent override restores after sunset mode'),
    result.sunsetAttr === '' && result.restoredAccent === '#f43f5e',
    JSON.stringify(result));
  await page.evaluate(() => {
    window.selectTweaksAccent?.('');
    window.closeTweaksPanel?.();
  });
  await delay(100);

  const markerId = await page.evaluate(() => {
    const data = window.getActiveData?.();
    for (const [catKey, cat] of Object.entries(data?.categories || {})) {
      for (const [markerKey, marker] of Object.entries(cat.markers || {})) {
        if ((marker.values || []).some(v => v != null && Number.isFinite(Number(v)))) return `${catKey}_${markerKey}`;
      }
    }
    return '';
  });
  assert(testName(theme, viewportName, 'demo marker available for modal test'), !!markerId);
  if (markerId) {
    await page.evaluate(id => window.showDetailModal?.(id), markerId);
    await delay(250);
    result = await page.evaluate(() => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('detail-modal');
      const r = modal.getBoundingClientRect();
      const canvas = modal.querySelector('canvas');
      return {
        open: overlay.classList.contains('show'),
        contained: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
        valueCards: modal.querySelectorAll('.modal-value-card').length,
        canvasSize: canvas ? `${canvas.clientWidth}x${canvas.clientHeight}` : '',
      };
    });
    assert(testName(theme, viewportName, 'marker detail modal opens with values'),
      result.open && result.valueCards > 0,
      JSON.stringify(result));
    assert(testName(theme, viewportName, 'marker detail modal fits viewport'),
      result.contained,
      JSON.stringify(result));
    await page.evaluate(() => window.closeModal?.());
    await delay(100);
  }
}

async function checkMobileInteractions(page, theme, viewportName) {
  await page.click('#sidebar-toggle');
  await delay(150);
  let result = await page.evaluate(() => ({
    open: document.getElementById('sidebar-nav')?.classList.contains('mobile-open'),
    focused: document.activeElement?.id === 'sidebar-search',
  }));
  assert(testName(theme, viewportName, 'menu opens mobile sidebar'), result.open, JSON.stringify(result));
  await page.evaluate(() => window.closeMobileSidebar?.());
  await delay(100);

  const quickMarker = await page.$('.m-dashboard-widgets .dashboard-widget[data-widget-id="quick-markers"] .db-quick-marker-tile');
  assert(testName(theme, viewportName, 'mobile has tappable widget marker'), !!quickMarker);
  if (quickMarker) {
    await quickMarker.click();
    await delay(250);
    result = await page.evaluate(() => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('detail-modal');
      const r = modal.getBoundingClientRect();
      return {
        open: overlay.classList.contains('show'),
        contained: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
      };
    });
    assert(testName(theme, viewportName, 'mobile widget marker opens marker modal'), result.open, JSON.stringify(result));
    assert(testName(theme, viewportName, 'mobile marker modal fits phone viewport'), result.contained, JSON.stringify(result));
    await page.evaluate(() => window.closeModal?.());
    await delay(100);
  }

  for (const tab of ['labs', 'body', 'light', 'insight']) {
    await page.evaluate(() => window.navigate?.('dashboard'));
    await delay(180);
    if (tab === 'light') await seedMobileLightSessions(page);
    await page.click(`.m-tab[data-tab="${tab}"]`);
    await delay(250);
    if (tab === 'light') {
      await page.waitForFunction(
        () => !!document.querySelector('.lens-page-widgets[data-lens-route="light"] .conditions-now-grid'),
        { timeout: 2500 }
      ).catch(() => {});
    }
    result = await page.evaluate((tab) => {
      const active = document.querySelector(`#mobile-bottom-tabs .m-tab[data-tab="${tab}"], .m-tabbar .m-tab[data-tab="${tab}"]`);
      const conditionsGrid = document.querySelector('.lens-page-widgets[data-lens-route="light"] .conditions-now-grid') || document.querySelector('.conditions-now-grid');
      const supportColumns = conditionsGrid
        ? getComputedStyle(conditionsGrid).gridTemplateColumns.split(' ').filter(Boolean).length
        : 0;
      const lightWidgetRoute = document.querySelector('.lens-page-widgets[data-lens-route="light"]');
      const viewportWidth = document.documentElement.clientWidth;
      const sessionWidget = document.querySelector('.dashboard-widget[data-widget-id="light-sessions"]');
      const sessionRows = Array.from(sessionWidget?.querySelectorAll('.sun-session') || []);
      const overflowingSessionRows = sessionRows.filter(row => {
        const rowRect = row.getBoundingClientRect();
        const badChild = Array.from(row.querySelectorAll('*')).some(child => {
          const childRect = child.getBoundingClientRect();
          return childRect.left < -1 || childRect.right > viewportWidth + 1;
        });
        return rowRect.left < -1 || rowRect.right > viewportWidth + 1 || badChild;
      });
      return {
        active: !!active?.classList.contains('active'),
        hasBottomTabs: !!document.querySelector('#mobile-bottom-tabs, .m-shell .m-tabbar'),
        currentView: window._labState?.currentView,
        visibleMain: document.getElementById('main-content')?.textContent?.trim().length > 40,
        lightWidgetRoute: !!lightWidgetRoute,
        lightWidgetCount: lightWidgetRoute?.querySelectorAll('.dashboard-widget[data-widget-id^="light-"]').length || 0,
        lightMoveControls: lightWidgetRoute?.querySelectorAll('.dashboard-widget-tool[aria-label^="Move page section"]').length || 0,
        lightSeparatedOps: !!document.querySelector('.dashboard-widget[data-widget-id="light-conditions-now"] .light-conditions-now-wrap')
          && !!document.querySelector('.dashboard-widget[data-widget-id="light-session-log"] .light-quicklog-row')
          && !!document.querySelector('.dashboard-widget[data-widget-id="light-setup"]'),
        lightDashboardToggles: ['light-conditions-now', 'light-session-log', 'light-channels'].every(id =>
          !!lightWidgetRoute?.querySelector(`.dashboard-widget[data-widget-id="${id}"] .lens-widget-dashboard-toggle`)) &&
          ['light-setup', 'light-guidance', 'light-sessions', 'light-devices', 'light-environment', 'light-tools', 'light-methods'].every(id =>
            !lightWidgetRoute?.querySelector(`.dashboard-widget[data-widget-id="${id}"] .lens-widget-dashboard-toggle`)),
        lightSessionRows: sessionRows.length,
        lightSessionOverflow: overflowingSessionRows.length,
        horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - viewportWidth,
        longDeviceKindWraps: !!sessionWidget?.querySelector('.light-session-device .light-session-kind') &&
          getComputedStyle(sessionWidget.querySelector('.light-session-device .light-session-kind')).whiteSpace !== 'nowrap',
        supportColumns,
      };
    }, tab);
    assert(testName(theme, viewportName, `tab ${tab} navigates and stays active`),
      result.active && result.hasBottomTabs && result.visibleMain,
      JSON.stringify(result));
	    if (tab === 'light') {
		      assert(testName(theme, viewportName, 'light page uses separate mobile operation widgets'),
		        result.lightWidgetRoute && result.lightWidgetCount >= 3 && result.lightMoveControls >= 1 &&
		          result.lightSeparatedOps && result.lightDashboardToggles && result.supportColumns >= 3,
		        JSON.stringify(result));
		      assert(testName(theme, viewportName, 'light sessions fit mobile viewport'),
		        result.lightSessionRows >= 3 && result.lightSessionOverflow === 0 &&
		          result.horizontalOverflow <= 1 && result.longDeviceKindWraps,
		        JSON.stringify(result));
    }
  }
}

async function run() {
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  page.on('pageerror', err => {
    fail++;
    const msg = `PAGE ERROR ${err.message}`;
    failures.push(msg);
    console.error(`  FAIL ${msg}`);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.setBypassServiceWorker(true);
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    }).catch(() => {});

    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        console.log(`\n▶ Theme Responsive E2E ${theme}/${viewport.name}`);
        await prepareScenario(page, theme, viewport);
        const base = await evaluateBaseChecks(page, theme, viewport);
        for (const item of base.failures) {
          assert(testName(theme, viewport.name, item.name), false, item.detail);
        }
        if (base.failures.length === 0) {
          assert(testName(theme, viewport.name, 'base layout/theme checks passed'), true);
        }
        if (viewport.mobile) await checkMobileInteractions(page, theme, viewport.name);
        else await checkDesktopModals(page, theme, viewport.name);
        await captureArtifact(page, theme, viewport.name);
      }
    }

    for (const viewport of BOUNDARY_VIEWPORTS) {
      console.log(`\n▶ Theme Responsive E2E dark/${viewport.name}`);
      await prepareScenario(page, 'dark', viewport);
      const result = await page.evaluate((expectedMobile) => ({
        media: window.matchMedia('(max-width: 799px)').matches,
        mobileShell: document.body.classList.contains('mobile-dashboard-active'),
        bottomTabs: !!document.getElementById('mobile-bottom-tabs'),
        mainText: document.getElementById('main-content')?.textContent?.trim().length || 0,
      }), viewport.mobile);
      assert(testName('dark', viewport.name, 'breakpoint mode is exact'),
        result.media === viewport.mobile,
        JSON.stringify(result));
      assert(testName('dark', viewport.name, 'breakpoint renders usable content'),
        result.mainText > 40 && (viewport.mobile ? result.mobileShell : !result.mobileShell),
        JSON.stringify(result));
    }
  } finally {
    await browser.close();
  }

  console.log(`\nTheme Responsive E2E: ${pass} passed, ${fail} failed`);
  if (fail) {
    console.error('\nFailures:');
    for (const item of failures) console.error(`  - ${item}`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error(`Theme Responsive E2E crashed: ${err.stack || err.message}`);
  process.exit(1);
});
