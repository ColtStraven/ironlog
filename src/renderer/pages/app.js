// IronLog · App Bootstrap

document.addEventListener('DOMContentLoaded', () => {

  // ── Nav click handler ─────────────────────────────
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      Router.go(item.dataset.page);
    });
  });

  // ── Boot to dashboard ─────────────────────────────
  Router.go('dashboard');
});
