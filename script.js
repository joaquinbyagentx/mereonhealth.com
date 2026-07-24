(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('#primary-nav');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.product-card')];
  const catalogStatus = document.querySelector('#catalog-status');
  const guide = document.querySelector('#routine-guide');
  const guideOverlay = document.querySelector('[data-guide-overlay]');
  const guideLog = document.querySelector('#guide-log');
  const guideChoices = document.querySelector('#guide-choices');
  const guideProgress = [...document.querySelectorAll('.guide-progress span')];
  const year = document.querySelector('#year');

  const goalLabels = {
    metabolic: 'Metabolismo y hábitos',
    longevity: 'Longevidad cotidiana',
    wellness: 'Bienestar diario',
    sleep: 'Sueño y calma',
    recovery: 'Movimiento y recuperación',
    peptides: 'Péptidos y healthy aging'
  };

  const styleLabels = {
    simple: 'Quiero algo sencillo',
    guided: 'Prefiero más estructura',
    flexible: 'Quiero comparar opciones',
    integral: 'Busco una visión completa'
  };

  const state = { step: 'goal', goal: null, style: null };
  let returnFocus = null;

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const closeNav = () => {
    nav?.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.setAttribute('aria-label', 'Abrir navegación');
  };

  const applyFilter = (filter) => {
    const selected = filter.dataset.filter;
    let visibleCount = 0;
    filters.forEach((item) => {
      const active = item === filter;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    cards.forEach((card) => {
      const visible = selected === 'all' || card.dataset.category === selected;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    catalogStatus.textContent = `${visibleCount} ${visibleCount === 1 ? 'programa' : 'programas'}`;
  };

  const addGuideMessage = (text, type = 'guide') => {
    const message = createElement('div', `guide-message guide-message--${type}`, text);
    guideLog.append(message);
    guideLog.scrollTop = guideLog.scrollHeight;
    return message;
  };

  const setProgress = (step) => {
    const active = { goal: 1, style: 2, results: 3 }[step] || 1;
    guideProgress.forEach((item, index) => item.classList.toggle('is-active', index < active));
  };

  const setChoices = (choices) => {
    const fragment = document.createDocumentFragment();
    choices.forEach(({ value, label }) => {
      const button = createElement('button', '', label);
      button.type = 'button';
      button.dataset.choice = value;
      fragment.append(button);
    });
    guideChoices.replaceChildren(fragment);
  };

  const focusFirstChoice = () => requestAnimationFrame(() => guideChoices.querySelector('button')?.focus());

  const askGoal = () => {
    state.step = 'goal';
    setProgress('goal');
    addGuideMessage('¿Qué te gustaría priorizar en este momento?');
    setChoices(Object.entries(goalLabels).map(([value, label]) => ({ value, label })));
    focusFirstChoice();
  };

  const askStyle = () => {
    state.step = 'style';
    setProgress('style');
    addGuideMessage('¿Cómo prefieres construir tu rutina?');
    setChoices(Object.entries(styleLabels).map(([value, label]) => ({ value, label })));
    focusFirstChoice();
  };

  const matchingCards = () => {
    const sameGoal = cards.filter((card) => card.dataset.goals.split(' ').includes(state.goal));
    const sameStyle = sameGoal.filter((card) => card.dataset.styles.split(' ').includes(state.style));
    return (sameStyle.length ? sameStyle : sameGoal).slice(0, 3);
  };

  const showResults = () => {
    state.step = 'results';
    setProgress('results');
    addGuideMessage('Estas rutas pueden ser un buen punto de partida para ti.');
    const results = createElement('div', 'guide-results');
    matchingCards().forEach((card, index) => {
      const result = createElement('article', 'guide-result');
      result.append(createElement('small', '', index === 0 ? 'Mejor coincidencia' : 'También puede interesarte'));
      result.append(createElement('strong', '', card.querySelector('h3').textContent));
      result.append(createElement('p', '', card.querySelector('.product-card__fit').textContent));
      const action = createElement('button', '', 'Ver programa');
      action.type = 'button';
      action.dataset.visitProgram = card.id;
      result.append(action);
      results.append(result);
    });
    guideLog.append(results);
    setChoices([{ value: 'restart', label: 'Empezar de nuevo' }, { value: 'browse', label: 'Ver todos los programas' }]);
    guideLog.scrollTop = guideLog.scrollHeight;
    requestAnimationFrame(() => results.querySelector('button')?.focus());
  };

  const resetGuide = ({ focus = true } = {}) => {
    Object.assign(state, { step: 'goal', goal: null, style: null });
    guideLog.replaceChildren();
    guideChoices.replaceChildren();
    addGuideMessage('Hola. Vamos a encontrar una ruta que encaje con tus prioridades.');
    askGoal();
    if (!focus) document.activeElement?.blur();
  };

  const closeGuide = ({ restore = true } = {}) => {
    if (!guide || guide.hidden) return;
    guide.hidden = true;
    guideOverlay.hidden = true;
    document.body.classList.remove('guide-open');
    if (restore && returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  };

  const openGuide = (trigger) => {
    if (!guide || !guideOverlay) return;
    returnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    closeNav();
    guide.hidden = false;
    guideOverlay.hidden = false;
    document.body.classList.add('guide-open');
    guideLog.replaceChildren();
    guideChoices.replaceChildren();
    addGuideMessage('Hola. Vamos a encontrar una ruta que encaje con tus prioridades.');
    const presetGoal = trigger?.dataset.goal;
    if (presetGoal && goalLabels[presetGoal]) {
      state.goal = presetGoal;
      addGuideMessage(goalLabels[presetGoal], 'user');
      askStyle();
    } else {
      Object.assign(state, { step: 'goal', goal: null, style: null });
      askGoal();
    }
    requestAnimationFrame(() => guide.querySelector('[data-guide-close]')?.focus());
  };

  const visitProgram = (id) => {
    const card = document.getElementById(id);
    if (!card) return;
    const allFilter = filters.find((filter) => filter.dataset.filter === 'all');
    if (allFilter) applyFilter(allFilter);
    closeGuide({ restore: false });
    cards.forEach((item) => item.classList.remove('is-recommended'));
    card.classList.add('is-recommended');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.tabIndex = -1;
    requestAnimationFrame(() => card.focus({ preventScroll: true }));
    window.setTimeout(() => card.classList.remove('is-recommended'), 5000);
  };

  const handleChoice = (button) => {
    const { choice } = button.dataset;
    if (choice === 'restart') {
      resetGuide();
      return;
    }
    if (choice === 'browse') {
      const allFilter = filters.find((filter) => filter.dataset.filter === 'all');
      if (allFilter) applyFilter(allFilter);
      closeGuide({ restore: false });
      document.querySelector('#programas')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    addGuideMessage(button.textContent, 'user');
    if (state.step === 'goal' && goalLabels[choice]) {
      state.goal = choice;
      askStyle();
    } else if (state.step === 'style' && styleLabels[choice]) {
      state.style = choice;
      showResults();
    }
  };

  navToggle?.addEventListener('click', () => {
    const open = navToggle.getAttribute('aria-expanded') !== 'true';
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Cerrar navegación' : 'Abrir navegación');
    nav?.classList.toggle('is-open', open);
  });

  nav?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) closeNav();
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const filter = target.closest('[data-filter]');
    if (filter) {
      applyFilter(filter);
      return;
    }
    const guideOpen = target.closest('[data-guide-open]');
    if (guideOpen) {
      openGuide(guideOpen);
      return;
    }
    if (target.closest('[data-guide-close]')) {
      closeGuide();
      return;
    }
    if (target.closest('[data-guide-reset]')) {
      resetGuide();
      return;
    }
    const choice = target.closest('[data-choice]');
    if (choice) {
      handleChoice(choice);
      return;
    }
    const visit = target.closest('[data-visit-program]');
    if (visit) visitProgram(visit.dataset.visitProgram);
  });

  guideOverlay?.addEventListener('click', () => closeGuide());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (guide && !guide.hidden) closeGuide();
      else closeNav();
      return;
    }
    if (event.key !== 'Tab' || !guide || guide.hidden) return;
    const focusable = [...guide.querySelectorAll('button:not(:disabled), a[href]')].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!guide.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1080) closeNav();
  }, { passive: true });

  if (year) year.textContent = String(new Date().getFullYear());
})();