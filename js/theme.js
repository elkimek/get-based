// theme.js — Theme management, chart colors, time format

const VALID_THEMES = ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer'];
const THEME_BAR_COLORS = {
  dark: '#0a0a12',
  light: '#ffffff',
  cyberterm: '#0b0d0b',
  glass: '#0a0817',
  'synth-sunrise': '#0d0524',
  neuromancer: '#050608',
};

export const THEMES = [
  { id: 'dark',          label: 'Modern Minimal' },
  { id: 'light',         label: 'Soft Warm Light' },
  { id: 'cyberterm',     label: 'Cypherpunk Terminal' },
  { id: 'glass',         label: 'Glass / Liquid' },
  { id: 'synth-sunrise', label: 'Synth Sunrise' },
  { id: 'neuromancer',   label: 'Neuromancer' },
];

export function getTimeFormat() { return localStorage.getItem('labcharts-time-format') || '24h'; }
export function setTimeFormat(fmt) { localStorage.setItem('labcharts-time-format', fmt); }

export function formatTime(time24) {
  if (!time24) return '';
  if (getTimeFormat() === '24h') return time24;
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function parseTimeInput(val) {
  if (!val) return '';
  const v = val.trim().toUpperCase();
  // 24h format: "14:30" or "8:00"
  const m24 = v.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]), m = parseInt(m24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  // 12h format: "2:30 PM", "2:30PM", "2PM"
  const m12 = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2] || '0');
    const p = m12[3];
    if (p === 'AM' && h === 12) h = 0;
    else if (p === 'PM' && h !== 12) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return '';
}

export function getTheme() {
  const theme = localStorage.getItem('labcharts-theme') || 'dark';
  return VALID_THEMES.includes(theme) ? theme : 'dark';
}

export function getThemeColor(theme = getTheme()) {
  return THEME_BAR_COLORS[theme] || THEME_BAR_COLORS.dark;
}

export function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) theme = 'dark';
  localStorage.setItem('labcharts-theme', theme);
  if (theme === 'dark') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.content = getThemeColor(theme);
  });
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('labcharts-themechange', { detail: { theme } }));
  }
}

function refreshThemeDependents() {
  window.applyAccentOverride?.();
  window.updateSettingsUI?.();
  window.updateTweaksUI?.();
  if (window.scheduleChartThemeRefresh) window.scheduleChartThemeRefresh();
  else window.refreshChartThemeColors?.({ batchSize: 4 });
  // If the Settings modal is open, the wearables list uses theme-aware
  // iconLight/iconDark assets, so refresh that panel in place.
  if (document.getElementById('settings-modal')?.classList.contains('show')) {
    window.refreshSettingsWearables?.();
  }
}

let toggleThemeFrame = 0;
let toggleThemeTimer = 0;
let toggleReturnTheme = 'dark';
function cancelScheduledThemeCommit() {
  if (toggleThemeFrame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(toggleThemeFrame);
  if (toggleThemeTimer) clearTimeout(toggleThemeTimer);
  toggleThemeFrame = 0;
  toggleThemeTimer = 0;
}
function scheduleThemeCommit(theme) {
  cancelScheduledThemeCommit();
  const commit = () => {
    toggleThemeTimer = 0;
    setTheme(theme);
    refreshThemeDependents();
  };
  if (typeof window.requestAnimationFrame === 'function') {
    toggleThemeFrame = window.requestAnimationFrame(() => {
      toggleThemeFrame = window.requestAnimationFrame(() => {
        toggleThemeFrame = 0;
        commit();
      });
    });
  } else {
    toggleThemeTimer = setTimeout(commit, 0);
  }
}

export function toggleTheme() {
  const current = getTheme();
  cancelScheduledThemeCommit();
  const next = current === 'light' ? (VALID_THEMES.includes(toggleReturnTheme) ? toggleReturnTheme : 'dark') : 'light';
  if (current !== 'light') toggleReturnTheme = current;
  setTheme(next);
  refreshThemeDependents();
}

export function getChartColors() {
  const s = getComputedStyle(document.documentElement);
  const g = v => s.getPropertyValue(v).trim();
  return {
    tooltipBg: g('--bg-card'), tooltipTitle: g('--text-primary'),
    tooltipBody: g('--text-secondary'), tooltipBorder: g('--border'),
    tickColor: g('--text-muted'), gridColor: g('--chart-grid'),
    legendColor: g('--text-secondary'), lineColor: g('--accent'),
    lineFill: g('--accent-fill') || 'color-mix(in srgb, var(--accent) 10%, transparent)',
    canvasTooltipBg: g('--chart-tooltip-bg'), canvasTooltipText: g('--text-primary'),
    chronoLineColor: g('--text-muted'),
    green: g('--green'), red: g('--red'), yellow: g('--yellow'),
  };
}

Object.assign(window, { getTheme, getThemeColor, setTheme, toggleTheme, getTimeFormat, setTimeFormat, formatTime, parseTimeInput, getChartColors, THEMES });
