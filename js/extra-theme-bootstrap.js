// Named theme CSS is deferred for the default dark/light modes.
(() => {
  const selectedTheme = document.documentElement.dataset.theme;
  if (!selectedTheme || selectedTheme === 'light') return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'themes-extra.css';
  link.dataset.extraThemesStylesheet = '';
  link.addEventListener('error', () => {
    link.remove();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = 'dark';
    try { localStorage.setItem('labcharts-theme', 'dark'); } catch {}
  }, { once: true });
  const anchor = document.querySelector('[data-extra-themes-stylesheet-anchor]');
  anchor?.parentNode?.insertBefore(link, anchor);
})();
