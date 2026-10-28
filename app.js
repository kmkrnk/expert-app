(function () {
  'use strict';

  var C = window.EXPERT;
  var BASE = window.EXPERT_BASE;
  var tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  var state = { tab: 'home', topic: 'all' };

  // ---------- Иконки ----------
  var ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
    bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    gift: '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C9 7 7.5 3.5 10 3.5S12 7 12 7zm0 0c3 0 4.5-3.5 2-3.5S12 7 12 7z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    send: '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m10 13 4-4"/>',
    arrow: '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    vk: '<path d="M4 7h3c.5 4 2.5 6 4 6.5V7h3v3.5c1.5-.3 3-2 3.5-3.5H20c-.5 2.5-2.5 4.5-4 5.3 1.6.7 3.5 2.6 4.2 4.7h-3c-.6-1.6-2-3-3.2-3.2V18h-.5C7.5 18 4.4 13.5 4 7z"/>',
    max: '<circle cx="12" cy="12" r="8.5"/><path d="M8 15.5V9l4 4 4-4v6.5"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || '') + '</svg>';
  }

  // ---------- Утилиты ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function img(src) { return src && !/^https?:/.test(src) ? BASE + src : src; }
  function money(n) { return n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function haptic(type) { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type || 'light'); }
  function product(id) { return C.products.filter(function (p) { return p.id === id; })[0]; }
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  function openLink(url) {
    if (!url) return;
    if (tg && /^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
    else if (tg) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  }

  function toast(text) {
    var t = $('#toast');
    t.textContent = text;
    t.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('is-on'); }, 2200);
  }

  // ---------- Тема и Telegram ----------
  function applyTheme() {
    var root = document.documentElement.style;
    Object.keys(C.theme || {}).forEach(function (k) { root.setProperty('--' + k, C.theme[k]); });
    document.title = C.profile.name;
    if (tg) {
      tg.ready();
      tg.expand();
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); } catch (e) { /* старые клиенты */ }
    }
  }

  // ---------- Блоки ----------
  function postCard(p, row) {
    var topic = C.topics.filter(function (t) { return t.id === p.topic; })[0];
    // Без картинки: в списке — маленькая иконка, в большой карточке — только текст
    var cover = p.img
      ? '<img class="post__img" src="' + esc(img(p.img)) + '" alt="" loading="lazy">'
      : row ? '<div class="post__img post__ph">' + icon(p.video ? 'video' : 'leaf') + '</div>' : '';
    return '<a class="card post' + (row ? ' post--row' : '') + '" href="' + esc(p.url) + '" data-link="' + esc(p.url) + '">' +
      cover +
      '<div class="post__body">' +
        '<div class="post__meta">' + (topic ? '<span class="post__pill">' + esc(topic.name) + '</span>' : '') +
          (p.video ? '<span>Видео</span>' : '') + (p.views && !row ? '<span>' + esc(p.views) + ' просмотров</span>' : '') + '</div>' +
        '<div class="post__t">' + esc(p.title) + '</div>' +
        (row ? '' : '<div class="post__x">' + esc(p.excerpt) + '</div>') +
      '</div></a>';
  }

  function eventRow(e) {
    var d = new Date(e.date + 'T00:00:00');
    return '<div class="event">' +
      '<div class="event__date"><div class="event__d">' + d.getDate() + '</div><div class="event__m">' + MONTHS[d.getMonth()] + '</div></div>' +
      '<div class="event__body"><div class="event__t">' + esc(e.title) + '</div><div class="event__s">' + esc(e.subtitle) + '</div></div>' +
      (e.action ? '<button class="event__btn" data-action="' + esc(e.action) + '">' + esc(e.button || 'Хочу') + '</button>' : '') +
    '</div>';
  }

  function sectionHead(eyebrow, title, linkTab, linkText) {
    return '<div class="section__head"><div><div class="eyebrow">' + esc(eyebrow) + '</div><h2 class="section__title">' + esc(title) + '</h2></div>' +
      (linkTab ? '<button class="link" data-tab="' + linkTab + '">' + esc(linkText || 'Все') + '</button>' : '') + '</div>';
  }

  function reviewCard(r) {
    var ba = r.before ? '<div class="ba"><div class="ba__was"><b>Было</b>' + esc(r.before) + '</div><div class="ba__now"><b>Стало</b>' + esc(r.after) + '</div></div>' : '';
    return '<div class="card review"><div class="review__text">' + esc(r.text) + '</div>' + ba +
      '<div class="review__who"><div class="review__ava">' + esc(r.name.charAt(0)) + '</div><div><div class="review__name">' + esc(r.name) + '</div>' +
      (r.meta ? '<div class="review__meta">' + esc(r.meta) + '</div>' : '') + '</div></div></div>';
  }

  // ---------- Экраны ----------
  function viewHome() {
    var P = C.profile;
    var promo = C.promo;
    var pp = product(promo.product);
    var quick = C.quick.map(function (q) {
      return '<button class="quick__item" data-action="' + esc(q.action) + '"><span class="quick__icon">' + icon(q.icon) + '</span>' +
        '<span class="quick__t">' + esc(q.title) + '</span><span class="quick__s">' + esc(q.subtitle) + '</span></button>';
    }).join('');
    var top = C.posts.slice().filter(function (p) { return p.featured; });

    return '' +
      (C.demo ? '<div class="demo-bar">' + esc(C.demo) + '</div>' : '') +
      '<header class="hero">' +
        '<img class="hero__avatar" src="' + esc(img(P.avatar)) + '" alt="' + esc(P.name) + '">' +
        '<h1 class="hero__name">' + esc(P.name) + '</h1>' +
        '<div class="hero__role">' + esc(P.role) + '</div>' +
        '<p class="hero__tagline">' + esc(P.tagline) + '</p>' +
        '<div class="badges">' + P.badges.map(function (b) { return '<span class="badge">' + esc(b) + '</span>'; }).join('') + '</div>' +
        '<div class="stats">' + P.stats.map(function (s) { return '<div class="stat"><div class="stat__v">' + esc(s.value) + '</div><div class="stat__l">' + esc(s.label) + '</div></div>'; }).join('') + '</div>' +
      '</header>' +

      '<div class="section"><button class="promo" data-buy="' + esc(pp.id) + '">' +
        '<span class="promo__tag">' + esc(promo.tag) + '</span>' +
        '<div class="promo__title">' + esc(promo.title) + '</div>' +
        '<div class="promo__text">' + esc(promo.text) + '</div>' +
        '<div class="promo__row"><div class="promo__price">' + money(promo.price) + (promo.oldPrice ? '<s>' + money(promo.oldPrice) + '</s>' : '') + '</div>' +
        '<span class="promo__btn">' + esc(promo.button) + '</span></div>' +
      '</button></div>' +

      '<div class="section">' + sectionHead('Начните с этого', 'Чем могу помочь') + '<div class="quick">' + quick + '</div></div>' +

      '<div class="section">' + sectionHead('Расписание', 'Ближайшие события') +
        '<div class="card">' + C.events.map(eventRow).join('') + '</div></div>' +

      '<div class="section">' + sectionHead('Бесплатно', 'Популярные разборы', 'free') +
        '<div class="hscroll">' + top.map(function (p) { return postCard(p); }).join('') + '</div></div>' +

      '<div class="section">' + sectionHead('Отзывы', 'Результаты учеников', 'reviews') + reviewCard(C.reviews.text[0]) + '</div>' +

      '<div class="section">' + sectionHead('Связь', 'Я на связи') + '<div class="contacts">' +
        C.contacts.map(function (c) {
          return '<a class="card contact" href="' + esc(c.url) + '" data-link="' + esc(c.url) + '"><span class="contact__i">' + icon(c.icon) + '</span>' +
            '<span><div class="contact__t">' + esc(c.title) + '</div><div class="contact__s">' + esc(c.subtitle) + '</div></span><span class="contact__go">' + icon('arrow').replace('<svg', '<svg width="18" height="18"') + '</span></a>';
        }).join('') + '</div></div>' +
      '<p class="foot">' + esc(P.footer) + '</p>';
  }

  function viewFree() {
    var list = C.posts.filter(function (p) { return state.topic === 'all' || p.topic === state.topic; })
      .sort(function (a, b) { return (b.img ? 1 : 0) - (a.img ? 1 : 0); });
    var chips = [{ id: 'all', name: 'Все' }].concat(C.topics).map(function (t) {
      return '<button class="chip' + (state.topic === t.id ? ' is-active' : '') + '" data-topic="' + t.id + '">' + esc(t.name) + '</button>';
    }).join('');
    return '<div class="page-title"><div class="eyebrow">' + esc(C.free.eyebrow) + '</div><h1>' + esc(C.free.title) + '</h1><p>' + esc(C.free.text) + '</p></div>' +
      '<div class="chips">' + chips + '</div>' +
      '<div class="posts">' + list.map(function (p, i) { return postCard(p, i > 0 && !p.img); }).join('') + '</div>';
  }

  function viewProducts() {
    return '<div class="page-title"><div class="eyebrow">' + esc(C.shop.eyebrow) + '</div><h1>' + esc(C.shop.title) + '</h1><p>' + esc(C.shop.text) + '</p></div>' +
      '<div class="section" style="margin-top:16px">' + C.products.map(function (p) {
        var t = p.tariffs[0];
        return '<div class="card product">' +
          (p.img ? '<img class="product__img" src="' + esc(img(p.img)) + '" alt="" loading="lazy">' : '') +
          '<div class="product__top"><div><div class="product__kind">' + esc(p.kind) + '</div><div class="product__t">' + esc(p.title) + '</div></div>' +
          (p.badge ? '<span class="product__badge">' + esc(p.badge) + '</span>' : '') + '</div>' +
          '<div class="product__s">' + esc(p.subtitle) + '</div>' +
          '<ul class="features">' + p.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
          (t.price
            ? '<div class="product__foot"><div class="price">' + (p.tariffs.length > 1 ? '<small>от </small>' : '') + money(t.price) +
                (t.period ? '<small> / ' + esc(t.period) + '</small>' : '') + (t.oldPrice ? '<s>' + money(t.oldPrice) + '</s>' : '') + '</div>' +
                '<button class="btn" data-buy="' + esc(p.id) + '">' + esc(p.button || 'Купить') + '</button></div>'
            // Цена ещё не объявлена — собираем предзапись
            : '<div class="product__foot"><div class="price"><small>Предзапись открыта</small></div>' +
                '<button class="btn" data-action="lead:' + esc('Курс «' + p.title + '»') + '">' + esc(p.button || 'Записаться') + '</button></div>') +
        '</div>';
      }).join('') + '</div>';
  }

  function viewReviews() {
    return '<div class="page-title"><div class="eyebrow">Отзывы</div><h1>' + esc(C.reviewsTitle) + '</h1><p>' + esc(C.reviewsText) + '</p></div>' +
      '<div class="section" style="margin-top:16px"><div class="reviews">' + C.reviews.text.map(reviewCard).join('') + '</div></div>' +
      '<div class="section">' + sectionHead('Из чата Клуба', 'Сообщения участников') +
        '<div class="shots">' + C.reviews.shots.map(function (s) { return '<div class="shot"><img src="' + esc(img(s)) + '" alt="Отзыв" loading="lazy"></div>'; }).join('') + '</div></div>' +
      '<div class="section"><button class="btn btn--ghost btn--block" data-link="' + esc(C.reviews.more) + '">Все отзывы в Telegram</button></div>';
  }

  var TABS = [
    { id: 'home', name: 'Главная', icon: 'home', render: viewHome },
    { id: 'free', name: 'Бесплатно', icon: 'play', render: viewFree },
    { id: 'shop', name: 'Клуб и курсы', icon: 'bag', render: viewProducts },
    { id: 'reviews', name: 'Отзывы', icon: 'star', render: viewReviews }
  ];

  function render() {
    var tab = TABS.filter(function (t) { return t.id === state.tab; })[0];
    var view = $('#view');
    view.innerHTML = tab.render();
    view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    $('#tabs').innerHTML = TABS.map(function (t) {
      return '<button class="tab' + (t.id === state.tab ? ' is-active' : '') + '" data-tab="' + t.id + '">' + icon(t.icon) + '<span>' + esc(t.name) + '</span></button>';
    }).join('');
    $('#fab').textContent = C.fab;
    $('#fab').hidden = state.tab === 'shop';
  }

  function go(tab) {
    if (tab === state.tab) return;
    state.tab = tab;
    haptic();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Шторки: заявка и оплата ----------
  function openSheet(html) {
    var root = $('#sheet-root');
    root.innerHTML = '<div class="overlay" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet__grip"></div>' +
      '<button class="sheet__close" data-close aria-label="Закрыть">' + icon('close').replace('<svg', '<svg width="18" height="18"') + '</button>' + html + '</div>';
    document.body.style.overflow = 'hidden';
    if (tg) { tg.BackButton.show(); tg.BackButton.onClick(closeSheet); }
  }
  function closeSheet() {
    $('#sheet-root').innerHTML = '';
    document.body.style.overflow = '';
    if (tg) { tg.BackButton.offClick(closeSheet); tg.BackButton.hide(); }
  }

  function tgUser() { return tg && tg.initDataUnsafe && tg.initDataUnsafe.user; }

  function leadSheet(topic) {
    var L = C.lead;
    var u = tgUser();
    var name = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : '';
    var nick = u && u.username ? '@' + u.username : '';
    openSheet('<h2>' + esc(L.title) + '</h2><p class="sheet__sub">' + esc(L.text) + '</p>' +
      '<form id="lead-form">' +
        '<label class="field"><span>Тема</span><select name="topic">' + L.topics.map(function (t) {
          return '<option' + (t === topic ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field"><span>Как вас зовут</span><input name="name" required value="' + esc(name) + '" placeholder="Имя"></label>' +
        '<label class="field"><span>Telegram или телефон</span><input name="contact" required value="' + esc(nick) + '" placeholder="@username или +7…"></label>' +
        '<label class="field"><span>Что беспокоит</span><textarea name="msg" rows="3" placeholder="' + esc(L.placeholder) + '"></textarea></label>' +
        '<button class="btn btn--block" type="submit">' + esc(L.button) + '</button>' +
        '<p class="note">' + esc(L.note) + '</p>' +
      '</form>');
    $('#lead-form').addEventListener('submit', function (e) {
      e.preventDefault();
      haptic('medium');
      // В рабочей версии заявка уходит эксперту ботом в Telegram
      $('.sheet').innerHTML = '<div class="sheet__grip"></div><div class="success"><div class="success__i">' + icon('check') + '</div>' +
        '<h2 style="padding:0">' + esc(L.doneTitle) + '</h2><p class="sheet__sub">' + esc(L.doneText) + '</p>' +
        '<div class="demo-note">Демо: в рабочей версии заявка сразу приходит эксперту в Telegram с именем, контактом и темой.</div>' +
        '<button class="btn btn--block" data-close>Хорошо</button></div>';
    });
  }

  function buySheet(id) {
    var p = product(id);
    if (!p.tariffs[0].price) { leadSheet('Курс «' + p.title + '»'); return; }
    var sel = 0;
    function draw() {
      var t = p.tariffs[sel];
      $('.sheet-body').innerHTML =
        '<div class="options">' + p.tariffs.map(function (x, i) {
          return '<button type="button" class="option' + (i === sel ? ' is-active' : '') + '" data-tariff="' + i + '"><span class="option__radio"></span>' +
            '<span><div class="option__t">' + esc(x.name) + '</div>' + (x.note ? '<div class="option__s">' + esc(x.note) + '</div>' : '') + '</span>' +
            '<span class="option__p">' + money(x.price) + '</span></button>';
        }).join('') + '</div>' +
        '<label class="field"><span>Email для чека и доступа</span><input id="buy-email" type="email" placeholder="you@mail.ru"></label>' +
        '<button class="btn btn--block" id="pay">Оплатить ' + money(t.price) + '</button>' +
        '<p class="note">Карты РФ, СБП, рассрочка · Оплата защищена</p>';
      Array.prototype.forEach.call(document.querySelectorAll('[data-tariff]'), function (b) {
        b.addEventListener('click', function () { sel = +b.dataset.tariff; haptic(); draw(); });
      });
      $('#pay').addEventListener('click', function () {
        haptic('medium');
        $('.sheet').innerHTML = '<div class="sheet__grip"></div><div class="success"><div class="success__i">' + icon('check') + '</div>' +
          '<h2 style="padding:0">Готово к оплате</h2><p class="sheet__sub">' + esc(p.title) + ' · ' + esc(t.name) + ' · ' + money(t.price) + '</p>' +
          '<div class="demo-note">Демо: здесь открывается оплата Prodamus в одно касание. После оплаты бот сразу выдаёт доступ и добавляет в чат Клуба.</div>' +
          '<button class="btn btn--block" data-close>Понятно</button></div>';
      });
    }
    openSheet('<h2>' + esc(p.title) + '</h2><p class="sheet__sub">' + esc(p.checkout || p.subtitle) + '</p><div class="sheet-body"></div>');
    draw();
  }

  // ---------- События ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tab],[data-topic],[data-buy],[data-action],[data-link],[data-close]');
    if (!el) return;
    if (el.hasAttribute('data-close')) { closeSheet(); return; }
    if (el.dataset.tab) { go(el.dataset.tab); return; }
    if (el.dataset.topic) { state.topic = el.dataset.topic; haptic(); render(); return; }
    if (el.dataset.buy) { buySheet(el.dataset.buy); return; }
    if (el.dataset.action) {
      var a = el.dataset.action.split(':');
      if (a[0] === 'buy') buySheet(a[1]);
      else if (a[0] === 'lead') leadSheet(a[1]);
      else if (a[0] === 'tab') go(a[1]);
      else if (a[0] === 'remind') { haptic('medium'); toast('Напомню за час до начала'); }
      return;
    }
    if (el.dataset.link) { e.preventDefault(); openLink(el.dataset.link); }
  });
  $('#fab').addEventListener('click', function () { leadSheet(); });

  applyTheme();
  render();
})();
