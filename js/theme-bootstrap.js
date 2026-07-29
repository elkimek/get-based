// Apply the persisted theme before stylesheets load to avoid a flash of the
// default theme. This file intentionally remains a classic blocking script.
(() => {
  const themeColors = {
    dark: '#0a0a12',
    light: '#ffffff',
    cyberterm: '#0b0d0b',
    glass: '#0a0817',
    'synth-sunrise': '#0d0524',
    neuromancer: '#050608',
  };
  const valid = ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer'];
  let theme = 'dark';
  let sunsetMode = false;
  try {
    theme = localStorage.getItem('labcharts-theme') || 'dark';
    if (!valid.includes(theme)) theme = 'dark';
    if (valid.includes(theme)) document.documentElement.dataset.theme = theme;
    if (localStorage.getItem('labcharts-sunset-mode') === 'true') {
      sunsetMode = true;
      document.documentElement.dataset.sunsetMode = 'on';
    }
    if (localStorage.getItem('labcharts-crt-effects') === 'true') {
      document.documentElement.dataset.crtEffects = 'on';
    }
  } catch {}
  if (theme === 'dark') delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = !sunsetMode && theme === 'light' ? 'light' : 'dark';
  const themeColor = sunsetMode ? '#120504' : (themeColors[theme] || themeColors.dark);
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    if (meta instanceof HTMLMetaElement) meta.content = themeColor;
  });
})();
