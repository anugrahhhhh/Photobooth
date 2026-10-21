// Skrip klasik di <head>: pasang data-theme sebelum halaman tergambar (tanpa kedipan terang).
// Logikanya sama dengan resolveTheme di theme.js.
(function () {
  var theme = 'light';
  try {
    var pref = localStorage.getItem('pb.theme');
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = pref === 'dark' || (pref !== 'light' && dark) ? 'dark' : 'light';
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
})();
