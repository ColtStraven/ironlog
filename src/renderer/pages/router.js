// IronLog · Router
// Single-page navigation. Each page registers an onEnter() function.

const Router = (() => {
  const pages = {};
  let current = null;

  function register(name, onEnter) {
    pages[name] = onEnter;
  }

  function go(name) {
    // Hide all pages and deactivate nav
    document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Show target page
    const el = document.getElementById(`page-${name}`);
    if (el) {
      el.classList.remove('hidden');
    } else {
      console.warn(`[Router] No page element found for: page-${name}`);
      return;
    }

    // Activate nav item
    const navItem = document.querySelector(`.nav-item[data-page="${name}"]`);
    if (navItem) navItem.classList.add('active');

    current = name;

    // Always call the page's onEnter so it re-renders fresh
    if (pages[name]) {
      pages[name]();
    } else {
      console.warn(`[Router] No handler registered for: ${name}`);
    }
  }

  function getCurrent() { return current; }

  return { register, go, getCurrent };
})();
