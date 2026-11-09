# Сайт BreezeCAD

Статический сайт BreezeCAD — без сборки, без фреймворков и без сторонних запросов из
браузера посетителя (всё, что страница подгружает, лежит на этом же сайте).
Публикуется через GitHub Pages из ветки `main` (корень репозитория). Языки — русский
(корень) и английский (`en/`).

| Файл | Что это |
| --- | --- |
| `index.html` | главная страница |
| `pain.html` | рубрика «Боль инженера» |
| `modules.html` | «Модули и библиотеки» — каталог из `data/registry-index.json` |
| `people.html` | люди проекта |
| `privacy.html` | политика конфиденциальности |
| `404.html` | страница «не найдено» (одна на оба языка) |
| `en/*.html` | английские версии тех же страниц |
| `data/releases.json` | выпуски BreezeCAD и варианты скачивания — **пишет Action, руками не править** |
| `data/registry-index.json` | каталог модулей из [BreezeCAD/registry](https://github.com/BreezeCAD/registry) — **пишет Action** |
| `scripts/sync_data.py` | обновляет `data/*.json` и вписывает версию и размеры в главную |
| `.github/workflows/sync-data.yml` | запускает его: раз в сутки, по событию, вручную |
| `assets/download.js`, `download.css` | блок «Скачать»: система → вариант, окно «Предыдущие версии» |
| `assets/catalog.js`, `catalog.css` | вкладки, поиск и фильтр по авторам в «Модулях и библиотеках» |
| `assets/pages.css` | общие стили внутренних страниц |
| `assets/part.js` | 3D-модель штуцера на первом экране (чистый WebGL) |
| `favicon.ico`, `favicon.svg`, `favicon-120.png` | значок сайта: `.ico` — для поисковиков и старых браузеров (роботы ищут его в корне), 120×120 — рекомендация Яндекса, SVG — для браузеров. `assets/apple-touch-icon.png`, `icon-192.png` — для телефонов |
| `assets/fonts/` | IBM Plex (OFL), урезанные до латиницы и кириллицы |
| `assets/img/` | скриншоты программы и фото авторов |

## Скачивание и версия

Версию и ссылки руками не правим. Action **sync-data** берёт список выпусков
`BreezeCAD/breezecad` (без пре-релизов) и каталог из `BreezeCAD/registry`, кладёт их в
`data/`, вписывает версию и размеры в элементы с `data-bz="…"` на главной (RU и EN) и
коммитит, если что-то изменилось.

- **Когда:** раз в сутки, по `repository_dispatch` (`breezecad-released`, `registry-updated`)
  и вручную (Actions → sync-data → Run workflow).
- **Варианты скачивания** определяются по точным именам файлов выпуска — список `VARIANTS`
  в `scripts/sync_data.py`. Нет файла в выпуске — нет варианта на сайте.
  - Windows: `BreezeCAD-Setup-offline.exe`, `BreezeCAD-Setup.exe`, `BreezeCAD-windows.zip`
  - macOS (15+, Apple Silicon): `BreezeCAD-macos.dmg`, `BreezeCAD-macos.zip`
  - Linux: `BreezeCAD-Setup-linux-offline`, `BreezeCAD-Setup-linux`, `BreezeCAD-linux.tar.gz`
  - Android: `BreezeCAD-android.apk`
- **Без JavaScript** блок показывает простые карточки со ссылками
  `releases/latest/download/<файл>`: они тоже всегда ведут на последний выпуск.

Чтобы сайт обновлялся сразу после выпуска, в CI основного репозитория после публикации
выпуска нужен шаг (токен — fine-grained PAT с `Contents: write` на `breezecad-site` и
`registry`, секрет `BZ_DISPATCH_TOKEN`):

```yaml
- name: Обновить сайт и каталог
  env:
    TOKEN: ${{ secrets.BZ_DISPATCH_TOKEN }}
  run: |
    [ -n "$TOKEN" ] || exit 0
    for repo in breezecad-site registry; do
      curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/BreezeCAD/$repo/dispatches" -d '{"event_type":"breezecad-released"}'
    done
```

## Английская версия

`en/` — обычные статичные страницы с путями `../assets/…`. Правите русскую страницу —
поправьте и английскую. Переключатель RU/EN в шапке ведёт на ту же страницу на другом
языке; на телефоне он спрятан, ссылка на другой язык есть в подвале.

## Правила

- Никаких фреймворков и сборки; никаких запросов из браузера к чужим доменам.
- Стиль — «умный минимализм»; анимации — только мягкие, с учётом `prefers-reduced-motion`.
- На сайте не упоминаем другие САПР.
- Скриншоты — настоящие, из программы.
- После правок открыть сайт в браузере и проверить глазами (ПК и телефон, RU и EN).
