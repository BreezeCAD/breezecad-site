/* Блок «Скачать»: система → вариант, актуальная версия и предыдущие выпуски.
   Данные — data/releases.json (его обновляет Action sync-data), только с этого же сайта.
   Без JS остаются статичные карточки со ссылками releases/latest/download/…  */
(function () {
  var box = document.getElementById('dl');
  if (!box || !window.fetch) return;
  var EN = document.documentElement.lang === 'en';
  var ROOT = box.getAttribute('data-root') || '';

  var T = EN ? {
    rec: 'recommended', get: 'Download', mb: 'MB', prev: 'Previous versions', all: 'All releases on GitHub ↗',
    whatsnew: 'What’s new ↗', close: 'Close', current: 'current', none: 'Nothing for this system in this release.',
    os: {
      windows: ['Windows', '10/11, 64-bit'], macos: ['macOS', '15+, Apple Silicon'],
      linux: ['Linux', 'x86_64'], android: ['Android', '9+, ARM 64-bit']
    },
    v: {
      'windows.offline': ['Offline installer', 'Everything in one file — installs without internet. File associations and previews in Explorer.'],
      'windows.online': ['Online installer', 'A tiny file that downloads only what you need, e.g. your system language.'],
      'windows.portable': ['Portable', 'Unzip and work — no installation, runs from a USB stick. Russian and English.'],
      'macos.dmg': ['Disk image (.dmg)', 'Open it and drag BreezeCAD to Applications.'],
      'macos.zip': ['Archive (.zip)', 'Unzip and run.'],
      'linux.offline': ['Offline installer', 'One file, installs without internet. Make it executable and run.'],
      'linux.online': ['Online installer', 'A tiny file that downloads only what you need.'],
      'linux.targz': ['Archive (.tar.gz)', 'Unpack and run, no installation.'],
      'android.apk': ['APK', 'Install the file; updates install over the old version.']
    }
  } : {
    rec: 'рекомендуем', get: 'Скачать', mb: 'МБ', prev: 'Предыдущие версии', all: 'Все выпуски на GitHub ↗',
    whatsnew: 'Что нового ↗', close: 'Закрыть', current: 'текущая', none: 'Для этой системы в выпуске ничего нет.',
    os: {
      windows: ['Windows', '10/11, 64-бит'], macos: ['macOS', '15+, Apple Silicon'],
      linux: ['Linux', 'x86_64'], android: ['Android', '9+, ARM 64-бит']
    },
    v: {
      'windows.offline': ['Офлайн-установщик', 'Всё в одном файле — ставится без интернета. Ассоциации файлов и превью в Проводнике.'],
      'windows.online': ['Онлайн-установщик', 'Маленький файл: докачивает только нужное — например, язык системы.'],
      'windows.portable': ['Портативная', 'Распаковали — и работаете: без установки, хоть с флешки. Русский и английский.'],
      'macos.dmg': ['Образ диска (.dmg)', 'Откройте и перетащите BreezeCAD в «Программы».'],
      'macos.zip': ['Архив (.zip)', 'Распакуйте и запускайте.'],
      'linux.offline': ['Офлайн-установщик', 'Один файл, ставится без интернета. Сделайте исполняемым и запустите.'],
      'linux.online': ['Онлайн-установщик', 'Маленький файл: докачивает только нужное.'],
      'linux.targz': ['Архив tar.gz', 'Распакуйте и запускайте, без установки.'],
      'android.apk': ['APK', 'Установите файл; обновления ставятся поверх старой версии.']
    }
  };
  var ORDER = ['windows', 'macos', 'linux', 'android'];

  function guessOS() {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) return 'macos';
    if (/Linux|X11/i.test(ua)) return 'linux';
    return 'windows';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function size(b) { return Math.max(1, Math.round(b / 1048576)) + ' ' + T.mb; }
  function ext(name) {
    var m = /\.(tar\.gz|exe|zip|dmg|apk)$/.exec(name);
    return m ? m[1] : (/Setup-linux/.test(name) ? 'bin' : '');
  }

  fetch(ROOT + 'data/releases.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(build)
    .catch(function () { /* остаются статичные карточки */ });

  function build(data) {
    var rels = data.releases || [];
    if (!rels.length) return;
    var cur = rels[0];
    var oses = ORDER.filter(function (o) { return cur.variants[o]; });
    if (!oses.length) return;
    var pick = guessOS();
    if (oses.indexOf(pick) < 0) pick = oses[0];

    var tabs = el('div', 'dl-os');
    tabs.setAttribute('role', 'tablist');
    var panel = el('div', 'dl-vars');
    panel.setAttribute('role', 'tabpanel');
    panel.id = 'dl-panel';

    oses.forEach(function (o) {
      var b = el('button', 'dl-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'dl-panel');
      b.dataset.os = o;
      b.appendChild(el('span', 'dl-tab-n', T.os[o][0]));
      b.appendChild(el('span', 'dl-tab-s', T.os[o][1]));
      b.addEventListener('click', function () { show(o, true); });
      tabs.appendChild(b);
    });

    function show(o, focus) {
      pick = o;
      Array.prototype.forEach.call(tabs.children, function (b) {
        var on = b.dataset.os === o;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      panel.textContent = '';
      var vars = cur.variants[o] || {};
      var keys = Object.keys(vars);
      keys.forEach(function (k, i) {
        var f = vars[k], txt = T.v[o + '.' + k] || [k, ''];
        var c = el('div', 'dl-var' + (i === 0 && keys.length > 1 ? ' rec' : ''));
        var head = el('div', 'dl-var-h');
        head.appendChild(el('span', 'dl-var-n', txt[0]));
        if (i === 0 && keys.length > 1) head.appendChild(el('span', 'dl-badge mono', T.rec));
        c.appendChild(head);
        c.appendChild(el('p', 'dl-var-d', txt[1]));
        c.appendChild(el('span', 'dl-var-f mono', (ext(f.name) ? ext(f.name) + ' · ' : '') + size(f.size)));
        var a = el('a', 'btn ' + (i === 0 ? 'btn-blue' : 'btn-ghost'), T.get);
        a.href = f.url;
        a.setAttribute('download', '');
        c.appendChild(a);
        panel.appendChild(c);
      });
      panel.style.setProperty('--n', String(Math.max(1, keys.length)));
    }

    tabs.addEventListener('keydown', function (e) {
      var i = oses.indexOf(pick);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        show(oses[(i + (e.key === 'ArrowRight' ? 1 : oses.length - 1)) % oses.length], true);
      }
    });

    box.textContent = '';
    box.appendChild(tabs);
    box.appendChild(panel);
    show(pick, false);

    // «Предыдущие версии» — окно со списком выпусков
    var dlg = document.getElementById('dl-prev');
    var list = dlg && dlg.querySelector('.dl-prev-list');
    if (!dlg || !list || !dlg.showModal) return;
    rels.forEach(function (r, i) {
      var row = el('li', 'dl-rel');
      var h = el('div', 'dl-rel-h');
      h.appendChild(el('span', 'dl-rel-v mono', r.label));
      if (i === 0) h.appendChild(el('span', 'dl-badge mono', T.current));
      var d = new Date(r.date + 'T12:00:00Z');
      h.appendChild(el('span', 'dl-rel-d', d.toLocaleDateString(EN ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })));
      var notes = el('a', 'dl-rel-notes', T.whatsnew);
      notes.href = r.url; notes.target = '_blank'; notes.rel = 'noopener';
      h.appendChild(notes);
      row.appendChild(h);
      var files = el('div', 'dl-rel-f');
      ORDER.forEach(function (o) {
        var vs = r.variants[o];
        if (!vs) return;
        Object.keys(vs).forEach(function (k) {
          var a = el('a', 'dl-chip', T.os[o][0] + ' · ' + (T.v[o + '.' + k] || [k])[0]);
          a.href = vs[k].url;
          a.title = vs[k].name + ' · ' + size(vs[k].size);
          files.appendChild(a);
        });
      });
      row.appendChild(files);
      list.appendChild(row);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dl-prev]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); dlg.showModal(); });
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }
})();
