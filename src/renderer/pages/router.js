// IronLog · Router
// Single-page navigation. Each page registers an onEnter() function.

const Router = (() => {
  const pages = {};
  let current = null;

  function register(name, onEnter) {
    pages[name] = onEnter;
  }

  function go(name) {
    if (current === name) return;

    // Hide all
    document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Show target
    const el = document.getElementById(`page-${name}`);
    if (el) el.classList.remove('hidden');

    const navItem = document.querySelector(`.nav-item[data-page="${name}"]`);
    if (navItem) navItem.classList.add('active');

    current = name;

    if (pages[name]) pages[name]();
  }

  return { register, go };
})();
