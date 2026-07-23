(() => {
  'use strict';

  const catalog = [
    {
      id: 'metabolic-integral',
      name: 'Ruta Metabólica Integral',
      category: 'metabolic',
      categoryLabel: 'Pérdida de peso y metabolismo',
      goals: ['metabolic'],
      price: 129,
      styles: ['guided', 'integral'],
      fit: 'Mejor para: ordenar hábitos de alimentación, movimiento y descanso.',
      includes: ['Guía semanal de hábitos', 'Tablero de constancia editable'],
      note: 'No promete pérdida de peso ni resultados clínicos.',
      reason: 'Reúne planificación y seguimiento ilustrativo en una ruta amplia.',
      image: 'assets/images/catalog-metabolic-essentials.webp',
      alt: 'Pouch verde, frasco de cerámica, botella de agua, cuaderno y vegetales sobre piedra clara',
      tag: 'Categoría principal',
      featured: true
    },
    {
      id: 'weight-wellbeing',
      name: 'Peso + Bienestar',
      category: 'metabolic',
      categoryLabel: 'Pérdida de peso y metabolismo',
      goals: ['metabolic', 'wellness'],
      price: 99,
      styles: ['simple', 'guided'],
      fit: 'Mejor para: crear una rutina sostenible alrededor de objetivos de peso y bienestar.',
      includes: ['Planificador flexible de hábitos', 'Biblioteca de bienestar metabólico'],
      note: 'Contenido educativo; sin tratamientos ni resultados garantizados.',
      reason: 'Pone el objetivo de peso dentro de una experiencia general de hábitos.',
      image: 'assets/images/program-metabolic.webp',
      alt: 'Mujer adulta ficticia prepara alimentos coloridos en una cocina luminosa',
      tag: 'Enfoque peso'
    },
    {
      id: 'metabolic-base',
      name: 'Base Metabólica',
      category: 'metabolic',
      categoryLabel: 'Pérdida de peso y metabolismo',
      goals: ['metabolic'],
      price: 79,
      styles: ['simple'],
      fit: 'Mejor para: empezar con pasos simples y fáciles de organizar.',
      includes: ['Lista semanal de hábitos', 'Guía de objetivos cotidianos'],
      reason: 'Ofrece una entrada directa a la categoría metabólica con menor complejidad.',
      image: 'assets/images/catalog-daily-wellness.webp',
      alt: 'Bolsa color apricot, cuaderno, antifaz, taza y esferas de madera sobre piedra clara'
    },
    {
      id: 'longevity-compass',
      name: 'Brújula Longevidad',
      category: 'longevity',
      categoryLabel: 'Anti-aging y longevidad',
      goals: ['longevity'],
      price: 119,
      styles: ['guided', 'integral'],
      fit: 'Mejor para: explorar hábitos de longevidad con criterio y contexto.',
      includes: ['Lecturas editoriales seleccionadas', 'Mapa mensual de prioridades'],
      note: 'No incluye sustancias, protocolos ni promesas anti-aging.',
      reason: 'Organiza aprendizaje y planificación sin convertirlos en indicaciones médicas.',
      image: 'assets/images/catalog-longevity-editorial.webp',
      alt: 'Vaso ámbar, paquete crema, piedra mineral, tela borgoña y romero en una composición abstracta'
    },
    {
      id: 'vital-ritual',
      name: 'Ritual Vital',
      category: 'longevity',
      categoryLabel: 'Anti-aging y longevidad',
      goals: ['longevity', 'wellness'],
      price: 69,
      styles: ['simple', 'flexible'],
      fit: 'Mejor para: conectar descanso, movimiento y constancia diaria.',
      includes: ['Biblioteca de rutinas breves', 'Calendario mensual editable'],
      reason: 'Traduce el interés por longevidad a hábitos generales y no clínicos.',
      image: 'assets/images/program-longevity.webp',
      alt: 'Recipientes abstractos de vidrio azul y transparente sobre una superficie mineral'
    },
    {
      id: 'wellbeing-360',
      name: 'Bienestar 360',
      category: 'wellness',
      categoryLabel: 'Bienestar integral',
      goals: ['wellness'],
      price: 89,
      styles: ['guided', 'flexible'],
      fit: 'Mejor para: equilibrar energía cotidiana, pausas y organización personal.',
      includes: ['Planificador integral de rutina', 'Selección mensual de contenidos'],
      reason: 'Agrupa varias prioridades de bienestar en una sola navegación.',
      image: 'assets/images/program-womens.webp',
      alt: 'Dos mujeres adultas ficticias conversan en una sala cálida y luminosa'
    },
    {
      id: 'daily-base',
      name: 'Base Diaria',
      category: 'wellness',
      categoryLabel: 'Bienestar integral',
      goals: ['wellness', 'metabolic'],
      price: 39,
      styles: ['simple'],
      fit: 'Mejor para: comenzar una rutina de bienestar con presupuesto contenido.',
      includes: ['Planificador semanal', 'Ideas de pausas y movimiento'],
      reason: 'Es la entrada de menor precio y mantiene la experiencia sencilla.',
      image: 'assets/images/program-mens.webp',
      alt: 'Hombre adulto ficticio observa la costa al amanecer'
    },
    {
      id: 'sleep-calm',
      name: 'Sueño + Calma',
      category: 'sleep',
      categoryLabel: 'Sueño y estrés',
      goals: ['sleep', 'wellness'],
      price: 49,
      styles: ['simple'],
      fit: 'Mejor para: diseñar un cierre del día más consistente.',
      includes: ['Audios de relajación demo', 'Ritual nocturno editable'],
      reason: 'Se concentra en una rutina nocturna simple y repetible.',
      image: 'assets/images/discreet-package.webp',
      alt: 'Paquete sencillo sin marca con bolsa crema, papel verde y tarjeta azul en blanco'
    },
    {
      id: 'pause-rhythm',
      name: 'Ritmo sin Estrés',
      category: 'sleep',
      categoryLabel: 'Sueño y estrés',
      goals: ['sleep', 'wellness'],
      price: 59,
      styles: ['guided', 'flexible'],
      fit: 'Mejor para: incorporar pausas y límites a semanas intensas.',
      includes: ['Biblioteca de pausas guiadas', 'Agenda semanal de desconexión'],
      note: 'No sustituye atención de salud mental.',
      reason: 'Añade estructura editorial a pausas, descanso y desconexión.',
      image: 'assets/images/hero-guided-shopping.webp',
      alt: 'Mujer adulta ficticia abre un paquete sencillo en una cocina luminosa'
    },
    {
      id: 'recovery-reset',
      name: 'Recuperación Activa',
      category: 'recovery',
      categoryLabel: 'Recuperación y rendimiento',
      goals: ['recovery'],
      price: 79,
      styles: ['guided'],
      fit: 'Mejor para: ordenar movilidad y recuperación entre semanas activas.',
      includes: ['Sesiones guiadas de movilidad', 'Calendario de recuperación'],
      reason: 'Equilibra movimiento y planificación sin añadir complejidad clínica.',
      image: 'assets/images/catalog-recovery-kit.webp',
      alt: 'Bloque de corcho, banda de ejercicio, botella, toalla y bolsa borgoña sobre piedra clara'
    },
    {
      id: 'daily-movement',
      name: 'Movimiento Diario',
      category: 'recovery',
      categoryLabel: 'Recuperación y rendimiento',
      goals: ['recovery', 'wellness'],
      price: 45,
      styles: ['simple'],
      fit: 'Mejor para: sumar movimiento breve a una rutina cotidiana.',
      includes: ['Rutinas ilustrativas de 10 minutos', 'Biblioteca de movilidad'],
      reason: 'Es una opción accesible centrada en movimiento general.',
      image: 'assets/images/program-recovery.webp',
      alt: 'Hombre adulto ficticio realiza un estiramiento de movilidad en un estudio tranquilo'
    },
    {
      id: 'hair-skin-ritual',
      name: 'Ritual Cabello + Piel',
      category: 'hair',
      categoryLabel: 'Cabello y piel',
      goals: ['hair', 'wellness'],
      price: 59,
      styles: ['simple', 'flexible'],
      fit: 'Mejor para: mantener una rutina estética cotidiana y ordenada.',
      includes: ['Plan mensual editable', 'Guía visual de constancia'],
      note: 'Experiencia de autocuidado; no trata afecciones.',
      reason: 'Propone una rutina visual de autocuidado sin afirmaciones terapéuticas.',
      image: 'assets/images/program-hair-skin.webp',
      alt: 'Mujer adulta ficticia con cabello natural junto a una ventana con luz suave'
    }
  ];

  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const goalLabels = {
    metabolic: 'Pérdida de peso y bienestar metabólico',
    longevity: 'Anti-aging y longevidad',
    wellness: 'Bienestar integral',
    sleep: 'Sueño y manejo del estrés',
    recovery: 'Recuperación y rendimiento',
    hair: 'Cabello y piel'
  };
  const styleLabels = {
    simple: 'Una rutina sencilla',
    guided: 'Más acompañamiento editorial',
    flexible: 'Comparar y tener variedad',
    integral: 'Una experiencia integral'
  };
  const budgetLabels = {
    low: 'Hasta $60 USD',
    mid: 'Hasta $100 USD',
    high: 'Hasta $130 USD'
  };
  const CART_STORAGE_KEY = 'mereon-demo-cart-v1';
  const MAX_QUANTITY = 99;
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const state = { step: 'goal', goal: null, style: null, budget: null, locked: false };
  let cart = Object.create(null);
  let activePanel = null;
  let returnFocus = null;
  let feedbackTimer = 0;
  const addFeedbackTimers = new WeakMap();

  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('#primary-nav');
  const banner = document.querySelector('#demo-banner');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const productGrid = document.querySelector('#product-grid');
  const catalogStatus = document.querySelector('#catalog-status');
  const cartFeedback = document.querySelector('#cart-feedback');
  const cartPanel = document.querySelector('#shopping-cart');
  const cartOverlay = document.querySelector('[data-cart-overlay]');
  const cartItems = document.querySelector('#cart-items');
  const cartSubtotal = document.querySelector('#cart-subtotal');
  const cartCheckout = document.querySelector('#cart-checkout');
  const cartWhatsappStatus = document.querySelector('#cart-whatsapp-status');
  const agent = document.querySelector('#sales-agent');
  const agentOverlay = document.querySelector('[data-agent-overlay]');
  const agentLog = document.querySelector('#agent-log');
  const quickReplies = document.querySelector('#agent-quick');
  const agentInput = document.querySelector('#agent-input');
  const agentSend = document.querySelector('#agent-send');

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const formatMoney = (amount) => `${currency.format(amount)} USD`;
  const normalize = (value) => value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9$@.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const emergencyPattern = /\b(emergencia|urgencia|crisis suicida|suicid\w*|matarme|me voy a matar|quiero morir|no quiero vivir|quitar(?:me)? la vida|acabar con mi vida|terminar con mi vida|hacerme dano|quiero hacerme dano|me quiero hacer dano|lastimarme|autolesion\w*|no puedo respirar|dificultad para respirar|me falta el aire|me ahogo|dolor (en el )?pecho|infarto|ataque (al )?corazon|ataque cardiaco|paro cardiaco|derrame( cerebral)?|ictus|no siento un lado|se me cayo un lado de la cara|cara caida|no puedo hablar|debilidad de un lado|sobredosis|overdose|todas las pastillas|pastillas de mas|demasiad[oa]s? (?:pastillas|medicamentos|medicinas)|(?:me )?(?:tome|trague|ingeri|bebi|consumi) (?:(?:demasiad[oa]s?|much[oa]s?|varios|varias) )?(?:pastillas|medicamentos|medicinas|cloro|lejia|veneno|quimicos?)|intoxicacion|intoxicad[oa]|me intoxique|envenenamiento|envenenad[oa]|me envenene|anafilaxia|sangrado abundante|me desmay\w*|convulsion\w*|inconsciente)\b/i;
  const medicalPattern = /\b(diagnostico|diagnosticaron|enfermedad|condicion medica|sintoma|migran\w*|diabetes|cancer|asma|embaraz\w*|alerg\w*|presion arterial|colesterol|lesion|dolor|medicamento|medicacion|medicina|receta|dosis|protocolo medico|tratamiento|elegible|contraindicacion|efecto secundario|debo (usar|tomar)|deberia (usar|tomar))\b/i;
  const contactPattern = /(?:\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)|(?:\+?\d[\d\s().-]{7,}\d)/i;
  const identityPattern = /(?:\b(me llamo|mi nombre|vivo en|mi direccion|direccion es|calle|avenida|codigo postal|telegram|whatsapp|instagram|facebook|tiktok)\b)|@\w+/i;
  const poisoningStatePattern = /\b(sobredosis|overdose|intoxic\w*|envenen\w*)\b/i;
  const ingestionVerbPattern = /\b(tom\w*|inger\w*|ingir\w*|trag\w*|beb\w*|consum\w*|com(?:i|er|io|e|emos|en|iendo|ido)\w*)\b/i;
  const toxicSubstancePattern = /\b(cloro|lejia|lavandin\w*|venen\w*|toxic\w*|corrosiv\w*|caustic\w*|sosa|acido\w*|sustancias? (?:toxic\w*|venenos\w*|peligros\w*)|productos? (?:quimic\w*|de limpieza)|liquidos? de limpieza|quimic\w*|detergent\w*|amoniac\w*|limpiador\w*|desengrasante\w*|pesticid\w*|insecticid\w*|herbicid\w*|fungicid\w*|raticid\w*|rodenticid\w*|anticongelante\w*|solvente\w*|disolvente\w*|aguarras|gasolina|combustible|desinfectante\w*|metanol|alcohol (?:isopropilico|de quemar)|acetona|quitaesmalte\w*|cianuro|arsenico|mercurio|jabon\w*|champu\w*)\b/i;
  const medicationObjectPattern = /\b(pastill\w*|medicament\w*|medicin\w*|capsul\w*|remedi\w*|farmac\w*|dosis|jarabe\w*|gotas|ampolla\w*)\b/i;
  const overdoseContainerPattern = /\b(?:(?:un|una|el|la) )?(?:frasco|bote|botella|caja|paquete|blister)(?: entero| entera| completo| completa)?\b/i;
  const overdoseSignalPattern = /\b(\d{1,4}|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|treinta|cuarenta|cincuenta|cien|docena\w*|demasiad\w*|much\w*|tod\w*|varios?|varias?|mas|exceso|extra|doble|triple|de golpe|de mas)\b/i;
  const personalHealthMetricPattern = /(?:\b(?:mi|mis|tengo|mido|peso)\b(?:\s+[a-z]+){0,3}\s+\d{1,4}\b)|(?:\b\d{1,4}\s*(?:anos?|kg|kilos?|libras?|lb|cm|metros?)\b)/i;
  const safeVocabulary = {
    goal: new Set('quiero busco me interesa priorizo necesito explorar ver conocer mejorar apoyar bajar aumentar sentirme mejor enfocarme opciones opcion algo para de del en el la los las con y una un sobre bienestar metabolico metabolismo peso perdida alimentacion nutricion habitos longevidad anti aging envejecer energia recuperacion recuperarme recuperar rendimiento ejercicio entrenamiento movilidad movimiento deporte cabello pelo piel sueno estres calma descanso dormir manejo diario diaria rutina'.split(' ')),
    style: new Set('quiero busco prefiero me interesa una un algo mas con de y facil sencilla sencillo simple basica basico rapida rapido guiada guiado acompanamiento seguimiento editorial ayuda comparar tener variedad flexible opciones opcion integral'.split(' ')),
    budget: new Set('hasta menos mas de presupuesto mensual bajo baja medio media intermedio intermedia alto alta economico economica barato barata sin tope definido premium completo completa usd'.split(' '))
  };

  const isAllowedStepText = (text, step) => {
    const words = text.match(/[a-z0-9$]+/g) || [];
    if (!words.length || words.length > 14 || !safeVocabulary[step]) return false;
    return words.every((word) => safeVocabulary[step].has(word) || /^\$?\d{1,4}$/.test(word));
  };

  const isEmergencyText = (text) => {
    if (emergencyPattern.test(text) || poisoningStatePattern.test(text)) return true;
    if (!ingestionVerbPattern.test(text)) return false;
    if (toxicSubstancePattern.test(text) || overdoseContainerPattern.test(text)) return true;
    return medicationObjectPattern.test(text) && overdoseSignalPattern.test(text);
  };

  const setBannerHeight = () => {
    if (banner) document.documentElement.style.setProperty('--banner-height', `${Math.ceil(banner.getBoundingClientRect().height)}px`);
  };

  const buildProductCard = (item) => {
    const card = createElement('article', `product-card${item.featured ? ' product-card--featured' : ''}`);
    card.id = `product-${item.id}`;
    card.dataset.category = item.category;
    card.dataset.product = item.id;

    const media = createElement('div', 'product-card__media');
    const image = createElement('img');
    image.src = item.image;
    image.width = 1024;
    image.height = item.image.includes('catalog-') ? 1024 : 576;
    image.loading = 'lazy';
    image.alt = item.alt;
    media.append(image);
    if (item.tag) media.append(createElement('span', 'product-card__tag', item.tag));

    const body = createElement('div', 'product-card__body');
    body.append(createElement('p', 'product-card__category', item.categoryLabel));
    body.append(createElement('h3', '', item.name));
    body.append(createElement('p', 'product-card__fit', item.fit));
    const list = createElement('ul');
    item.includes.forEach((include) => list.append(createElement('li', '', include)));
    body.append(list);
    if (item.note) body.append(createElement('p', 'product-card__note', item.note));

    const footer = createElement('div', 'product-card__footer');
    const price = createElement('p');
    price.append(createElement('span', '', 'Precio demo'));
    const amount = createElement('strong', '', currency.format(item.price));
    amount.append(createElement('small', '', ' USD'));
    price.append(amount);
    const add = createElement('button', '', 'Añadir al carrito');
    add.type = 'button';
    add.dataset.addProduct = item.id;
    add.setAttribute('aria-label', `Añadir ${item.name} al carrito por ${formatMoney(item.price)}`);
    footer.append(price, add);
    body.append(footer);
    card.append(media, body);
    return card;
  };

  const renderCatalog = () => {
    const fragment = document.createDocumentFragment();
    catalog.forEach((item) => fragment.append(buildProductCard(item)));
    productGrid.replaceChildren(fragment);
  };

  const loadCart = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return;
      saved.forEach((entry) => {
        if (!entry || !catalogById.has(entry.id)) return;
        const quantity = Number(entry.quantity);
        if (Number.isInteger(quantity) && quantity > 0) cart[entry.id] = Math.min(quantity, MAX_QUANTITY);
      });
    } catch {
      cart = Object.create(null);
    }
  };

  const saveCart = () => {
    const compact = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // The cart remains usable for this page view when storage is unavailable.
    }
  };

  const cartEntries = () => Object.entries(cart)
    .map(([id, quantity]) => ({ item: catalogById.get(id), quantity }))
    .filter(({ item, quantity }) => item && quantity > 0);
  const cartCount = () => cartEntries().reduce((total, entry) => total + entry.quantity, 0);
  const cartTotal = () => cartEntries().reduce((total, { item, quantity }) => total + item.price * quantity, 0);

  const getWhatsappNumber = () => String(document.body.dataset.whatsappNumber || '').trim();
  const hasValidWhatsappNumber = () => /^\d{8,15}$/.test(getWhatsappNumber()) && !getWhatsappNumber().startsWith('0');

  const syncWhatsappState = () => {
    const count = cartCount();
    const configured = hasValidWhatsappNumber();
    cartCheckout.disabled = count === 0;
    cartCheckout.textContent = count === 0 ? 'Añade un programa' : configured ? 'Preparar pedido en WhatsApp' : 'WhatsApp próximamente';
    cartWhatsappStatus.textContent = configured
      ? 'Se preparará un mensaje con esta selección demo. No incluye pago ni datos médicos.'
      : 'Número pendiente de configurar. Puedes seguir revisando tu carrito.';
  };

  const updateCartBadges = () => {
    const count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach((badge) => {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
    document.querySelectorAll('[data-cart-open]').forEach((button) => {
      button.setAttribute('aria-label', `Abrir carrito, ${count} ${count === 1 ? 'artículo' : 'artículos'}`);
    });
  };

  const createQuantityButton = (item, action, label, text, disabled = false) => {
    const button = createElement('button', 'cart-item__quantity-button', text);
    button.type = 'button';
    button.dataset.cartAction = action;
    button.dataset.productId = item.id;
    button.setAttribute('aria-label', `${label} ${item.name}`);
    button.disabled = disabled;
    return button;
  };

  const renderCart = () => {
    const entries = cartEntries();
    if (!entries.length) {
      const empty = createElement('div', 'cart-empty');
      empty.append(createElement('span', 'cart-empty__mark', 'M'));
      empty.append(createElement('h3', '', 'Tu carrito está listo para empezar.'));
      empty.append(createElement('p', '', 'Añade programas del catálogo para comparar tu selección y total demo.'));
      const action = createElement('button', '', 'Explorar catálogo');
      action.type = 'button';
      action.dataset.cartClose = '';
      empty.append(action);
      cartItems.replaceChildren(empty);
    } else {
      const fragment = document.createDocumentFragment();
      entries.forEach(({ item, quantity }) => {
        const row = createElement('article', 'cart-item');
        row.dataset.cartProduct = item.id;
        const image = createElement('img');
        image.src = item.image;
        image.alt = '';
        image.width = 84;
        image.height = 84;
        const details = createElement('div', 'cart-item__details');
        details.append(createElement('p', 'cart-item__category', item.categoryLabel));
        details.append(createElement('h3', '', item.name));
        details.append(createElement('p', 'cart-item__unit', `${formatMoney(item.price)} cada uno`));
        const controls = createElement('div', 'cart-item__controls');
        controls.append(createQuantityButton(item, 'decrease', 'Reducir cantidad de', '−'));
        const value = createElement('span', 'cart-item__quantity', String(quantity));
        value.setAttribute('aria-label', `Cantidad ${quantity}`);
        controls.append(value);
        controls.append(createQuantityButton(item, 'increase', 'Aumentar cantidad de', '+', quantity >= MAX_QUANTITY));
        const remove = createElement('button', 'cart-item__remove', 'Quitar');
        remove.type = 'button';
        remove.dataset.cartAction = 'remove';
        remove.dataset.productId = item.id;
        remove.setAttribute('aria-label', `Quitar ${item.name} del carrito`);
        controls.append(remove);
        details.append(controls);
        row.append(image, details, createElement('strong', 'cart-item__line-total', formatMoney(item.price * quantity)));
        fragment.append(row);
      });
      cartItems.replaceChildren(fragment);
    }
    cartSubtotal.textContent = formatMoney(cartTotal());
    updateCartBadges();
    syncWhatsappState();
  };

  const announceCart = (message) => {
    window.clearTimeout(feedbackTimer);
    cartFeedback.textContent = message;
    feedbackTimer = window.setTimeout(() => { cartFeedback.textContent = ''; }, 3500);
  };

  const setCartQuantity = (id, quantity) => {
    if (!catalogById.has(id)) return;
    const next = Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(quantity)));
    if (next === 0) delete cart[id];
    else cart[id] = next;
    saveCart();
    renderCart();
  };

  const addToCart = (id, trigger) => {
    const item = catalogById.get(id);
    if (!item) return;
    setCartQuantity(id, (cart[id] || 0) + 1);
    announceCart(`${item.name} se añadió al carrito. ${cartCount()} ${cartCount() === 1 ? 'artículo' : 'artículos'} en total.`);
    if (trigger) {
      const original = trigger.dataset.defaultLabel || trigger.textContent;
      trigger.dataset.defaultLabel = original;
      window.clearTimeout(addFeedbackTimers.get(trigger));
      trigger.textContent = 'Añadido ✓';
      trigger.classList.add('is-added');
      const timer = window.setTimeout(() => {
        if (document.contains(trigger)) {
          trigger.textContent = original;
          trigger.classList.remove('is-added');
        }
        addFeedbackTimers.delete(trigger);
      }, 1400);
      addFeedbackTimers.set(trigger, timer);
    }
  };

  const buildWhatsappMessage = () => {
    const lines = ['Hola, quiero revisar esta selección demo de Mereon:', ''];
    cartEntries().forEach(({ item, quantity }) => {
      lines.push(`• ${item.name} — ${quantity} × ${formatMoney(item.price)} = ${formatMoney(item.price * quantity)}`);
    });
    lines.push('', `Subtotal / total demo: ${formatMoney(cartTotal())}`);
    lines.push('', 'Nota: concepto de demostración; no es una compra, no procesa pago y no sustituye orientación profesional.');
    return lines.join('\n');
  };

  const checkoutWhatsapp = () => {
    if (!cartCount()) return;
    const number = getWhatsappNumber();
    if (!hasValidWhatsappNumber()) {
      cartWhatsappStatus.textContent = 'WhatsApp próximamente: número pendiente de configurar. Tu carrito sigue disponible para revisión.';
      cartWhatsappStatus.focus?.();
      return;
    }
    const url = `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsappMessage())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const addMessage = (text, type = 'bot') => {
    const message = createElement('div', `agent-message${type === 'bot' ? '' : ` agent-message--${type}`}`, text);
    agentLog.append(message);
    agentLog.scrollTop = agentLog.scrollHeight;
    return message;
  };

  const setQuickReplies = (choices) => {
    const fragment = document.createDocumentFragment();
    choices.forEach(({ label, value }) => {
      const button = createElement('button', '', label);
      button.type = 'button';
      button.dataset.choice = value;
      fragment.append(button);
    });
    quickReplies.replaceChildren(fragment);
  };

  const focusCurrentStep = () => requestAnimationFrame(() => {
    if (agent.hidden) return;
    const target = state.step === 'results' ? agentLog.querySelector('.agent-result button') : quickReplies.querySelector('button');
    (target || agentInput)?.focus();
  });

  const goalChoices = () => Object.entries(goalLabels).map(([value, label]) => ({ value, label }));
  const styleChoices = () => [
    { value: 'simple', label: styleLabels.simple },
    { value: 'guided', label: styleLabels.guided },
    { value: 'flexible', label: styleLabels.flexible }
  ];
  const budgetChoices = () => Object.entries(budgetLabels).map(([value, label]) => ({ value, label }));

  const askGoal = () => {
    state.step = 'goal';
    addMessage('¿Qué te gustaría priorizar en tu rutina de bienestar?');
    setQuickReplies(goalChoices());
  };
  const askStyle = () => {
    state.step = 'style';
    addMessage('Perfecto. ¿Qué tipo de experiencia prefieres?');
    setQuickReplies(styleChoices());
  };
  const askBudget = () => {
    state.step = 'budget';
    addMessage('Última pregunta: ¿qué presupuesto ilustrativo quieres explorar?');
    setQuickReplies(budgetChoices());
  };

  const resetAgent = ({ announce = true } = {}) => {
    Object.assign(state, { step: 'goal', goal: null, style: null, budget: null, locked: false });
    agentLog.replaceChildren();
    quickReplies.replaceChildren();
    agentInput.value = '';
    agentInput.disabled = false;
    agentSend.disabled = false;
    if (announce) {
      addMessage('Hola. Soy el asesor demo de Mereon. Te ayudaré a comparar el catálogo con tres preguntas no sensibles.');
      askGoal();
    }
  };

  const budgetMax = (budget) => ({ low: 60, mid: 100, high: 130 }[budget]);
  const getRecommendations = () => {
    const max = budgetMax(state.budget);
    const goalCandidates = catalog.filter((item) => item.goals.includes(state.goal));
    const withinBudget = goalCandidates.filter((item) => item.price <= max);
    const candidates = withinBudget.length ? withinBudget : goalCandidates;
    return candidates
      .map((item) => ({ ...item, score: (item.goals[0] === state.goal ? 5 : 2) + (item.styles.includes(state.style) ? 4 : 0) - (item.price > max ? 3 : 0) }))
      .sort((a, b) => b.score - a.score || a.price - b.price)
      .slice(0, 3);
  };

  const showRecommendations = () => {
    state.step = 'results';
    const recommendations = getRecommendations();
    const exceedsBudget = recommendations.length > 0 && recommendations.every((item) => item.price > budgetMax(state.budget));
    addMessage(exceedsBudget
      ? `No hay opciones de ${goalLabels[state.goal].toLocaleLowerCase('es')} dentro de ese rango demo. Muestro ${recommendations.length === 1 ? 'la alternativa más cercana' : 'las alternativas más cercanas'} para comparar; superan el presupuesto elegido.`
      : `Estas son ${recommendations.length === 1 ? 'la opción que mejor coincide' : 'las opciones que mejor coinciden'} con ${goalLabels[state.goal].toLocaleLowerCase('es')}, ${styleLabels[state.style].toLocaleLowerCase('es')} y tu rango demo.`);
    const results = createElement('div', 'agent-results');
    recommendations.forEach((item, index) => {
      const card = createElement('article', 'agent-result');
      card.append(createElement('small', '', index === 0 ? 'Mejor coincidencia' : 'También considera'));
      card.append(createElement('strong', '', item.name));
      card.append(createElement('span', 'agent-result__price', formatMoney(item.price)));
      card.append(createElement('p', '', item.reason));
      const action = createElement('button', '', 'Ver opción recomendada');
      action.type = 'button';
      action.dataset.visitProduct = item.id;
      card.append(action);
      results.append(card);
    });
    agentLog.append(results);
    agentLog.scrollTop = agentLog.scrollHeight;
    setQuickReplies([{ value: 'browse', label: 'Explorar catálogo' }, { value: 'restart', label: 'Empezar de nuevo' }]);
  };

  const handleChoice = (value, label) => {
    if (state.locked) return;
    if (value === 'browse') {
      closeAgent(false);
      document.querySelector('#catalogo')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (value === 'restart') {
      resetAgent();
      return;
    }
    addMessage(label, 'user');
    if (state.step === 'goal' && goalLabels[value]) {
      state.goal = value;
      askStyle();
    } else if (state.step === 'style' && styleLabels[value]) {
      state.style = value;
      askBudget();
    } else if (state.step === 'budget' && budgetLabels[value]) {
      state.budget = value;
      showRecommendations();
    }
  };

  const parseGoal = (text) => {
    const rules = [
      ['metabolic', /(metabol|\bpeso\b|aliment|nutric|habito)/],
      ['longevity', /(longevid|anti aging|\bedad\b|envej|energia)/],
      ['sleep', /(\bsueno\b|estres|calma|descanso|dormir)/],
      ['recovery', /(recuper|rendimiento|ejercicio|entren|movilidad|deporte)/],
      ['hair', /\b(cabello|pelo|piel|skin|hair)\b/],
      ['wellness', /\b(bienestar|diario|diaria|rutina)\b/]
    ];
    return rules.find(([, pattern]) => pattern.test(text))?.[0] || null;
  };
  const parseStyle = (text) => {
    if (/(\bsimple\b|sencill|facil|basico|rapido)/.test(text)) return 'simple';
    if (/(guiad|acompan|seguimiento|editorial|\bayuda\b)/.test(text)) return 'guided';
    if (/(compar|variedad|flexible|opciones|integral)/.test(text)) return 'flexible';
    return null;
  };
  const parseBudget = (text) => {
    const amountMatch = text.match(/\d{1,4}/);
    if (amountMatch) {
      const amount = Number(amountMatch[0]) + (/\bmas de\b/.test(text) ? 1 : 0);
      return amount <= 60 ? 'low' : amount <= 100 ? 'mid' : 'high';
    }
    if (/\b(barat|econom|bajo|menos|hasta)\b/.test(text)) return 'low';
    if (/\b(medio|intermedio)\b/.test(text)) return 'mid';
    if (/\b(alto|premium|completo|mas de|más de)\b/.test(text)) return 'high';
    return null;
  };

  const stopForEmergency = () => {
    state.locked = true;
    state.step = 'emergency';
    quickReplies.replaceChildren();
    agentInput.value = '';
    agentInput.disabled = true;
    agentSend.disabled = true;
    const message = addMessage('Parece que podrías necesitar ayuda inmediata. Voy a detener la orientación comercial. Contacta ahora a los servicios de emergencia de tu localidad o acude al centro de urgencias más cercano. Si estás en peligro inmediato, no esperes una respuesta en línea.', 'emergency');
    message.setAttribute('role', 'alert');
    message.tabIndex = -1;
    message.focus();
  };

  const handleText = () => {
    const raw = agentInput.value.trim();
    if (!raw || state.locked) return;
    agentInput.value = '';
    const text = normalize(raw);
    if (isEmergencyText(text)) {
      stopForEmergency();
      return;
    }
    if (contactPattern.test(raw) || identityPattern.test(text)) {
      addMessage('No puedo aceptar datos de contacto. No guardaré ni repetiré lo escrito. Responde solo con una opción general de los botones.', 'boundary');
      return;
    }
    if (personalHealthMetricPattern.test(text) || (state.step !== 'budget' && /\d/.test(text))) {
      addMessage('No puedo aceptar medidas personales, edad ni otros datos de salud. No guardaré ni repetiré lo escrito; elige una categoría general con los botones.', 'boundary');
      return;
    }
    if (medicalPattern.test(text) || medicationObjectPattern.test(text)) {
      addMessage('Esa pregunta requiere a un profesional autorizado. Yo no evalúo diagnósticos, elegibilidad, medicamentos, dosis ni tratamientos. Puedo seguir ayudándote únicamente a navegar categorías y programas demo.', 'boundary');
      return;
    }
    if (state.step === 'results') {
      addMessage('Ya preparé tus coincidencias. Puedes visitar una opción, explorar el catálogo o reiniciar para cambiar criterios.');
      return;
    }
    if (!isAllowedStepText(text, state.step)) {
      addMessage('Solo puedo procesar frases generales sobre objetivo, preferencia o presupuesto. No usaré ni repetiré otros datos; elige uno de los botones para continuar.', 'boundary');
      return;
    }
    const parsed = state.step === 'goal' ? parseGoal(text) : state.step === 'style' ? parseStyle(text) : parseBudget(text);
    if (!parsed) {
      addMessage('No estoy seguro de cómo clasificar esa respuesta y no repetiré el texto. Elige una opción general para mantener la recomendación clara y no compartas datos personales o médicos.');
      return;
    }
    const label = state.step === 'goal' ? goalLabels[parsed] : state.step === 'style' ? styleLabels[parsed] : budgetLabels[parsed];
    handleChoice(parsed, label);
    focusCurrentStep();
  };

  const setPanelState = (panel, overlay, open) => {
    panel.hidden = !open;
    overlay.hidden = !open;
    document.body.classList.toggle('panel-open', open);
    activePanel = open ? panel : null;
  };

  const restorePanelFocus = () => {
    if (returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  };

  const closeCart = (restore = true) => {
    if (cartPanel.hidden) return;
    setPanelState(cartPanel, cartOverlay, false);
    if (restore) restorePanelFocus();
  };
  const openCart = (trigger) => {
    if (!agent.hidden) closeAgent(false);
    returnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    renderCart();
    setPanelState(cartPanel, cartOverlay, true);
    requestAnimationFrame(() => cartPanel.querySelector('[data-cart-close]')?.focus());
  };
  const closeAgent = (restore = true) => {
    if (agent.hidden) return;
    setPanelState(agent, agentOverlay, false);
    resetAgent({ announce: false });
    if (restore) restorePanelFocus();
  };
  const openAgent = (trigger) => {
    if (!cartPanel.hidden) closeCart(false);
    returnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    resetAgent({ announce: false });
    setPanelState(agent, agentOverlay, true);
    const presetGoal = trigger?.dataset.goal;
    const productName = trigger?.dataset.productName;
    addMessage('Hola. Soy el asesor demo de Mereon. Comparo opciones sin pedir datos personales o médicos.');
    if (presetGoal && goalLabels[presetGoal]) {
      state.goal = presetGoal;
      addMessage(productName ? `Veo que estás explorando ${productName}. Usaré ${goalLabels[presetGoal].toLocaleLowerCase('es')} como punto de partida.` : `Empecemos por ${goalLabels[presetGoal].toLocaleLowerCase('es')}.`);
      askStyle();
    } else {
      askGoal();
    }
    requestAnimationFrame(() => agent.querySelector('[data-agent-close]')?.focus());
  };

  const visitProduct = (id) => {
    const card = document.querySelector(`#product-${CSS.escape(id)}`);
    closeAgent(false);
    const allFilter = filters.find((filter) => filter.dataset.filter === 'all');
    if (allFilter) applyFilter(allFilter);
    document.querySelectorAll('.product-card').forEach((item) => item.classList.remove('is-recommended'));
    card?.classList.add('is-recommended');
    card?.scrollIntoView({ block: 'center' });
    if (card) {
      card.tabIndex = -1;
      requestAnimationFrame(() => card.focus({ preventScroll: true }));
    }
    window.setTimeout(() => card?.classList.remove('is-recommended'), 5000);
  };

  const applyFilter = (filter) => {
    const selected = filter.dataset.filter;
    let count = 0;
    filters.forEach((item) => {
      const active = item === filter;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.product-card').forEach((card) => {
      const visible = selected === 'all' || card.dataset.category === selected;
      card.hidden = !visible;
      if (visible) count += 1;
    });
    catalogStatus.textContent = `${count} ${count === 1 ? 'opción demo' : 'opciones demo'}`;
  };

  navToggle?.addEventListener('click', () => {
    const open = navToggle.getAttribute('aria-expanded') !== 'true';
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Cerrar navegación' : 'Abrir navegación');
    nav?.classList.toggle('is-open', open);
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.setAttribute('aria-label', 'Abrir navegación');
  }));

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const filter = target.closest('[data-filter]');
    if (filter) {
      applyFilter(filter);
      return;
    }
    const add = target.closest('[data-add-product]');
    if (add) {
      addToCart(add.dataset.addProduct, add);
      return;
    }
    const cartAction = target.closest('[data-cart-action]');
    if (cartAction) {
      const id = cartAction.dataset.productId;
      const quantity = cart[id] || 0;
      if (cartAction.dataset.cartAction === 'increase') setCartQuantity(id, quantity + 1);
      if (cartAction.dataset.cartAction === 'decrease') setCartQuantity(id, quantity - 1);
      if (cartAction.dataset.cartAction === 'remove') setCartQuantity(id, 0);
      requestAnimationFrame(() => {
        const next = cartPanel.querySelector(`[data-product-id="${CSS.escape(id)}"][data-cart-action="${cartAction.dataset.cartAction}"]`);
        (next || cartPanel.querySelector('[data-cart-close]'))?.focus();
      });
      return;
    }
    const cartOpen = target.closest('[data-cart-open]');
    if (cartOpen) {
      openCart(cartOpen);
      return;
    }
    if (target.closest('[data-cart-close]')) {
      closeCart();
      return;
    }
    const agentOpen = target.closest('[data-agent-open]');
    if (agentOpen) {
      openAgent(agentOpen);
      return;
    }
    if (target.closest('[data-agent-close]')) {
      closeAgent();
      return;
    }
    if (target.closest('[data-agent-reset]')) {
      resetAgent();
      focusCurrentStep();
      return;
    }
    const choice = target.closest('[data-choice]');
    if (choice) {
      handleChoice(choice.dataset.choice, choice.textContent);
      focusCurrentStep();
      return;
    }
    const visit = target.closest('[data-visit-product]');
    if (visit) visitProduct(visit.dataset.visitProduct);
  });

  cartOverlay?.addEventListener('click', () => closeCart());
  agentOverlay?.addEventListener('click', () => closeAgent());
  cartCheckout?.addEventListener('click', checkoutWhatsapp);
  agentSend?.addEventListener('click', handleText);
  agentInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleText();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!activePanel || activePanel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      activePanel === cartPanel ? closeCart() : closeAgent();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...activePanel.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!activePanel.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== CART_STORAGE_KEY) return;
    cart = Object.create(null);
    loadCart();
    renderCart();
  });

  renderCatalog();
  loadCart();
  renderCart();
  if ('ResizeObserver' in window && banner) new ResizeObserver(setBannerHeight).observe(banner);
  else window.addEventListener('resize', setBannerHeight, { passive: true });
  setBannerHeight();
})();
