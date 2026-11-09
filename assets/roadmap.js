/* Дорожная карта: листья-модули растут сами из каталога (data/registry-index.json).
   #rm       — дерево на roadmap.html: модуль крепится к выпуску, с которого работает (minBreezeCAD).
   #rm-fresh — срез на главной: три самых свежих модуля или библиотеки.
   Без JavaScript остаются листья, вписанные в страницу. */
(function () {
  var tree = document.getElementById('rm');
  var fresh = document.getElementById('rm-fresh');
  var host = tree || fresh;
  if (!host || !window.fetch) return;
  var EN = document.documentElement.lang === 'en';

  function ver(s) { return String(s || '0').replace(/[^0-9.]/g, '').split('.').map(Number); }
  function cmp(a, b) {
    a = ver(a); b = ver(b);
    for (var i = 0; i < Math.max(a.length, b.length); i++) { var d = (a[i] || 0) - (b[i] || 0); if (d) return d; }
    return 0;
  }
  function tx(o) { return o ? (EN ? o.en || o.ru : o.ru || o.en) || '' : ''; }
  function leaf(it) {
    var a = document.createElement('a');
    a.className = 'rm-leaf' + (it.type === 'library' ? ' lib' : '');
    a.setAttribute('data-id', it.id);
    a.href = 'modules.html#m-' + encodeURIComponent(it.id);
    var i = document.createElement('i');
    var s = document.createElement('span');
    var b = document.createElement('b');
    b.textContent = tx(it.short) || tx(it.name) || it.id;
    var sm = document.createElement('small');
    sm.textContent = tx(it.author) + (it.bundled ? (EN ? ' · bundled' : ' · встроена') : '');
    s.appendChild(b); s.appendChild(sm);
    a.appendChild(i); a.appendChild(s);
    return a;
  }

  fetch(host.getAttribute('data-src') || 'data/registry-index.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      var items = (d.items || []).filter(function (i) { return i && i.id && i.name; });

      if (tree) {
        var rows = [].slice.call(tree.querySelectorAll('li[data-ver]'));
        items.forEach(function (it) {
          if (tree.querySelector('.rm-leaf[data-id="' + it.id + '"]')) return;
          var row = rows[0];
          rows.forEach(function (r) { if (cmp(r.getAttribute('data-ver'), it.minBreezeCAD) <= 0) row = r; });
          if (row) row.querySelector('.rm-leaves').appendChild(leaf(it));
        });
      }

      if (fresh) {
        var top = items.filter(function (i) { return i.published; })
          .sort(function (a, b) { return a.published < b.published ? 1 : a.published > b.published ? -1 : 0; })
          .slice(0, 3);
        if (!top.length) return;
        [].slice.call(fresh.querySelectorAll('.rm-leaf')).forEach(function (n) { n.remove(); });
        top.forEach(function (it) { fresh.appendChild(leaf(it)); });
      }
    })
    .catch(function () {});
})();
