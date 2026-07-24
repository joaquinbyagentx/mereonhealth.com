(() => {
  'use strict';

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('#primary-nav');
  const year = document.querySelector('#year');

  const closeNav = () => {
    if (!toggle || !nav) return;
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir navegación');
  };

  toggle?.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar navegación' : 'Abrir navegación');
  });

  nav?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) closeNav();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeNav();
  });

  if (year) year.textContent = String(new Date().getFullYear());
})();
