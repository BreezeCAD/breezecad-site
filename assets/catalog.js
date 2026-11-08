/* Раздел «Модули и библиотеки»: карточки из data/registry-index.json (его обновляет
   Action sync-data из BreezeCAD/registry). Вкладки, поиск, фильтр по авторам. */
(function () {
  var root = document.getElementById('cat');
  if (!root || !window.fetch) return;
  var EN = document.documentElement.lang === 'en';
  var L = EN ? 'en' : 'ru';
  var DATA = root.getAttribute('data-src') || 'data/registry-index.json';

  var T = EN ? {
    module: 'Modules', library: 'Libraries', module1: 'Module', library1: 'Library', search: 'Name, author or tag',
    authors: 'Authors', all: 'All authors', get: 'Download', from: 'BreezeCAD',
    source: 'Source ↗', bundled: 'built in', empty: 'Nothing found. Try another word or author.',
    open: 'Open', any: 'any system', mb: 'MB', kb: 'KB', reset: 'Reset filters', ver: 'v'
  } : {
    module: 'Модули', library: 'Библиотеки', module1: 'Модуль', library1: 'Библиотека', search: 'Название, автор, тег',
    authors: 'Авторы', all: 'Все авторы', get: 'Скачать', from: 'BreezeCAD',
    source: 'Исходники ↗', bundled: 'встроено в программу', empty: 'Ничего не нашлось. Попробуйте другое слово или автора.',
    open: 'Открыть', any: 'любая система', mb: 'МБ', kb: 'КБ', reset: 'Сбросить фильтры', ver: 'v'
  };
  var PLAT = { windows: 'Windows', linux: 'Linux', macos: 'macOS', android: 'Android', ios: 'iOS' };
  var LANGS = EN
    ? { be: 'Belarusian', cs: 'Czech', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', ja: 'Japanese', kk: 'Kazakh', ko: 'Korean', pl: 'Polish', pt: 'Portuguese', tr: 'Turkish', uk: 'Ukrainian', zh: 'Chinese' }
    : { be: 'Беларуская', cs: 'Čeština', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano', ja: '日本語', kk: 'Қазақша', ko: '한국어', pl: 'Polski', pt: 'Português', tr: 'Türkçe', uk: 'Українська', zh: '中文' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function tx(o) { return o ? (o[L] || o.ru || o.en || '') : ''; }
  function size(b) {
    if (!b) return '';
    return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' ' + T.kb : (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', EN ? '.' : ',') + ' ' + T.mb;
  }
  function fileLabel(f) {
    var m = /^lang-([a-z]{2})\.zip$/.exec(f.name);
    if (m && LANGS[m[1]]) return LANGS[m[1]];
    if (f.platform && PLAT[f.platform]) return PLAT[f.platform];
    return f.name;
  }
  function nfiles(n) {
    if (EN) return n === 1 ? 'file' : 'files';
    var a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? 'файл' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'файла' : 'файлов';
  }
  function prettyVer(v) { return v.replace(/^v/, '').replace(/-([a-z])/g, function (m, c) { return '-' + c.toUpperCase(); }); }
  function norm(s) { return (s || '').toLowerCase().replace(/ё/g, 'е'); }

  var state = { type: location.hash === '#libraries' ? 'library' : 'module', q: '', author: '' };

  fetch(DATA, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(build)
    .catch(function () { root.querySelector('.cat-wait') && (root.querySelector('.cat-wait').hidden = false); });

  function build(data) {
    var items = (data.items || []).filter(function (i) { return i && i.name && i.type; });
    root.textContent = '';

    // вкладки
    var tabs = el('div', 'cat-tabs');
    tabs.setAttribute('role', 'tablist');
    ['module', 'library'].forEach(function (t) {
      var n = items.filter(function (i) { return i.type === t; }).length;
      var b = el('button', 'cat-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.type = t;
      b.appendChild(document.createTextNode(T[t]));
      b.appendChild(el('span', 'cat-count mono', String(n)));
      b.addEventListener('click', function () {
        state.type = t; state.author = state.author && authorsOf(t).indexOf(state.author) < 0 ? '' : state.author;
        history.replaceState(null, '', t === 'library' ? '#libraries' : '#modules');
        render();
      });
      tabs.appendChild(b);
    });

    // поиск и авторы
    var tools = el('div', 'cat-tools');
    var search = el('input', 'cat-search');
    search.type = 'search';
    search.placeholder = T.search;
    search.setAttribute('aria-label', T.search);
    search.addEventListener('input', function () { state.q = search.value; renderList(); });
    var authors = el('div', 'cat-authors');
    authors.setAttribute('role', 'group');
    authors.setAttribute('aria-label', T.authors);
    tools.appendChild(search);
    tools.appendChild(authors);

    var list = el('div', 'cat-list');
    list.setAttribute('aria-live', 'polite');

    root.appendChild(tabs);
    root.appendChild(tools);
    root.appendChild(list);

    function authorsOf(t) {
      var seen = {};
      items.forEach(function (i) { if (i.type === t) seen[tx(i.author)] = 1; });
      return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, L); });
    }

    function render() {
      Array.prototype.forEach.call(tabs.children, function (b) {
        var on = b.dataset.type === state.type;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      authors.textContent = '';
      [''].concat(authorsOf(state.type)).forEach(function (a) {
        var c = el('button', 'cat-chip' + (state.author === a ? ' on' : ''), a || T.all);
        c.type = 'button';
        c.setAttribute('aria-pressed', state.author === a ? 'true' : 'false');
        c.addEventListener('click', function () { state.author = a; render(); });
        authors.appendChild(c);
      });
      renderList();
    }

    function renderList() {
      var q = norm(state.q).trim();
      var shown = items.filter(function (i) {
        if (i.type !== state.type) return false;
        if (state.author && tx(i.author) !== state.author) return false;
        if (!q) return true;
        var hay = norm([tx(i.name), tx(i.description), tx(i.author), i.id, (i.tags || []).join(' '),
          i.name.ru, i.name.en, i.author.ru, i.author.en].join(' '));
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      });
      list.textContent = '';
      if (!shown.length) {
        var e = el('div', 'cat-empty');
        e.appendChild(el('p', null, T.empty));
        var r = el('button', 'btn btn-ghost', T.reset);
        r.type = 'button';
        r.addEventListener('click', function () { state.q = ''; state.author = ''; search.value = ''; render(); });
        e.appendChild(r);
        list.appendChild(e);
        return;
      }
      shown.forEach(function (i) { list.appendChild(card(i)); });
    }

    render();
  }

  function card(i) {
    var c = el('article', 'cat-card');
    c.id = 'm-' + i.id;
    var top = el('div', 'cat-top');
    top.appendChild(el('span', 'cat-kind mono', i.type === 'library' ? T.library1 : T.module1));
    if (i.bundled) top.appendChild(el('span', 'cat-badge mono', T.bundled));
    c.appendChild(top);
    c.appendChild(el('h3', 'cat-name', tx(i.name)));
    c.appendChild(el('p', 'cat-author', tx(i.author)));
    c.appendChild(el('p', 'cat-desc', tx(i.description)));
    if (i.tags && i.tags.length) {
      var tags = el('div', 'cat-tags');
      i.tags.forEach(function (t) { tags.appendChild(el('span', 'cat-tag', '#' + t)); });
      c.appendChild(tags);
    }
    var meta = el('div', 'cat-meta mono');
    var bits = [];
    if (i.version && i.version !== '—') bits.push(T.ver + prettyVer(i.version));
    bits.push('BreezeCAD ' + i.minBreezeCAD + '+');
    if (i.license) bits.push(i.license);
    meta.textContent = bits.join(' · ');
    c.appendChild(meta);

    var act = el('div', 'cat-act');
    var files = i.files || [];
    if (files.length === 1) {
      var a = el('a', 'btn btn-blue', /\/generate$/.test(files[0].url) ? T.open : T.get);
      a.href = files[0].url;
      if (/\/generate$/.test(files[0].url)) { a.target = '_blank'; a.rel = 'noopener'; a.textContent = files[0].name + ' ↗'; }
      if (files[0].size) a.title = files[0].name + ' · ' + size(files[0].size);
      act.appendChild(a);
      if (files[0].size) act.appendChild(el('span', 'cat-size mono', size(files[0].size)));
    } else if (files.length > 1) {
      var d = el('details', 'cat-files');
      var s = el('summary', 'btn btn-blue', T.get + ' · ' + files.length + ' ' + nfiles(files.length));
      d.appendChild(s);
      var ul = el('ul');
      files.forEach(function (f) {
        var li = el('li');
        var fa = el('a', null, fileLabel(f));
        fa.href = f.url;
        fa.title = f.name;
        li.appendChild(fa);
        if (f.size) li.appendChild(el('span', 'mono', size(f.size)));
        ul.appendChild(li);
      });
      d.appendChild(ul);
      act.appendChild(d);
    }
    var src = i.homepage || (i.source && i.source.url);
    if (src) {
      var sa = el('a', 'cat-src', T.source);
      sa.href = src; sa.target = '_blank'; sa.rel = 'noopener';
      act.appendChild(sa);
    }
    c.appendChild(act);
    return c;
  }
})();
