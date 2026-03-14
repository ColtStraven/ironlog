// IronLog · App Bootstrap

document.addEventListener('DOMContentLoaded', () => {

  // ── Sidebar nav ───────────────────────────────────
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => Router.go(item.dataset.page));
  });

  // ── Global data-nav delegation ────────────────────
  // Any element with data-nav="pagename" anywhere in the app
  // will navigate to that page when clicked.
  // This replaces all onclick="Router.go('x')" patterns.
  document.body.addEventListener('click', e => {
    const el = e.target.closest('[data-nav]');
    if (el) {
      e.stopPropagation();
      Router.go(el.dataset.nav);
    }
  });

  // ── Boot to dashboard ─────────────────────────────
  HevyPage.boot();
  Router.go('dashboard');
});
