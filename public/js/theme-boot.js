// Skrip klasik di <head>: pasang data-theme sebelum halaman tergambar (tanpa kedipan terang).
// Logikanya sama dengan resolveTheme di theme.js; pembacaan pilihan dan sistem dipisah try-nya.
(function () {
  var pref = null;
  var dark = false;
  try { pref = localStorage.getItem('pb.theme'); } catch (e) {}
  try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {}
  var theme = pref === 'dark' || (pref !== 'light' && dark) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
