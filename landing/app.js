'use strict';

(function () {
  const STORAGE_KEY = 'jtfLandingTheme';
  const root = document.documentElement;
  const btn = document.getElementById('themeBtn');
  const icon = btn ? btn.querySelector('.theme-btn-icon') : null;

  function setTheme(t) {
    const theme = t === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    if (icon) icon.textContent = theme === 'dark' ? '☾' : '☀';
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }

  function getStored() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (_) {
      return null;
    }
  }

  const stored = getStored();
  if (stored) {
    setTheme(stored);
  } else {
    const prefersLight = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    setTheme(prefersLight ? 'light' : 'dark');
  }

  if (!btn) return;

  btn.addEventListener('click', () => {
    const cur = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setTheme(cur === 'dark' ? 'light' : 'dark');
  });
})();
