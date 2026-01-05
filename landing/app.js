'use strict';

// Landing page theme toggle
// - Defaults to system preference
// - Stores choice in localStorage
// - Updates the button icon (moon/sun)
(function () {
  const STORAGE_KEY = 'jtfLandingTheme';
  const root = document.documentElement;

  const btn = document.getElementById('themeBtn');
  if (!btn) return;

  // IMPORTANT: This must match the class in your HTML button
  const icon = btn.querySelector('.theme-btn-icon');

  function applyTheme(t) {
    const theme = t === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    if (icon) icon.textContent = theme === 'dark' ? '☾' : '☀';
  }

  // Update landing screenshot to match current theme
  function syncLandingScreenshot(theme) {
    const img = document.getElementById('jtfThemeShot');
    const cap = document.getElementById('jtfThemeShotCaption');
    if (!img || !cap) return;

    if (theme === 'dark') {
      img.src = 'assets/JTF_R_DM.png';
      img.alt =
        'Records mode using a Newforma Konekt Issues template (dark theme)';
      cap.textContent = 'Records mode using a Newforma Konekt Issues template';
    } else {
      img.src = 'assets/JTF_D_LM.png';
      img.alt = 'Dataset mode showing a large JSON array (light theme)';
      cap.textContent = 'Dataset mode showing a large JSON array';
    }
  }

  function getStoredTheme() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore (private mode / locked down storage)
    }
  }

  function getSystemTheme() {
    const prefersLight =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }

  // Init: stored > system > dark
  const initial = getStoredTheme() || getSystemTheme();
  applyTheme(initial);
  syncLandingScreenshot(initial);

  // Toggle on click + remember
  btn.addEventListener('click', () => {
    const cur = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    syncLandingScreenshot(next);
    storeTheme(next);
  });
})();
